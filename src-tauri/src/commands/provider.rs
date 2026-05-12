use crate::commands::helpers::{command, hermes_bin};
use crate::db;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

#[tauri::command]
pub async fn list_providers(app: AppHandle) -> Result<Vec<db::Provider>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, value, base_url, api_key_env, api_key, is_builtin, sort_order, created_at, updated_at FROM providers ORDER BY sort_order ASC, created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, name, value, base_url, api_key_env, api_key, is_builtin, sort_order, created_at, updated_at)| db::Provider {
        id, name, value, base_url, api_key_env, api_key, is_builtin: is_builtin != 0, sort_order, created_at, updated_at,
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

    sqlx::query("INSERT INTO providers (id, name, value, base_url, api_key_env, api_key, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&req.value)
        .bind(req.base_url.as_deref().unwrap_or(""))
        .bind(&api_key_env)
        .bind(&api_key)
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

    let provider: db::Provider = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, value, base_url, api_key_env, api_key, is_builtin, sort_order, created_at, updated_at FROM providers WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, value, base_url, api_key_env, api_key, is_builtin, sort_order, created_at, updated_at)| db::Provider {
        id, name, value, base_url, api_key_env, api_key, is_builtin: is_builtin != 0, sort_order, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(provider.name);
    let base_url = req.base_url.unwrap_or(provider.base_url);
    let api_key_env = req.api_key_env.unwrap_or_else(|| provider.api_key_env.clone());
    let api_key = req.api_key.unwrap_or_else(|| provider.api_key.clone());

    sqlx::query("UPDATE providers SET name = ?, base_url = ?, api_key_env = ?, api_key = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&base_url)
        .bind(&api_key_env)
        .bind(&api_key)
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
        if !api_key_env.is_empty() {
            if let Some(key_value) = env_map.get(api_key_env) {
                if current_key.is_empty() && !key_value.is_empty() {
                    sqlx::query("UPDATE providers SET api_key = ? WHERE id = ?")
                        .bind(key_value)
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
    let env_path_output = command(&hermes_bin())
        .args(&["config", "env-path"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get env path: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    if env_path.is_empty() {
        return Err("Cannot get Hermes env file path".to_string());
    }

    if !std::path::Path::new(&env_path).exists() {
        if let Some(parent) = std::path::Path::new(&env_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&env_path, "")
            .map_err(|e| format!("Failed to create env file: {}", e))?;
    }

    let env_content = std::fs::read_to_string(&env_path)
        .map_err(|e| format!("Failed to read env file: {}", e))?;

    let mut lines: Vec<String> = env_content.lines().map(|s| s.to_string()).collect();
    let key_upper = key.to_uppercase();
    let mut key_found = false;

    for line in lines.iter_mut() {
        if let Some((k, _)) = line.split_once('=') {
            if k.trim().to_uppercase() == key_upper {
                *line = format!("{}={}", key, value);
                key_found = true;
                break;
            }
        }
    }

    if !key_found {
        lines.push(format!("{}={}", key, value));
    }

    let new_content = lines.join("\n");
    std::fs::write(&env_path, new_content)
        .map_err(|e| format!("Failed to write env file: {}", e))?;

    Ok(())
}
