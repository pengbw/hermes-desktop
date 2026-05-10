use crate::command;
use crate::db;
use base64::Engine;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::AppState>();
    Ok(state.db_pool.clone())
}

#[tauri::command]
pub async fn create_conversation(
    app: AppHandle,
    req: db::CreateConversationRequest,
) -> Result<db::Conversation, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO conversations (id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at) VALUES (?, ?, NULL, 'active', ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.title)
        .bind(req.source.as_deref().unwrap_or("main"))
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Conversation {
        id,
        title: req.title,
        hermes_session_id: None,
        status: "active".to_string(),
        source: Some(req.source.unwrap_or_else(|| "main".to_string())),
        last_active_at: now,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_conversations(
    app: AppHandle,
) -> Result<Vec<db::Conversation>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at FROM conversations WHERE source IS NULL OR source != 'avatar' ORDER BY updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conversations = rows
        .into_iter()
        .map(|(id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at)| db::Conversation {
            id,
            title,
            hermes_session_id,
            status,
            source,
            last_active_at,
            created_at,
            updated_at,
        })
        .collect();

    Ok(conversations)
}

#[tauri::command]
pub async fn update_conversation_session_id(
    app: AppHandle,
    id: String,
    hermes_session_id: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE conversations SET hermes_session_id = ?, last_active_at = ? WHERE id = ?")
        .bind(&hermes_session_id)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
pub async fn get_avatar_conversation(app: AppHandle) -> Result<Option<db::Conversation>, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at)| db::Conversation {
        id,
        title,
        hermes_session_id,
        status,
        source,
        last_active_at,
        created_at,
        updated_at,
    }))
}

#[tauri::command]
pub async fn create_avatar_conversation(app: AppHandle) -> Result<db::Conversation, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO conversations (id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at) VALUES (?, ?, NULL, 'active', 'avatar', ?, ?, ?)")
        .bind(&id)
        .bind("Digital Assistant Chat")
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Conversation {
        id,
        title: "Digital Assistant Chat".to_string(),
        hermes_session_id: None,
        status: "active".to_string(),
        source: Some("avatar".to_string()),
        last_active_at: now,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_avatar_messages(app: AppHandle) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;
    let conv = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, last_active_at, created_at, updated_at FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conv_id = match conv {
        Some((id, _, _, _, _, _, _, _)) => id,
        None => return Ok(vec![]),
    };

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, i64)>(
        "SELECT id, role, content, thinking, files, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conv_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, files, timestamp)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
            files: files.filter(|s| !s.is_empty()),
            timestamp,
        })
        .collect();

    Ok(messages)
}

/// Activate archived conversation (set status to active)
#[tauri::command]
pub async fn activate_conversation(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE conversations SET status = 'active', last_active_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Modify conversation title
#[tauri::command]
pub async fn rename_conversation(
    app: AppHandle,
    id: String,
    title: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("UPDATE conversations SET title = ? WHERE id = ?")
        .bind(&title)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Archive timed-out conversations (mark conversations unused for specified minutes as archived)
#[tauri::command]
pub async fn archive_stale_conversations(
    app: AppHandle,
    stale_minutes: i64,
) -> Result<i64, String> {
    let pool = get_pool(&app)?;
    let threshold = chrono::Utc::now().timestamp_millis() - stale_minutes * 60 * 1000;

    let result = sqlx::query("UPDATE conversations SET status = 'archived' WHERE status = 'active' AND last_active_at < ?")
        .bind(threshold)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() as i64)
}

#[tauri::command]
pub async fn delete_conversation(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM conversations WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_message(
    app: AppHandle,
    req: db::CreateMessageRequest,
) -> Result<db::Message, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO messages (id, conversation_id, role, content, thinking, files, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.conversation_id)
        .bind(&req.role)
        .bind(&req.content)
        .bind(req.thinking.as_deref().unwrap_or(""))
        .bind(req.files.as_deref().unwrap_or(""))
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Update conversation updated_at and last_active_at, and activate conversation
    sqlx::query("UPDATE conversations SET updated_at = ?, last_active_at = ?, status = 'active' WHERE id = ?")
        .bind(now)
        .bind(now)
        .bind(&req.conversation_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Message {
        id,
        role: req.role,
        content: req.content,
        thinking: req.thinking,
        files: req.files,
        timestamp: now,
    })
}

#[tauri::command]
pub async fn list_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, i64)>(
        "SELECT id, role, content, thinking, files, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conversation_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, files, timestamp)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
            files: files.filter(|s| !s.is_empty()),
            timestamp,
        })
        .collect();

    Ok(messages)
}

#[tauri::command]
pub async fn update_message(
    app: AppHandle,
    req: db::UpdateMessageRequest,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("UPDATE messages SET content = ? WHERE id = ?")
        .bind(&req.content)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_message(
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM messages WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
    Ok(())
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
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
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
            eprintln!("Warning: Failed to write API key to Hermes .env: {}", e);
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
            eprintln!("Warning: Failed to write API key to Hermes .env: {}", e);
        }
    }

    Ok(())
}

fn hermes_bin() -> String {
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let candidates = [
            format!("{}/.hermes/hermes-agent/venv/bin/hermes", home),
            format!("{}/.local/bin/hermes", home),
            "/usr/local/bin/hermes".to_string(),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
        if let Ok(output) = command("which").arg("hermes").output() {
            if output.status.success() {
                let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !p.is_empty() {
                    return p;
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{}\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe", local_appdata),
            format!("{}\\hermes\\hermes-agent\\.venv\\Scripts\\hermes.exe", local_appdata),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
    }
    "hermes".to_string()
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
pub async fn get_avatar_gestures(app: AppHandle) -> Result<Vec<db::AvatarGesture>, String> {
    let pool = get_pool(&app)?;
    let gestures = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures ORDER BY updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .collect();

    Ok(gestures)
}

#[tauri::command]
pub async fn create_avatar_gesture(
    app: AppHandle,
    req: db::CreateAvatarGestureRequest,
) -> Result<db::AvatarGesture, String> {
    let pool = get_pool(&app)?;
    let id = format!("gesture_{}", uuid::Uuid::new_v4());
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO avatar_gestures (id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(req.duration)
        .bind(req.look_at_x)
        .bind(req.look_at_y)
        .bind(req.tilt)
        .bind(&req.target_json)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let gesture = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .map_err(|e| e.to_string())?;

    Ok(gesture)
}

#[tauri::command]
pub async fn update_avatar_gesture(
    app: AppHandle,
    req: db::UpdateAvatarGestureRequest,
) -> Result<db::AvatarGesture, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let mut query = String::from("UPDATE avatar_gestures SET updated_at = ?");
    let mut args: sqlx::sqlite::SqliteArguments = Default::default();
    let _ = sqlx::Arguments::add(&mut args, now);

    if let Some(name) = &req.name {
        query.push_str(", name = ?");
        let _ = sqlx::Arguments::add(&mut args, name);
    }
    if let Some(duration) = req.duration {
        query.push_str(", duration = ?");
        let _ = sqlx::Arguments::add(&mut args, duration);
    }
    if let Some(look_at_x) = req.look_at_x {
        query.push_str(", look_at_x = ?");
        let _ = sqlx::Arguments::add(&mut args, look_at_x);
    }
    if let Some(look_at_y) = req.look_at_y {
        query.push_str(", look_at_y = ?");
        let _ = sqlx::Arguments::add(&mut args, look_at_y);
    }
    if let Some(tilt) = req.tilt {
        query.push_str(", tilt = ?");
        let _ = sqlx::Arguments::add(&mut args, tilt);
    }
    if let Some(target_json) = &req.target_json {
        query.push_str(", target_json = ?");
        let _ = sqlx::Arguments::add(&mut args, target_json);
    }

    query.push_str(" WHERE id = ?");
    let _ = sqlx::Arguments::add(&mut args, &req.id);

    sqlx::query_with(&query, args)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let gesture = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .map_err(|e| e.to_string())?;

    Ok(gesture)
}

#[tauri::command]
pub async fn delete_avatar_gesture(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    sqlx::query("DELETE FROM avatar_gestures WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileContent {
    pub name: String,
    pub path: String,
    pub is_image: bool,
    pub size: u64,
}

#[tauri::command]
pub async fn read_file_for_chat(path: String) -> Result<FileContent, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let metadata = std::fs::metadata(&path).map_err(|e| format!("Failed to read file info: {}", e))?;
    let size = metadata.len();

    if size > 10 * 1024 * 1024 {
        return Err("File size exceeds 10MB limit".to_string());
    }

    let ext = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let image_exts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
    let is_image = image_exts.contains(&ext.as_str());

    Ok(FileContent {
        name,
        path: path.clone(),
        is_image,
        size,
    })
}

#[tauri::command]
pub async fn prepare_temp_file(name: String, base64_content: String) -> Result<FileContent, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(&base64_content)
        .map_err(|e| format!("base64 decode failed: {}", e))?;

    if bytes.len() > 10 * 1024 * 1024 {
        return Err("File size exceeds 10MB limit".to_string());
    }

    let tmp = std::env::temp_dir().join(format!("hermes_upload_{}", name));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;

    let ext = std::path::Path::new(&name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let image_exts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
    let is_image = image_exts.contains(&ext.as_str());

    Ok(FileContent {
        name,
        path: tmp.to_string_lossy().to_string(),
        is_image,
        size: bytes.len() as u64,
    })
}

#[tauri::command]
pub async fn list_ai_roles(app: AppHandle) -> Result<Vec<db::AiRole>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin, created_at, updated_at FROM ai_roles ORDER BY sort_order ASC, created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin, created_at, updated_at)| db::AiRole {
        id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin: is_builtin != 0, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_ai_role(app: AppHandle, req: db::CreateAiRoleRequest) -> Result<db::AiRole, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM ai_roles")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let icon = req.icon.unwrap_or_default();
    let description = req.description.unwrap_or_default();
    let responsibilities = req.responsibilities.unwrap_or_default();
    let soul_content = req.soul_content.unwrap_or_default();
    let avatar_url = req.avatar_url.unwrap_or_default();
    let avatar_preset = req.avatar_preset.unwrap_or_default();
    let avatar_color = req.avatar_color.unwrap_or_default();

    sqlx::query("INSERT INTO ai_roles (id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&icon)
        .bind(&description)
        .bind(&responsibilities)
        .bind(&soul_content)
        .bind(&avatar_url)
        .bind(&avatar_preset)
        .bind(&avatar_color)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::AiRole {
        id, name: req.name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin: false, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_ai_role(app: AppHandle, req: db::UpdateAiRoleRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let role: db::AiRole = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin, created_at, updated_at FROM ai_roles WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin, created_at, updated_at)| db::AiRole {
        id, name, icon, description, responsibilities, soul_content, avatar_url, avatar_preset, avatar_color, sort_order, is_builtin: is_builtin != 0, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(role.name);
    let icon = req.icon.unwrap_or(role.icon);
    let description = req.description.unwrap_or(role.description);
    let responsibilities = req.responsibilities.unwrap_or(role.responsibilities);
    let soul_content = req.soul_content.unwrap_or(role.soul_content);
    let avatar_url = req.avatar_url.unwrap_or(role.avatar_url);
    let avatar_preset = req.avatar_preset.unwrap_or(role.avatar_preset);
    let avatar_color = req.avatar_color.unwrap_or(role.avatar_color);

    sqlx::query("UPDATE ai_roles SET name = ?, icon = ?, description = ?, responsibilities = ?, soul_content = ?, avatar_url = ?, avatar_preset = ?, avatar_color = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&icon)
        .bind(&description)
        .bind(&responsibilities)
        .bind(&soul_content)
        .bind(&avatar_url)
        .bind(&avatar_preset)
        .bind(&avatar_color)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_ai_role(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let is_builtin: bool = sqlx::query_scalar("SELECT is_builtin FROM ai_roles WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map(|v: i64| v != 0)
        .map_err(|e| e.to_string())?;
    if is_builtin {
        return Err("Cannot delete builtin role".to_string());
    }
    sqlx::query("DELETE FROM ai_roles WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<db::Project>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, String, String, i64, i64)>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at FROM projects ORDER BY is_favorite DESC, updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at)| db::Project {
        id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project(app: AppHandle, req: db::CreateProjectRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let workspace_root: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let workspace_root = workspace_root.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join("hermes-workspace").to_string_lossy().to_string())
            .unwrap_or_else(|| "./hermes-workspace".to_string())
    });

    let slug: String = req.name
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else if c == ' ' || c == '-' { '-' } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    let workspace_path = format!("{}/{}", workspace_root.trim_end_matches('/'), slug);

    let _ = std::fs::create_dir_all(&workspace_path);

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_default();
    let cover_image = req.cover_image.unwrap_or_default();
    let project_rule = req.project_rule.unwrap_or_default();

    sqlx::query("INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&description)
        .bind(&workspace_path)
        .bind(&icon)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Project {
        id, name: req.name, description, workspace_path, status: "active".to_string(), tag: "none".to_string(), icon, is_favorite: 0, cover_image, project_rule, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project(app: AppHandle, req: db::UpdateProjectRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let project: db::Project = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, String, String, i64, i64)>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at)| db::Project {
        id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(project.name);
    let description = req.description.unwrap_or(project.description);
    let status = req.status.unwrap_or(project.status);
    let tag = req.tag.unwrap_or(project.tag);
    let icon = req.icon.unwrap_or(project.icon);
    let is_favorite = req.is_favorite.map(|v| if v { 1i64 } else { 0i64 }).unwrap_or(project.is_favorite);
    let cover_image = req.cover_image.unwrap_or(project.cover_image);
    let project_rule = req.project_rule.unwrap_or(project.project_rule);

    sqlx::query("UPDATE projects SET name = ?, description = ?, status = ?, tag = ?, icon = ?, is_favorite = ?, cover_image = ?, project_rule = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(&status)
        .bind(&tag)
        .bind(&icon)
        .bind(is_favorite)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_members(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMember>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64)>(
        "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at)| db::ProjectMember {
        id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn add_project_member(app: AppHandle, req: db::CreateProjectMemberRequest) -> Result<db::ProjectMember, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_members WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let profile_name = req.profile_name.unwrap_or_default();
    let custom_soul = req.custom_soul.unwrap_or_default();
    let custom_responsibilities = req.custom_responsibilities.unwrap_or_default();

    sqlx::query("INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&profile_name)
        .bind(&custom_soul)
        .bind(&custom_responsibilities)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM ai_roles WHERE id = ?"
    )
    .bind(&req.role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((role_name,)) = role {
        let artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - 产出物", role_name);
        let _ = sqlx::query(
            "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, created_at, updated_at) VALUES (?, ?, ?, '', 'auto', ?, '', '', 'pending', ?, ?)"
        )
        .bind(&artifact_id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&artifact_title)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
    }

    Ok(db::ProjectMember {
        id, project_id: req.project_id, role_id: req.role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_member(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_members WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_workflows(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at,
    }).collect())
}

#[tauri::command]
pub async fn add_project_workflow(app: AppHandle, req: db::CreateProjectWorkflowRequest) -> Result<db::ProjectWorkflow, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_workflows WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let artifact_type = req.artifact_type.unwrap_or_default();
    let transition_type = req.transition_type.unwrap_or("auto_push".to_string());

    sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.from_role_id)
        .bind(&req.to_role_id)
        .bind(&artifact_type)
        .bind(&transition_type)
        .bind(sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectWorkflow {
        id, project_id: req.project_id, from_role_id: req.from_role_id, to_role_id: req.to_role_id, artifact_type, transition_type, sort_order, created_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_workflow(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_workflows WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_workflow_to_file(app: AppHandle, project_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let workflows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_dir = std::path::PathBuf::from(&workspace_path).join(".hermes");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("workflow.json");
    let workflow_data: Vec<serde_json::Value> = workflows.iter().map(|(id, pid, from, to, artifact, trans, sort, created)| {
        serde_json::json!({
            "id": id,
            "projectId": pid,
            "fromRoleId": from,
            "toRoleId": to,
            "artifactType": artifact,
            "transitionType": trans,
            "sortOrder": sort,
            "createdAt": created,
        })
    }).collect();

    let config = serde_json::json!({
        "version": "1.0",
        "projectId": project_id,
        "workflows": workflow_data,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_workflow_from_file(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_path = std::path::PathBuf::from(&workspace_path).join(".hermes").join("workflow.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "workflows": [] }));
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub async fn list_project_artifacts(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectArtifact>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, created_at, updated_at FROM project_artifacts WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, created_at, updated_at)| db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_artifact(app: AppHandle, req: db::CreateProjectArtifactRequest) -> Result<db::ProjectArtifact, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let task_id = req.task_id.unwrap_or_default();
    let artifact_type = req.artifact_type.unwrap_or_default();
    let title = req.title.unwrap_or_default();
    let file_path = req.file_path.unwrap_or_default();
    let content = req.content.unwrap_or_default();
    let status = req.status.unwrap_or("draft".to_string());

    sqlx::query("INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&task_id)
        .bind(&artifact_type)
        .bind(&title)
        .bind(&file_path)
        .bind(&content)
        .bind(&status)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectArtifact {
        id, project_id: req.project_id, role_id: req.role_id, task_id, artifact_type, title, file_path, content, status, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_artifact_status(app: AppHandle, id: String, status: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_artifacts SET status = ?, updated_at = ? WHERE id = ?")
        .bind(&status)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_messages(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMessage>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64)>(
        "SELECT id, project_id, role_id, content, message_type, created_at FROM project_messages WHERE project_id = ? ORDER BY created_at ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, content, message_type, created_at)| db::ProjectMessage {
        id, project_id, role_id, content, message_type, created_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_message(app: AppHandle, req: db::CreateProjectMessageRequest) -> Result<db::ProjectMessage, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let message_type = req.message_type.unwrap_or_else(|| "text".to_string());

    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(&message_type)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectMessage {
        id, project_id: req.project_id, role_id: req.role_id, content: req.content, message_type, created_at: now,
    })
}

