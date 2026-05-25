use crate::crypto::file_storage;
use crate::crypto::key_manager;
use crate::database::models as db;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

async fn get_conversation_storage_path(pool: &SqlitePool) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'conversation_storage_path'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

async fn ensure_key_initialized(pool: &SqlitePool) -> Result<(), String> {
    if key_manager::get_cached_key().is_some() {
        return Ok(());
    }
    let storage_path = get_conversation_storage_path(pool).await;
    key_manager::init_or_load_key(storage_path.as_deref())?;
    Ok(())
}

async fn get_storage_path(pool: &SqlitePool) -> Option<String> {
    get_conversation_storage_path(pool).await
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

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;
    file_storage::write_conversation_file(sp.as_deref(), &id, vec![])?;

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
pub async fn read_audio_file(app: AppHandle, path: String) -> Result<ReadAudioFileResult, String> {
    let file_path = std::path::Path::new(&path);

    let canonical = std::fs::canonicalize(file_path).map_err(|_| "文件不存在".to_string())?;

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let home_canonical = std::fs::canonicalize(&home).unwrap_or_else(|_| std::path::PathBuf::from(&home));
    let temp = std::env::temp_dir();
    let temp_canonical = std::fs::canonicalize(&temp).unwrap_or_else(|_| temp);
    let data_dir = dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let data_canonical = std::fs::canonicalize(&data_dir).unwrap_or_else(|_| data_dir.clone());

    let pool = get_pool(&app)?;
    let ws: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .flatten();
    let ws_canonical = ws.as_ref().and_then(|w| std::fs::canonicalize(w).ok());

    let allowed = canonical.starts_with(&temp_canonical)
        || canonical.starts_with(&home_canonical)
        || canonical.starts_with(&data_canonical)
        || ws_canonical.as_ref().map_or(false, |w| canonical.starts_with(w));

    if !allowed {
        return Ok(ReadAudioFileResult {
            success: false,
            data: String::new(),
            mime: String::new(),
            error: Some("无权访问该路径".to_string()),
        });
    }

    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let allowed_exts = ["mp3", "wav", "ogg", "flac", "m4a", "webm"];
    if !allowed_exts.contains(&ext.as_str()) {
        return Ok(ReadAudioFileResult {
            success: false,
            data: String::new(),
            mime: String::new(),
            error: Some("不支持的音频格式".to_string()),
        });
    }

    let bytes = std::fs::read(&canonical).map_err(|e| format!("Failed to read file: {}", e))?;
    let data = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);

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

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;
    file_storage::delete_conversation_file(sp.as_deref(), &id)?;

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

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;

    let encrypted_msg = file_storage::EncryptedMessage {
        id: id.clone(),
        role: req.role.clone(),
        content: req.content.clone(),
        thinking: req.thinking.clone(),
        files: req.files.clone(),
        timestamp: now,
        audio_path: req.audio_path.clone(),
        audio_duration: req.audio_duration,
        message_type: req.message_type.clone(),
    };

    file_storage::append_message_to_conversation(sp.as_deref(), &req.conversation_id, encrypted_msg)?;

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

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;

    let encrypted_messages = file_storage::read_conversation_file(sp.as_deref(), &conversation_id)?;

    let messages = encrypted_messages
        .into_iter()
        .map(|em| db::Message {
            id: em.id,
            role: em.role,
            content: em.content,
            thinking: em.thinking.filter(|s| !s.is_empty()),
            files: em.files.filter(|s| !s.is_empty()),
            timestamp: em.timestamp,
            audio_path: em.audio_path.filter(|s| !s.is_empty()),
            audio_duration: em.audio_duration.filter(|d| *d >= 0.0),
            message_type: em.message_type.filter(|s| !s.is_empty()),
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

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;

    if let Some(ref conv_id) = req.conversation_id {
        let req_id = req.id.clone();
        let req_content = req.content.clone();
        let req_audio_path = req.audio_path.clone();
        let req_audio_duration = req.audio_duration;
        let req_message_type = req.message_type.clone();
        file_storage::update_message_in_conversation(
            sp.as_deref(),
            conv_id,
            &req_id,
            move |msg| {
                msg.content = req_content;
                msg.audio_path = req_audio_path;
                msg.audio_duration = req_audio_duration;
                msg.message_type = req_message_type;
            },
        )?;
        return Ok(());
    }

    let conversation_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM conversations"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut found = false;
    for conv_id in &conversation_ids {
        let messages = file_storage::read_conversation_file(sp.as_deref(), conv_id)?;
        if messages.iter().any(|m| m.id == req.id) {
            let req_id = req.id.clone();
            let req_content = req.content.clone();
            let req_audio_path = req.audio_path.clone();
            let req_audio_duration = req.audio_duration;
            let req_message_type = req.message_type.clone();
            file_storage::update_message_in_conversation(
                sp.as_deref(),
                conv_id,
                &req_id,
                move |msg| {
                    msg.content = req_content;
                    msg.audio_path = req_audio_path;
                    msg.audio_duration = req_audio_duration;
                    msg.message_type = req_message_type;
                },
            )?;
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Message {} not found in any conversation", req.id));
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_message(
    app: AppHandle,
    id: String,
    conversation_id: Option<String>,
) -> Result<(), String> {
    let pool = get_pool(&app)?;

    ensure_key_initialized(&pool).await?;
    let sp = get_storage_path(&pool).await;

    if let Some(conv_id) = conversation_id {
        file_storage::delete_message_from_conversation(sp.as_deref(), &conv_id, &id)?;
        return Ok(());
    }

    let conversation_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM conversations"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut found = false;
    for conv_id in &conversation_ids {
        let messages = file_storage::read_conversation_file(sp.as_deref(), conv_id)?;
        if messages.iter().any(|m| m.id == id) {
            file_storage::delete_message_from_conversation(sp.as_deref(), conv_id, &id)?;
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Message {} not found in any conversation", id));
    }

    Ok(())
}
