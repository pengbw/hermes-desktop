use crate::db;
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
    .map_err(|e| format!("供应商不存在: {}", e))?;

    if base_url.is_empty() {
        return Err("该供应商未配置 API Base URL".to_string());
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
        .map_err(|e| format!("请求模型列表失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("请求模型列表失败 ({}): {}", status, body));
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析模型列表失败: {}", e))?;

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
pub async fn sync_provider_keys(app: AppHandle) -> Result<i64, String> {
    let pool = get_pool(&app)?;

    let env_path_output = std::process::Command::new(hermes_bin())
        .args(&["config", "env-path"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("获取 env 路径失败: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    if env_path.is_empty() {
        return Ok(0);
    }

    if !std::path::Path::new(&env_path).exists() {
        return Ok(0);
    }

    let env_content = std::fs::read_to_string(&env_path)
        .map_err(|e| format!("读取 env 文件失败: {}", e))?;

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
        .bind("数字助手对话")
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Conversation {
        id,
        title: "数字助手对话".to_string(),
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

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, i64)>(
        "SELECT id, role, content, thinking, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conv_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, timestamp)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
            timestamp,
        })
        .collect();

    Ok(messages)
}

/// 激活归档会话（将 status 改为 active）
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

/// 修改会话名称
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

/// 归档超时会话（超过指定分钟数未使用的会话标记为 archived）
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

    sqlx::query("INSERT INTO messages (id, conversation_id, role, content, thinking, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.conversation_id)
        .bind(&req.role)
        .bind(&req.content)
        .bind(req.thinking.as_deref().unwrap_or(""))
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 更新会话的 updated_at 和 last_active_at，并激活会话
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
        timestamp: now,
    })
}

#[tauri::command]
pub async fn list_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, i64)>(
        "SELECT id, role, content, thinking, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conversation_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, timestamp)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
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
    if let Ok(output) = std::process::Command::new("which").arg("hermes").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return p;
            }
        }
    }
    "hermes".to_string()
}

fn write_hermes_env(key: &str, value: &str) -> Result<(), String> {
    let env_path_output = std::process::Command::new(hermes_bin())
        .args(&["config", "env-path"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("获取 env 路径失败: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    if env_path.is_empty() {
        return Err("无法获取 Hermes env 文件路径".to_string());
    }

    if !std::path::Path::new(&env_path).exists() {
        if let Some(parent) = std::path::Path::new(&env_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&env_path, "")
            .map_err(|e| format!("创建 env 文件失败: {}", e))?;
    }

    let env_content = std::fs::read_to_string(&env_path)
        .map_err(|e| format!("读取 env 文件失败: {}", e))?;

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
        .map_err(|e| format!("写入 env 文件失败: {}", e))?;

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
        return Err("内置供应商不可删除".to_string());
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
    sqlx::Arguments::add(&mut args, now);

    if let Some(name) = &req.name {
        query.push_str(", name = ?");
        sqlx::Arguments::add(&mut args, name);
    }
    if let Some(duration) = req.duration {
        query.push_str(", duration = ?");
        sqlx::Arguments::add(&mut args, duration);
    }
    if let Some(look_at_x) = req.look_at_x {
        query.push_str(", look_at_x = ?");
        sqlx::Arguments::add(&mut args, look_at_x);
    }
    if let Some(look_at_y) = req.look_at_y {
        query.push_str(", look_at_y = ?");
        sqlx::Arguments::add(&mut args, look_at_y);
    }
    if let Some(tilt) = req.tilt {
        query.push_str(", tilt = ?");
        sqlx::Arguments::add(&mut args, tilt);
    }
    if let Some(target_json) = &req.target_json {
        query.push_str(", target_json = ?");
        sqlx::Arguments::add(&mut args, target_json);
    }

    query.push_str(" WHERE id = ?");
    sqlx::Arguments::add(&mut args, &req.id);

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

