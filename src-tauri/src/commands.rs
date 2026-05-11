use crate::command;
use crate::db;
use base64::Engine;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeChunk {
    pub content: String,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub score: Option<f32>,
    pub kb_name: Option<String>,
    pub source_type: String,
}

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

    sqlx::query("INSERT INTO conversations (id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at) VALUES (?, ?, NULL, 'active', ?, NULL, ?, ?, ?)")
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
        kb_ids: None,
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
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at FROM conversations WHERE source IS NULL OR source != 'avatar' ORDER BY updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conversations = rows
        .into_iter()
        .map(|(id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at)| db::Conversation {
            id,
            title,
            hermes_session_id,
            status,
            source,
            kb_ids,
            last_active_at,
            created_at,
            updated_at,
        })
        .collect();

    Ok(conversations)
}

#[tauri::command]
pub async fn update_conversation_kb_ids(
    app: AppHandle,
    id: String,
    kb_ids: Option<String>,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE conversations SET kb_ids = ?, updated_at = ? WHERE id = ?")
        .bind(&kb_ids)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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
    let row = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at)| db::Conversation {
        id,
        title,
        hermes_session_id,
        status,
        source,
        kb_ids,
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

    sqlx::query("INSERT INTO conversations (id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at) VALUES (?, ?, NULL, 'active', 'avatar', NULL, ?, ?, ?)")
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
        kb_ids: None,
        last_active_at: now,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_avatar_messages(app: AppHandle) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;
    let conv = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conv_id = match conv {
        Some((id, _, _, _, _, _, _, _, _)) => id,
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

#[tauri::command]
pub async fn list_knowledge_bases(app: AppHandle) -> Result<Vec<db::KnowledgeBase>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_knowledge_base(app: AppHandle, req: db::CreateKnowledgeBaseRequest) -> Result<db::KnowledgeBase, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_else(|| "📚".to_string());
    let directories = req.directories.unwrap_or_else(|| "[]".to_string());
    let embedding_model = req.embedding_model.unwrap_or_else(|| "local".to_string());
    let retrieval_mode = req.retrieval_mode.unwrap_or_else(|| "off".to_string());
    let max_context_chunks = req.max_context_chunks.unwrap_or(8);
    let auto_retrieve = req.auto_retrieve.unwrap_or(false);

    sqlx::query("INSERT INTO knowledge_bases (id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0, 0, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&description)
        .bind(&icon)
        .bind(&directories)
        .bind(&embedding_model)
        .bind(&retrieval_mode)
        .bind(max_context_chunks)
        .bind(auto_retrieve as i64)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::KnowledgeBase {
        id, name: req.name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status: "ready".to_string(), file_count: 0, chunk_count: 0, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_knowledge_base(app: AppHandle, req: db::UpdateKnowledgeBaseRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(kb.name);
    let description = req.description.unwrap_or(kb.description);
    let icon = req.icon.unwrap_or(kb.icon);
    let directories = req.directories.unwrap_or(kb.directories);
    let embedding_model = req.embedding_model.unwrap_or(kb.embedding_model);
    let retrieval_mode = req.retrieval_mode.unwrap_or(kb.retrieval_mode);
    let max_context_chunks = req.max_context_chunks.unwrap_or(kb.max_context_chunks);
    let auto_retrieve = req.auto_retrieve.unwrap_or(kb.auto_retrieve);

    sqlx::query("UPDATE knowledge_bases SET name = ?, description = ?, icon = ?, directories = ?, embedding_model = ?, retrieval_mode = ?, max_context_chunks = ?, auto_retrieve = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(&icon)
        .bind(&directories)
        .bind(&embedding_model)
        .bind(&retrieval_mode)
        .bind(max_context_chunks)
        .bind(auto_retrieve as i64)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_knowledge_base(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM knowledge_files WHERE knowledge_base_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM knowledge_bases WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_knowledge_files(app: AppHandle, knowledge_base_id: String) -> Result<Vec<db::KnowledgeFile>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
        "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ? ORDER BY file_name ASC"
    )
    .bind(&knowledge_base_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
        id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn export_knowledge_base(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let files: Vec<db::KnowledgeFile> = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
        "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map(|rows| rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
        id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
    }).collect())
    .map_err(|e| e.to_string())?;

    let chunks: Vec<(String, String, String, i64, Option<Vec<u8>>, i64)> = sqlx::query_as(
        "SELECT id, knowledge_base_id, content, chunk_index, vector, token_count FROM knowledge_chunks WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let chunks_json: Vec<serde_json::Value> = chunks.into_iter().map(|(id, kb_id, content, chunk_index, vector, token_count)| {
        serde_json::json!({
            "id": id,
            "knowledge_base_id": kb_id,
            "content": content,
            "chunk_index": chunk_index,
            "has_vector": vector.is_some(),
            "token_count": token_count,
        })
    }).collect();

    Ok(serde_json::json!({
        "version": "1.0",
        "knowledge_base": {
            "name": kb.name,
            "description": kb.description,
            "icon": kb.icon,
            "directories": kb.directories,
            "embedding_model": kb.embedding_model,
            "retrieval_mode": kb.retrieval_mode,
            "max_context_chunks": kb.max_context_chunks,
            "auto_retrieve": kb.auto_retrieve,
        },
        "files": files.iter().map(|f| serde_json::json!({
            "file_path": f.file_path,
            "file_name": f.file_name,
            "file_ext": f.file_ext,
            "file_size": f.file_size,
            "chunk_count": f.chunk_count,
            "index_status": f.index_status,
        })).collect::<Vec<_>>(),
        "chunks": chunks_json,
        "exported_at": chrono::Utc::now().to_rfc3339(),
    }))
}

#[tauri::command]
pub async fn import_knowledge_base(app: AppHandle, data: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let import_data: serde_json::Value = serde_json::from_str(&data).map_err(|e| format!("解析导入数据失败: {}", e))?;

    let kb_info = &import_data["knowledge_base"];
    let name = kb_info["name"].as_str().unwrap_or("导入的知识库");
    let description = kb_info["description"].as_str().unwrap_or("");
    let icon = kb_info["icon"].as_str().unwrap_or("📚");
    let directories = kb_info["directories"].as_str().unwrap_or("[]");

    let new_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO knowledge_bases (id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&new_id)
        .bind(name)
        .bind(description)
        .bind(icon)
        .bind(directories)
        .bind(kb_info["embedding_model"].as_str().unwrap_or("local"))
        .bind(kb_info["retrieval_mode"].as_str().unwrap_or("auto"))
        .bind(kb_info["max_context_chunks"].as_i64().unwrap_or(8))
        .bind(if kb_info["auto_retrieve"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
        .bind("ready")
        .bind(import_data["files"].as_array().map(|a| a.len() as i64).unwrap_or(0))
        .bind(import_data["chunks"].as_array().map(|a| a.len() as i64).unwrap_or(0))
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| format!("创建知识库失败: {}", e))?;

    Ok(serde_json::json!({
        "id": new_id,
        "name": name,
    }))
}

#[tauri::command]
pub async fn preview_knowledge_file(app: AppHandle, file_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT file_path, file_name, file_ext FROM knowledge_files WHERE id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (file_path, file_name, file_ext) = row.ok_or("文件不存在")?;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在于磁盘".to_string());
    }

    let text_exts = ["md", "txt", "json", "csv", "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "c", "cpp", "h", "html", "css", "yaml", "yml", "toml", "xml", "properties", "sh", "bat", "sql", "rb", "php", "swift", "kt", "scala", "lua", "r", "dart", "vue", "svelte"];

    if text_exts.contains(&file_ext.to_lowercase().as_str()) {
        let content = std::fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;
        let preview: String = content.chars().take(5000).collect();
        Ok(serde_json::json!({
            "file_name": file_name,
            "file_path": file_path,
            "file_ext": file_ext,
            "type": "text",
            "content": preview,
            "truncated": content.len() > 5000
        }))
    } else {
        Ok(serde_json::json!({
            "file_name": file_name,
            "file_path": file_path,
            "file_ext": file_ext,
            "type": "binary",
            "content": null,
            "truncated": false
        }))
    }
}

#[tauri::command]
pub async fn get_file_chunks(app: AppHandle, file_id: String) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool(&app)?;
    let rows: Vec<(String, i64, String)> = sqlx::query_as(
        "SELECT id, chunk_index, content FROM knowledge_chunks WHERE file_id = ? ORDER BY chunk_index ASC"
    )
    .bind(&file_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, chunk_index, content)| {
        serde_json::json!({
            "id": id,
            "chunk_index": chunk_index,
            "content": content
        })
    }).collect())
}

#[tauri::command]
fn chunk_text(text: &str, max_chars: usize, overlap: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    if total <= max_chars {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < total {
        let end = std::cmp::min(start + max_chars, total);
        let slice: String = chars[start..end].iter().collect();
        chunks.push(slice);
        if end >= total {
            break;
        }
        start += max_chars - overlap;
    }
    chunks
}

fn read_file_content(path: &std::path::Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let binary_exts = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "zip", "rar", "7z", "gz", "tar", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "mp3", "mp4", "avi", "mov", "wav", "exe", "dll", "so", "dylib", "wasm"];
    if binary_exts.contains(&ext.as_str()) {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

async fn embed_text_cloud(base_url: &str, api_key: &str, model: &str, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let url = format!("{}/embeddings", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "input": texts,
        "encoding_format": "float"
    });
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("嵌入请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("嵌入API返回错误 ({}): {}", status, body));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析嵌入响应失败: {}", e))?;
    let data = json["data"].as_array().ok_or("嵌入响应缺少data字段")?;
    let mut vectors = Vec::new();
    for item in data {
        let embedding = item["embedding"].as_array().ok_or("嵌入响应缺少embedding字段")?;
        let vec: Vec<f32> = embedding.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect();
        vectors.push(vec);
    }
    Ok(vectors)
}

async fn embed_text_ollama(endpoint: &str, model: &str, text: &str) -> Result<Vec<f32>, String> {
    let url = format!("{}/api/embed", endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "input": text
    });
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama嵌入请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama嵌入API返回错误 ({}): {}", status, body));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析Ollama嵌入响应失败: {}", e))?;
    let embeddings = json["embeddings"].as_array().or_else(|| json["embedding"].as_array()).ok_or("Ollama嵌入响应缺少embeddings字段")?;
    if let Some(first) = embeddings.first() {
        let arr = first.as_array().or_else(|| Some(embeddings)).unwrap();
        return Ok(arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect());
    }
    Err("Ollama嵌入响应格式错误".to_string())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

fn vec_to_blob(vec: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vec.len() * 4);
    for &f in vec {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    let len = blob.len() / 4;
    let mut vec = Vec::with_capacity(len);
    for i in 0..len {
        let start = i * 4;
        if start + 4 <= blob.len() {
            let bytes: [u8; 4] = [blob[start], blob[start + 1], blob[start + 2], blob[start + 3]];
            vec.push(f32::from_le_bytes(bytes));
        }
    }
    vec
}

#[tauri::command]
pub async fn index_knowledge_base(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE knowledge_bases SET status = 'indexing', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "scanning", "current": 0, "total": 0, "file": ""
    }));

    let dirs: Vec<String> = serde_json::from_str(&kb.directories).unwrap_or_default();
    let mut all_files: Vec<(std::path::PathBuf, String, String, i64, i64)> = Vec::new();

    let supported_exts = ["md", "txt", "pdf", "docx", "json", "csv", "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "c", "cpp", "h", "html", "css", "yaml", "yml", "toml", "xml", "properties", "sh", "bat", "sql", "rb", "php", "swift", "kt", "scala", "lua", "r", "dart", "vue", "svelte"];

    let skip_dirs = ["node_modules", ".git", ".svn", ".hg", "target", "build", "dist", ".idea", ".vscode", "__pycache__", ".gradle", ".mvn", "vendor", "Pods", ".next", ".nuxt", "out", "bin", "obj"];

    fn scan_dir(path: &std::path::Path, supported: &[&str], skip: &[&str], files: &mut Vec<(std::path::PathBuf, String, String, i64, i64)>) {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_dir() {
                    let dir_name = file_path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if dir_name.starts_with('.') || skip.contains(&dir_name.as_str()) {
                        continue;
                    }
                    scan_dir(&file_path, supported, skip, files);
                } else if file_path.is_file() {
                    let ext = file_path.extension()
                        .map(|e| e.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    if !supported.contains(&ext.as_str()) {
                        continue;
                    }
                    let file_name = file_path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let metadata = std::fs::metadata(&file_path).unwrap_or_else(|_| std::fs::symlink_metadata(&file_path).unwrap());
                    let file_size = metadata.len() as i64;
                    let modified_at = metadata.modified()
                        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
                        .unwrap_or(0);
                    files.push((file_path, file_name, ext, file_size, modified_at));
                }
            }
        }
    }

    for dir_path in &dirs {
        let path = std::path::Path::new(dir_path);
        if !path.exists() || !path.is_dir() {
            continue;
        }
        scan_dir(path, &supported_exts, &skip_dirs, &mut all_files);
    }

    let total = all_files.len();
    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "indexing", "current": 0, "total": total, "file": ""
    }));

    let kb_config: serde_json::Value = {
        let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        config_val.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or(serde_json::json!({}))
    };
    let embedding_model = kb_config["defaultEmbeddingModel"].as_str().unwrap_or("local").to_string();

    let mut total_files: i64 = 0;
    let mut total_chunks: i64 = 0;

    let mut all_existing: std::collections::HashMap<String, String> = sqlx::query_as::<_, (String, String)>(
        "SELECT file_path, id FROM knowledge_files WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .collect();

    let cloud_provider_info: Option<(String, String, String)> = if embedding_model == "cloud" {
        let provider_name = kb_config["cloudProvider"].as_str().unwrap_or("");
        let embed_model = kb_config["cloudEmbeddingModel"].as_str().unwrap_or("text-embedding-3-small").to_string();
        if !provider_name.is_empty() {
            let provider: Option<(String, String)> = sqlx::query_as(
                "SELECT base_url, api_key FROM providers WHERE value = ? AND api_key != '' LIMIT 1"
            )
            .bind(provider_name)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;
            provider.map(|(base_url, api_key)| (base_url, api_key, embed_model))
        } else {
            None
        }
    } else {
        None
    };

    let ollama_info: Option<(String, String)> = if embedding_model == "ollama" {
        let endpoint = kb_config["ollamaEndpoint"].as_str().unwrap_or("http://localhost:11434").to_string();
        let ollama_model = kb_config["ollamaModel"].as_str().unwrap_or("nomic-embed-text").to_string();
        Some((endpoint, ollama_model))
    } else {
        None
    };

    let use_local_embedding = embedding_model == "local";

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    for (idx, (file_path, file_name, ext, file_size, modified_at)) in all_files.iter().enumerate() {
        let _ = app.emit("kb-index-progress", serde_json::json!({
            "id": &id, "status": "indexing", "current": idx + 1, "total": total, "file": file_name
        }));

        let file_path_str = file_path.to_string_lossy().to_string();

        let actual_file_id = if let Some(eid) = all_existing.remove(&file_path_str) {
            sqlx::query("DELETE FROM knowledge_chunks WHERE file_id = ?")
                .bind(&eid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            sqlx::query("UPDATE knowledge_files SET file_name = ?, file_ext = ?, file_size = ?, modified_at = ?, index_status = 'indexed', updated_at = ? WHERE id = ?")
                .bind(file_name)
                .bind(ext)
                .bind(file_size)
                .bind(modified_at)
                .bind(now)
                .bind(&eid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            eid
        } else {
            let file_id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO knowledge_files (id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'indexed', ?, ?, ?)")
                .bind(&file_id)
                .bind(&id)
                .bind(&file_path_str)
                .bind(file_name)
                .bind(ext)
                .bind(file_size)
                .bind(modified_at)
                .bind(now)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            file_id
        };

        let content = read_file_content(file_path);
        let file_chunk_count = if let Some(text) = content {
            let chunks = chunk_text(&text, 500, 100);
            let chunk_count = chunks.len() as i64;

            if !chunks.is_empty() {
                let _ = app.emit("kb-index-progress", serde_json::json!({
                    "id": &id, "status": "embedding", "current": idx + 1, "total": total, "file": file_name
                }));

                let mut vectors: Vec<Option<Vec<f32>>> = vec![None; chunks.len()];

                if let Some((ref base_url, ref api_key, ref embed_model)) = cloud_provider_info {
                    let batch_size = 20;
                    let mut batch_futures = Vec::new();
                    let mut batch_ranges = Vec::new();

                    for batch_start in (0..chunks.len()).step_by(batch_size) {
                        let batch_end = std::cmp::min(batch_start + batch_size, chunks.len());
                        let batch: Vec<String> = chunks[batch_start..batch_end].to_vec();
                        batch_ranges.push((batch_start, batch_end));
                        let bu = base_url.clone();
                        let ak = api_key.clone();
                        let em = embed_model.clone();
                        batch_futures.push(async move {
                            embed_text_cloud(&bu, &ak, &em, &batch).await
                        });
                    }

                    let results = futures_util::future::join_all(batch_futures).await;
                    for (i, result) in results.into_iter().enumerate() {
                        let (start, end) = batch_ranges[i];
                        match result {
                            Ok(embeddings) => {
                                for (j, emb) in embeddings.iter().enumerate() {
                                    if start + j < vectors.len() {
                                        vectors[start + j] = Some(emb.clone());
                                    }
                                }
                            }
                            Err(e) => {
                                log::warn!("[kb_index] Cloud batch {} embedding failed: {}", i, e);
                                for ci in start..end {
                                    match embed_text_cloud(base_url, api_key, embed_model, &[chunks[ci].clone()]).await {
                                        Ok(emb) => { if let Some(v) = emb.first() { vectors[ci] = Some(v.clone()); } }
                                        Err(e2) => { log::warn!("[kb_index] Single embedding also failed for chunk {}: {}", ci, e2); }
                                    }
                                }
                            }
                        }
                    }
                } else if let Some((ref endpoint, ref ollama_model)) = ollama_info {
                    let mut embed_futures = Vec::new();
                    for chunk in chunks.iter() {
                        let ep = endpoint.clone();
                        let om = ollama_model.clone();
                        let c = chunk.clone();
                        embed_futures.push(async move {
                            embed_text_ollama(&ep, &om, &c).await
                        });
                    }
                    let results = futures_util::future::join_all(embed_futures).await;
                    for (ci, result) in results.into_iter().enumerate() {
                        match result {
                            Ok(vec) => { vectors[ci] = Some(vec); }
                            Err(e) => { log::warn!("[kb_index] Ollama embedding failed for chunk {}: {}", ci, e); }
                        }
                    }
                }

                if use_local_embedding {
                    let local_state = app.state::<crate::AppState>();
                    let batch_size = 16;
                    for batch_start in (0..chunks.len()).step_by(batch_size) {
                        let batch_end = std::cmp::min(batch_start + batch_size, chunks.len());
                        let batch: Vec<String> = chunks[batch_start..batch_end].to_vec();
                        match crate::local_embedding::embed_text_local(&local_state.local_embedding, &batch) {
                            Ok(embeddings) => {
                                for (j, emb) in embeddings.iter().enumerate() {
                                    if batch_start + j < vectors.len() {
                                        vectors[batch_start + j] = Some(emb.clone());
                                    }
                                }
                            }
                            Err(e) => {
                                log::warn!("[kb_index] Local embedding batch {} failed: {}", batch_start / batch_size, e);
                            }
                        }
                    }
                }

                for (ci, chunk_content) in chunks.iter().enumerate() {
                    let chunk_id = uuid::Uuid::new_v4().to_string();
                    let vector_blob = vectors.get(ci).and_then(|v| v.as_ref()).map(|v| vec_to_blob(v));

                    sqlx::query("INSERT INTO knowledge_chunks (id, knowledge_base_id, file_id, content, chunk_index, vector, token_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(&chunk_id)
                        .bind(&id)
                        .bind(&actual_file_id)
                        .bind(chunk_content)
                        .bind(ci as i64)
                        .bind(vector_blob.as_ref())
                        .bind(chunk_content.len() as i64 / 4)
                        .bind(now)
                        .bind(now)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query("UPDATE knowledge_files SET chunk_count = ? WHERE id = ?")
                    .bind(chunk_count)
                    .bind(&actual_file_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                chunk_count
            } else {
                0
            }
        } else {
            0
        };

        total_files += 1;
        total_chunks += file_chunk_count;
    }

    for (_, stale_id) in all_existing {
        let _ = sqlx::query("DELETE FROM knowledge_chunks WHERE file_id = ?")
            .bind(&stale_id)
            .execute(&mut *tx)
            .await;
        let _ = sqlx::query("DELETE FROM knowledge_files WHERE id = ?")
            .bind(&stale_id)
            .execute(&mut *tx)
            .await;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    let now2 = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE knowledge_bases SET status = 'ready', file_count = ?, chunk_count = ?, updated_at = ? WHERE id = ?")
        .bind(total_files)
        .bind(total_chunks)
        .bind(now2)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "done", "current": total, "total": total, "file": ""
    }));

    let fw_state = app.state::<crate::AppState>();
    let dirs_vec: Vec<String> = serde_json::from_str::<Vec<String>>(&kb.directories).unwrap_or_default();
    if let Err(e) = crate::file_watcher::start_watching(&fw_state.file_watcher, app.clone(), &id, &dirs_vec) {
        log::warn!("[kb_index] 启动文件监控失败: {}", e);
    }

    Ok(serde_json::json!({
        "fileCount": total_files,
        "chunkCount": total_chunks
    }))
}

#[tauri::command]
pub async fn search_knowledge_base(app: AppHandle, id: String, query: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let _kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let mut bin = crate::command(&crate::hermes_bin());
    let output = bin
        .args(&["workspace", "search", &query])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            Ok(serde_json::json!({
                "source": "hermes_workspace",
                "results": stdout
            }))
        }
        _ => {
            let limit_val = limit.unwrap_or(20);
            let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
            let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
                "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ? AND (file_name LIKE ? OR file_path LIKE ?) LIMIT ?"
            )
            .bind(&id)
            .bind(&pattern)
            .bind(&pattern)
            .bind(limit_val)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

            let files: Vec<db::KnowledgeFile> = rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
                id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
            }).collect();

            Ok(serde_json::json!({
                "source": "local_fts",
                "results": files
            }))
        }
    }
}

#[tauri::command]
pub async fn retrieve_knowledge_internal(app: &AppHandle, id: &str, query: &str, limit: Option<i64>) -> Result<Vec<KnowledgeChunk>, String> {
    let limit_val = limit.unwrap_or(8);
    let pool = get_pool(app)?;

    let kb_exists: Option<String> = sqlx::query_scalar(
        "SELECT id FROM knowledge_bases WHERE id = ? AND status = 'ready'"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if kb_exists.is_none() {
        return Ok(Vec::new());
    }

    let kb_config: serde_json::Value = {
        let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        config_val.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or(serde_json::json!({}))
    };
    let embedding_model = kb_config["defaultEmbeddingModel"].as_str().unwrap_or("local");

    let query_vector: Option<Vec<f32>> = match embedding_model {
        "cloud" => {
            let provider_name = kb_config["cloudProvider"].as_str().unwrap_or("");
            let embed_model = kb_config["cloudEmbeddingModel"].as_str().unwrap_or("text-embedding-3-small");
            if !provider_name.is_empty() {
                let provider: Option<(String, String)> = sqlx::query_as(
                    "SELECT base_url, api_key FROM providers WHERE value = ? AND api_key != '' LIMIT 1"
                )
                .bind(provider_name)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                if let Some((base_url, api_key)) = provider {
                    match embed_text_cloud(&base_url, &api_key, embed_model, &[query.to_string()]).await {
                        Ok(mut vecs) => vecs.pop(),
                        Err(e) => {
                            log::warn!("[kb_retrieve] Cloud embedding query failed: {}", e);
                            None
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
        "ollama" => {
            let endpoint = kb_config["ollamaEndpoint"].as_str().unwrap_or("http://localhost:11434");
            let ollama_model = kb_config["ollamaModel"].as_str().unwrap_or("nomic-embed-text");
            match embed_text_ollama(endpoint, ollama_model, query).await {
                Ok(vec) => Some(vec),
                Err(e) => {
                    log::warn!("[kb_retrieve] Ollama embedding query failed: {}", e);
                    None
                }
            }
        }
        "local" => {
            let local_state = app.state::<crate::AppState>();
            match crate::local_embedding::embed_text_local_single(&local_state.local_embedding, query) {
                Ok(vec) => Some(vec),
                Err(e) => {
                    log::warn!("[kb_retrieve] Local embedding query failed: {}", e);
                    None
                }
            }
        }
        _ => None,
    };

    if let Some(qvec) = query_vector {
        let rows: Vec<(String, Vec<u8>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT kc.content, kc.vector, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND kc.vector IS NOT NULL"
        )
        .bind(id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut scored: Vec<(f32, String, Option<String>, Option<String>)> = rows.into_iter().map(|(content, blob, file_name, file_path)| {
            let vec = blob_to_vec(&blob);
            let score = cosine_similarity(&qvec, &vec);
            (score, content, file_name, file_path)
        }).collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(limit_val as usize);

        let min_score = 0.3;
        let results: Vec<KnowledgeChunk> = scored.into_iter()
            .filter(|(score, _, _, _)| *score > min_score)
            .map(|(score, content, file_name, file_path)| KnowledgeChunk {
                content,
                file_name,
                file_path,
                score: Some(score),
                kb_name: None,
                source_type: "vector".to_string(),
            })
            .collect();

        if !results.is_empty() {
            return Ok(results);
        }
    }

    let keywords: Vec<&str> = query.split(|c: char| !c.is_alphanumeric() && c as u32 > 127)
        .filter(|s| s.len() >= 2)
        .collect();

    if !keywords.is_empty() {
        let conditions: Vec<String> = keywords.iter().map(|_| "content LIKE ?".to_string()).collect();
        let where_clause = conditions.join(" OR ");

        let sql = format!("SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND ({}) LIMIT ?", where_clause);
        let mut sql_query = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(&sql).bind(id);
        for kw in &keywords {
            sql_query = sql_query.bind(format!("%{}%", kw.replace('%', "\\%").replace('_', "\\_")));
        }
        sql_query = sql_query.bind(limit_val);

        let rows: Vec<(String, Option<String>, Option<String>)> = sql_query
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if !rows.is_empty() {
            return Ok(rows.into_iter().map(|(content, file_name, file_path)| KnowledgeChunk {
                content,
                file_name,
                file_path,
                score: None,
                kb_name: None,
                source_type: "keyword".to_string(),
            }).collect());
        }
    }

    let like_pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let rows: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND kc.content LIKE ? LIMIT ?"
    )
    .bind(id)
    .bind(&like_pattern)
    .bind(limit_val)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if !rows.is_empty() {
        return Ok(rows.into_iter().map(|(content, file_name, file_path)| KnowledgeChunk {
            content,
            file_name,
            file_path,
            score: None,
            kb_name: None,
            source_type: "like".to_string(),
        }).collect());
    }

    let file_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT file_name, file_path FROM knowledge_files WHERE knowledge_base_id = ? AND (file_name LIKE ? OR file_path LIKE ?) LIMIT ?"
    )
    .bind(id)
    .bind(&like_pattern)
    .bind(&like_pattern)
    .bind(limit_val)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if !file_rows.is_empty() {
        return Ok(file_rows.iter().map(|(name, path)| KnowledgeChunk {
            content: format!("文件: {} (路径: {})", name, path),
            file_name: Some(name.clone()),
            file_path: Some(path.clone()),
            score: None,
            kb_name: None,
            source_type: "filename".to_string(),
        }).collect());
    }

    let file_list: Vec<(String, i64)> = sqlx::query_as(
        "SELECT file_name, chunk_count FROM knowledge_files WHERE knowledge_base_id = ? LIMIT 20"
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let chunk_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM knowledge_chunks WHERE knowledge_base_id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    if !file_list.is_empty() {
        let mut parts = vec![format!("知识库包含 {} 个文件，共 {} 个文本片段：", file_list.len(), chunk_count)];
        for (name, cc) in &file_list {
            parts.push(format!("- {} ({} 个片段)", name, cc));
        }
        let top_chunks: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? ORDER BY kc.created_at DESC LIMIT ?"
        )
        .bind(id)
        .bind(limit_val)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        if !top_chunks.is_empty() {
            parts.push("\n部分内容预览：".to_string());
            for (content, _, _) in top_chunks {
                let preview: String = content.chars().take(200).collect();
                parts.push(format!("---\n{}", preview));
            }
        }
        return Ok(vec![KnowledgeChunk {
            content: parts.join("\n"),
            file_name: None,
            file_path: None,
            score: None,
            kb_name: None,
            source_type: "overview".to_string(),
        }]);
    }

    Ok(Vec::new())
}

#[tauri::command]
pub async fn retrieve_knowledge(app: AppHandle, id: String, query: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let chunks = retrieve_knowledge_internal(&app, &id, &query, limit).await?;
    if chunks.is_empty() {
        Ok(serde_json::json!({
            "source": "local_fts",
            "chunks": [],
            "message": "No relevant content found"
        }))
    } else {
        let source_type = chunks.first().map(|c| c.source_type.as_str()).unwrap_or("unknown");
        Ok(serde_json::json!({
            "source": source_type,
            "chunks": chunks
        }))
    }
}

#[tauri::command]
pub async fn get_knowledge_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    match config_val {
        Some(v) => Ok(serde_json::from_str(&v).unwrap_or(serde_json::json!({}))),
        None => Ok(serde_json::json!({
            "defaultEmbeddingModel": "local",
            "defaultRetrievalMode": "off",
            "defaultMaxContextChunks": 8,
            "globalAutoRetrieve": false
        })),
    }
}

#[tauri::command]
pub async fn set_knowledge_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let config_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO app_config (key, value) VALUES ('knowledge_settings', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
        .bind(&config_str)
        .bind(&config_str)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(model) = config.get("defaultEmbeddingModel").and_then(|v| v.as_str()) {
        let _ = crate::command(&crate::hermes_bin())
            .args(&["config", "set", "knowledgebase.embedding_model", model])
            .output();
    }
    if let Some(auto) = config.get("globalAutoRetrieve").and_then(|v| v.as_bool()) {
        let _ = crate::command(&crate::hermes_bin())
            .args(&["config", "set", "knowledgebase.auto_retrieve", &auto.to_string()])
            .output();
    }
    if let Some(chunks) = config.get("defaultMaxContextChunks").and_then(|v| v.as_i64()) {
        let _ = crate::command(&crate::hermes_bin())
            .args(&["config", "set", "knowledgebase.max_context_chunks", &chunks.to_string()])
            .output();
    }

    let _ = now;
    Ok(())
}

#[tauri::command]
pub async fn check_local_embedding_model() -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let model_file = data_dir.join("model.safetensors");
    let config_file = data_dir.join("config.json");

    if model_file.exists() && config_file.exists() {
        Ok("ready".to_string())
    } else {
        Ok("missing".to_string())
    }
}

#[tauri::command]
pub async fn install_local_embedding_model(app: AppHandle) -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let _ = std::fs::create_dir_all(&data_dir);

    let model_path = data_dir.join("model.safetensors");
    let config_path = data_dir.join("config.json");
    let tokenizer_path = data_dir.join("tokenizer.json");
    let special_tokens_path = data_dir.join("special_tokens_map.json");

    let mirror_base = "https://hf-mirror.com/sentence-transformers/all-MiniLM-L6-v2/resolve/main";
    let origin_base = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

    let file_names = vec!["config.json", "special_tokens_map.json", "tokenizer.json", "model.safetensors"];
    let file_paths: Vec<std::path::PathBuf> = vec![config_path, special_tokens_path, tokenizer_path, model_path];

    let total = file_names.len();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    for (i, (name, path)) in file_names.iter().zip(file_paths.iter()).enumerate() {
        let file_name = name.to_string();
        let _ = app.emit("local-embedding-model-progress", (i as f64 / total as f64 * 100.0) as u8);

        let mirror_url = format!("{}/{}", mirror_base, name);
        let origin_url = format!("{}/{}", origin_base, name);

        let resp = match client.get(&mirror_url).send().await {
            Ok(r) if r.status().is_success() => {
                log::info!("[embedding] Downloading {} from mirror", file_name);
                r
            }
            Ok(r) => {
                log::warn!("[embedding] Mirror returned status {}, trying origin for {}", r.status(), file_name);
                drop(r);
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed: {}", file_name, e))?
            }
            Err(e) => {
                log::warn!("[embedding] Mirror failed for {}: {}, trying origin", file_name, e);
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed (mirror & origin): {}", file_name, e))?
            }
        };

        if !resp.status().is_success() {
            return Err(format!("Download {} failed with status: {}", file_name, resp.status()));
        }

        let total_size: u64 = resp.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::File::create(&path).await.map_err(|e| format!("Failed to create {}: {}", file_name, e))?;

        let base_pct = i as f64 / total as f64 * 100.0;
        let file_pct = 100.0 / total as f64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download {} stream error: {}", file_name, e))?;
            file.write_all(&chunk).await.map_err(|e| format!("Write {} error: {}", file_name, e))?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                let pct = (base_pct + (downloaded as f64 / total_size as f64) * file_pct) as u8;
                let _ = app.emit("local-embedding-model-progress", pct);
            }
        }
        file.flush().await.map_err(|e| format!("Flush {} error: {}", file_name, e))?;
    }

    let _ = app.emit("local-embedding-model-progress", 100u8);
    let _ = app.emit("local-embedding-model-installed", ());
    Ok("ready".to_string())
}

#[tauri::command]
pub async fn test_cloud_embedding(app: AppHandle, provider: String, model: String) -> Result<String, String> {
    eprintln!("[test_cloud_embedding] provider={}, model={}", provider, model);
    let pool = get_pool(&app)?;

    let (base_url, api_key): (String, String) = sqlx::query_as::<_, (String, String)>(
        "SELECT base_url, api_key FROM providers WHERE value = ?"
    )
    .bind(&provider)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Provider not found: {}", e))?;

    eprintln!("[test_cloud_embedding] base_url={}, api_key_len={}", base_url, api_key.len());

    if base_url.is_empty() {
        return Err("Provider has no API Base URL configured".to_string());
    }
    if api_key.is_empty() {
        return Err("Provider has no API Key configured".to_string());
    }
    if model.is_empty() {
        return Err("No embedding model specified".to_string());
    }

    let embed_url = format!("{}/embeddings", base_url.trim_end_matches('/'));
    eprintln!("[test_cloud_embedding] embed_url={}", embed_url);

    let body = serde_json::json!({
        "model": model,
        "input": "test"
    });

    let response = reqwest::Client::new()
        .post(&embed_url)
        .bearer_auth(&api_key)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if status.as_u16() == 404 {
            return Err("该供应商不支持嵌入模型 API (404)，请选择支持嵌入模型的供应商，如 OpenAI、硅基流动等".to_string());
        }
        if status.as_u16() == 401 {
            return Err("API Key 无效或已过期 (401)，请检查供应商配置".to_string());
        }
        return Err(format!("API error ({}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if result.get("data").is_some() {
        Ok("ok".to_string())
    } else {
        Err("Unexpected response format".to_string())
    }
}

#[tauri::command]
pub async fn test_ollama_embedding(endpoint: String, model: String) -> Result<String, String> {
    if endpoint.is_empty() {
        return Err("Ollama endpoint is empty".to_string());
    }
    if model.is_empty() {
        return Err("Ollama model name is empty".to_string());
    }

    let embed_url = format!("{}/api/embed", endpoint.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "input": "test"
    });

    let response = reqwest::Client::new()
        .post(&embed_url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if status.as_u16() == 404 {
            return Err(format!("Model '{}' not found in Ollama. Please pull it first: ollama pull {}", model, model));
        }
        return Err(format!("API error ({}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if result.get("embeddings").is_some() {
        Ok("ok".to_string())
    } else {
        Err("Unexpected response format from Ollama".to_string())
    }
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

