use crate::commands::helpers::{command, hermes_bin};
use crate::crypto::{encryption, key_manager};
use crate::database::models as db;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

fn ensure_key() -> Result<[u8; 32], String> {
    if key_manager::get_cached_key().is_some() {
        return key_manager::get_cached_key().ok_or("Encryption key not available".to_string());
    }
    key_manager::init_or_load_key(None)
}

fn encrypt_api_key(plain: &str) -> String {
    if plain.is_empty() {
        return String::new();
    }
    match ensure_key().and_then(|k| encryption::encrypt_string(plain, &k)) {
        Ok(enc) => enc,
        Err(e) => {
            log::warn!("Failed to encrypt API key, storing as plaintext: {}", e);
            plain.to_string()
        }
    }
}

pub(crate) fn decrypt_api_key(stored: &str) -> String {
    if stored.is_empty() || !encryption::is_encrypted(stored) {
        return stored.to_string();
    }
    match ensure_key().and_then(|k| encryption::decrypt_string(stored, &k)) {
        Ok(plain) => plain,
        Err(e) => {
            log::warn!("Failed to decrypt API key: {}", e);
            stored.to_string()
        }
    }
}

#[tauri::command]
pub async fn list_providers(app: AppHandle, locale: Option<String>) -> Result<Vec<db::Provider>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, value, base_url, api_key_env, api_key, icon, is_builtin, sort_order, created_at, updated_at FROM providers ORDER BY sort_order ASC, created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let loc = locale.as_deref().unwrap_or("zh-CN");
    let providers_data = crate::database::seeds::load_providers();

    Ok(rows.into_iter().map(|(id, name, value, base_url, api_key_env, api_key, icon, is_builtin, sort_order, created_at, updated_at)| {
        let is_builtin_flag = is_builtin != 0;
        let resolved_name = if is_builtin_flag {
            let seed_id = id.strip_prefix("builtin_").unwrap_or(&id);
            providers_data.providers.iter()
                .find(|p| p.value == seed_id)
                .map(|p| crate::database::seeds::resolve_localized(&p.name, loc).to_string())
                .unwrap_or(name)
        } else {
            name
        };
        let decrypted_key = decrypt_api_key(&api_key);
        db::Provider {
            id, name: resolved_name, value, base_url, api_key_env, api_key: decrypted_key, icon, is_builtin: is_builtin_flag, sort_order, created_at, updated_at,
        }
    }).collect())
}

#[tauri::command]
pub async fn create_provider(
    app: AppHandle,
    req: db::CreateProviderRequest,
) -> Result<db::Provider, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM providers")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let api_key_env = req.api_key_env.as_deref().unwrap_or("").to_string();
    let api_key = req.api_key.as_deref().unwrap_or("").to_string();
    let encrypted_key = encrypt_api_key(&api_key);

    sqlx::query("INSERT INTO providers (id, name, value, base_url, api_key_env, api_key, icon, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', 0, ?, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&req.value)
        .bind(req.base_url.as_deref().unwrap_or(""))
        .bind(&api_key_env)
        .bind(&encrypted_key)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if !api_key_env.is_empty() && !api_key.is_empty() {
        if let Err(e) = write_hermes_env(&api_key_env, &api_key) {
            log::warn!("Failed to write API key to Hermes .env: {}", e);
        }
    }

    Ok(db::Provider {
        id, name: req.name, value: req.value,
        base_url: req.base_url.unwrap_or_default(),
        api_key_env,
        api_key,
        icon: String::new(),
        is_builtin: false, sort_order, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_provider(
    app: AppHandle,
    req: db::UpdateProviderRequest,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let provider: db::Provider = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, value, base_url, api_key_env, api_key, icon, is_builtin, sort_order, created_at, updated_at FROM providers WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, value, base_url, api_key_env, api_key, icon, is_builtin, sort_order, created_at, updated_at)| db::Provider {
        id, name, value, base_url, api_key_env, api_key: decrypt_api_key(&api_key), icon, is_builtin: is_builtin != 0, sort_order, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(provider.name);
    let base_url = req.base_url.unwrap_or(provider.base_url);
    let api_key_env = req.api_key_env.unwrap_or_else(|| provider.api_key_env.clone());
    let api_key = req.api_key.unwrap_or_else(|| provider.api_key.clone());
    let encrypted_key = encrypt_api_key(&api_key);

    sqlx::query("UPDATE providers SET name = ?, base_url = ?, api_key_env = ?, api_key = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&base_url)
        .bind(&api_key_env)
        .bind(&encrypted_key)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if !api_key_env.is_empty() && !api_key.is_empty() {
        if let Err(e) = write_hermes_env(&api_key_env, &api_key) {
            log::warn!("Failed to write API key to Hermes .env: {}", e);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_provider(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let is_builtin: bool = sqlx::query_scalar("SELECT is_builtin FROM providers WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map(|v: i64| v != 0)
        .map_err(|e| e.to_string())?;

    if is_builtin {
        return Err("Built-in providers cannot be deleted".to_string());
    }

    sqlx::query("DELETE FROM providers WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_provider_keys(app: AppHandle) -> Result<i64, String> {
    let pool = get_pool(&app)?;

    let env_path_output = command(&hermes_bin())
        .args(&["config", "env-path"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get env path: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    if env_path.is_empty() {
        return Ok(0);
    }

    if !std::path::Path::new(&env_path).exists() {
        return Ok(0);
    }

    let env_content = std::fs::read_to_string(&env_path)
        .map_err(|e| format!("Failed to read env file: {}", e))?;

    let mut env_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for line in env_content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim().to_string();
            let value = value.trim().trim_matches('"').trim_matches('\'').to_string();
            env_map.insert(key, value);
        }
    }

    let providers: Vec<(String, String, String)> = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, api_key_env, api_key FROM providers"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut synced: i64 = 0;
    for (id, api_key_env, current_key) in &providers {
        let decrypted_current = decrypt_api_key(current_key);
        if !api_key_env.is_empty() {
            if let Some(key_value) = env_map.get(api_key_env) {
                if decrypted_current.is_empty() && !key_value.is_empty() {
                    let encrypted_new = encrypt_api_key(key_value);
                    sqlx::query("UPDATE providers SET api_key = ? WHERE id = ?")
                        .bind(&encrypted_new)
                        .bind(id)
                        .execute(&pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    synced += 1;
                }
            }
        }
    }

    Ok(synced)
}

#[tauri::command]
pub async fn verify_provider_api_key(base_url: String, api_key: String) -> Result<String, String> {
    if base_url.is_empty() {
        return Err("API Base URL 未配置".to_string());
    }
    if api_key.is_empty() {
        return Err("API Key 未填写".to_string());
    }

    let models_url = format!("{}/models", base_url.trim_end_matches('/'));

    let response = reqwest::Client::new()
        .get(&models_url)
        .bearer_auth(&api_key)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("连接失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if status.as_u16() == 401 {
            return Err("API Key 无效或已过期 (401)".to_string());
        }
        if status.as_u16() == 403 {
            return Err("API Key 无访问权限 (403)".to_string());
        }
        return Err(format!("验证失败 ({}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if result.get("data").is_some() {
        let model_count = result["data"].as_array().map(|a| a.len()).unwrap_or(0);
        Ok(format!("ok:{}", model_count))
    } else if result.get("object").is_some() {
        Ok("ok:0".to_string())
    } else {
        Ok("ok:0".to_string())
    }
}

fn write_hermes_env(key: &str, value: &str) -> Result<(), String> {
    crate::commands::helpers::hermes_config_set(key, value)
}
