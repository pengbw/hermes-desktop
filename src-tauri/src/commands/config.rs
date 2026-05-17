use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const GITHUB_REPO: &str = "hermes-desktop/hermes-desktop";

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

#[tauri::command]
pub async fn get_config(
    app: AppHandle,
    key: String,
) -> Result<Option<String>, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (Option<String>,)>("SELECT value FROM app_config WHERE key = ?")
        .bind(&key)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(row.and_then(|(v,)| v))
}

#[tauri::command]
pub async fn set_config(
    app: AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)")
        .bind(&key)
        .bind(&value)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if key == "hermes_api_key" {
        crate::commands::helpers::sync_single_env_key(&app, "API_SERVER_KEY", &value);
    }

    Ok(())
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_temp_file(file_name: String, file_bytes: Vec<u8>) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("hermes-desktop");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let file_path = temp_dir.join(&file_name);
    std::fs::write(&file_path, &file_bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ModelItem {
    pub id: String,
    pub owned_by: Option<String>,
}

#[tauri::command]
pub async fn list_models(
    app: AppHandle,
    provider_value: String,
) -> Result<Vec<ModelItem>, String> {
    let pool = get_pool(&app)?;

    let (base_url, api_key): (String, String) = sqlx::query_as::<_, (String, String)>(
        "SELECT base_url, api_key FROM providers WHERE value = ?"
    )
    .bind(&provider_value)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Provider not found: {}", e))?;

    if base_url.is_empty() {
        return Err("Provider has no API Base URL configured".to_string());
    }

    let models_url = format!("{}/models", base_url.trim_end_matches('/'));

    let mut request = reqwest::Client::new()
        .get(&models_url)
        .timeout(std::time::Duration::from_secs(15));

    if !api_key.is_empty() {
        request = request.bearer_auth(&api_key);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to request model list: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to request model list ({}): {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse model list: {}", e))?;

    let models = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let id = item.get("id")?.as_str()?.to_string();
                    let owned_by = item.get("owned_by").and_then(|v| v.as_str()).map(|s| s.to_string());
                    Some(ModelItem { id, owned_by })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(models)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub latest_version: String,
    pub current_version: String,
    pub download_url: String,
    pub release_notes: String,
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateCheckResult, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);

    let response = reqwest::Client::new()
        .get(&url)
        .header("User-Agent", "Hermes-Desktop-Update-Checker")
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Update check failed with status: {}", response.status()));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse update response: {}", e))?;

    let latest_version = body
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    let release_notes = body
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let download_url = body
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let has_update = is_newer_version(&latest_version, CURRENT_VERSION);

    Ok(UpdateCheckResult {
        has_update,
        latest_version,
        current_version: CURRENT_VERSION.to_string(),
        download_url,
        release_notes,
    })
}

fn is_newer_version(remote: &str, local: &str) -> bool {
    let parse_parts = |v: &str| -> Vec<u32> {
        v.split('.')
            .filter_map(|s| s.parse::<u32>().ok())
            .collect()
    };
    let remote_parts = parse_parts(remote);
    let local_parts = parse_parts(local);

    for i in 0..remote_parts.len().max(local_parts.len()) {
        let r = remote_parts.get(i).unwrap_or(&0);
        let l = local_parts.get(i).unwrap_or(&0);
        if r > l {
            return true;
        }
        if r < l {
            return false;
        }
    }
    false
}
