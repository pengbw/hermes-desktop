use crate::database::models as db;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadAudioFileResult {
    pub success: bool,
    pub data: String,
    pub mime: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn read_audio_file(path: String) -> Result<ReadAudioFileResult, String> {
    let file_path = std::path::Path::new(&path);
    if !file_path.exists() {
        return Ok(ReadAudioFileResult {
            success: false,
            data: String::new(),
            mime: String::new(),
            error: Some(format!("File not found: {}", path)),
        });
    }

    let bytes = std::fs::read(file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "webm" => "audio/webm",
        _ => "audio/mpeg",
    };

    Ok(ReadAudioFileResult {
        success: true,
        data,
        mime: mime.to_string(),
        error: None,
    })
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

    let audio_path_val = req.audio_path.as_deref().unwrap_or("");
    let audio_duration_val = req.audio_duration.unwrap_or(0.0);
    let message_type_val = req.message_type.as_deref().unwrap_or("text");

    sqlx::query("INSERT INTO messages (id, conversation_id, role, content, thinking, files, timestamp, audio_path, audio_duration, message_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.conversation_id)
        .bind(&req.role)
        .bind(&req.content)
        .bind(req.thinking.as_deref().unwrap_or(""))
        .bind(req.files.as_deref().unwrap_or(""))
        .bind(now)
        .bind(audio_path_val)
        .bind(audio_duration_val)
        .bind(message_type_val)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

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
        audio_path: req.audio_path,
        audio_duration: req.audio_duration,
        message_type: req.message_type,
    })
}

#[tauri::command]
pub async fn list_messages(
    app: AppHandle,
    conversation_id: String,
) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, i64, Option<String>, Option<f64>, Option<String>)>(
        "SELECT id, role, content, thinking, files, timestamp, audio_path, audio_duration, message_type FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conversation_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, files, timestamp, audio_path, audio_duration, message_type)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
            files: files.filter(|s| !s.is_empty()),
            timestamp,
            audio_path: audio_path.filter(|s| !s.is_empty()),
            audio_duration: audio_duration.filter(|d| *d >= 0.0),
            message_type: message_type.filter(|s| !s.is_empty()),
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
    sqlx::query("UPDATE messages SET content = ?, audio_path = ?, audio_duration = ?, message_type = ? WHERE id = ?")
        .bind(&req.content)
        .bind(req.audio_path.as_deref().unwrap_or(""))
        .bind(req.audio_duration.unwrap_or(0.0))
        .bind(req.message_type.as_deref().unwrap_or("text"))
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
