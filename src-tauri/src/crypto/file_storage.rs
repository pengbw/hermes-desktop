use crate::crypto::encryption;
use crate::crypto::key_manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const FILE_VERSION: u32 = 1;
const FILE_EXTENSION: &str = ".enc";

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedConversationFile {
    pub version: u32,
    pub conversation_id: String,
    pub messages: Vec<EncryptedMessage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub files: Option<String>,
    pub timestamp: i64,
    pub audio_path: Option<String>,
    pub audio_duration: Option<f64>,
    pub message_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedProjectMessagesFile {
    pub version: u32,
    pub project_id: String,
    pub messages: Vec<EncryptedProjectMessage>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedProjectMessage {
    pub id: String,
    pub role_id: String,
    pub content: String,
    pub message_type: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub created_at: i64,
}

pub fn default_conversation_storage_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("hermes-desktop")
        .join("conversations")
}

pub fn default_project_storage_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("hermes-desktop")
        .join("projects")
}

fn expand_user_path(path: &str) -> PathBuf {
    if path.starts_with("~/") || path.starts_with("~\\") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[2..]);
        }
    }
    PathBuf::from(path)
}

pub fn resolve_conversation_dir(custom_path: Option<&str>) -> PathBuf {
    if let Some(p) = custom_path {
        let path = expand_user_path(p);
        path.join("conversations")
    } else {
        default_conversation_storage_dir()
    }
}

pub fn resolve_project_dir(custom_path: Option<&str>, project_id: &str) -> PathBuf {
    let base = if let Some(p) = custom_path {
        expand_user_path(p)
    } else {
        default_project_storage_dir()
    };
    base.join(project_id)
}

fn conversation_file_path(custom_path: Option<&str>, conversation_id: &str) -> PathBuf {
    resolve_conversation_dir(custom_path).join(format!("{}{}", conversation_id, FILE_EXTENSION))
}

fn project_messages_file_path(custom_path: Option<&str>, project_id: &str) -> PathBuf {
    resolve_project_dir(custom_path, project_id).join(format!("messages{}", FILE_EXTENSION))
}

fn ensure_dir(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    Ok(())
}

fn get_key() -> Result<[u8; 32], String> {
    key_manager::get_cached_key().ok_or_else(|| "Encryption key not initialized".to_string())
}

pub fn write_conversation_file(
    custom_path: Option<&str>,
    conversation_id: &str,
    messages: Vec<EncryptedMessage>,
) -> Result<(), String> {
    let key = get_key()?;
    let file_data = EncryptedConversationFile {
        version: FILE_VERSION,
        conversation_id: conversation_id.to_string(),
        messages,
    };
    let json = serde_json::to_vec(&file_data).map_err(|e| format!("Serialize failed: {}", e))?;
    let encrypted = encryption::encrypt(&json, &key)?;

    let path = conversation_file_path(custom_path, conversation_id);
    ensure_dir(&path)?;
    std::fs::write(&path, encrypted).map_err(|e| format!("Write file failed: {}", e))?;
    Ok(())
}

pub fn read_conversation_file(
    custom_path: Option<&str>,
    conversation_id: &str,
) -> Result<Vec<EncryptedMessage>, String> {
    let key = get_key()?;
    let path = conversation_file_path(custom_path, conversation_id);

    if !path.exists() {
        return Ok(vec![]);
    }

    let encrypted = std::fs::read(&path).map_err(|e| format!("Read file failed: {}", e))?;
    let decrypted = encryption::decrypt(&encrypted, &key)?;
    let file_data: EncryptedConversationFile =
        serde_json::from_slice(&decrypted).map_err(|e| format!("Deserialize failed: {}", e))?;

    Ok(file_data.messages)
}

pub fn append_message_to_conversation(
    custom_path: Option<&str>,
    conversation_id: &str,
    message: EncryptedMessage,
) -> Result<(), String> {
    let mut messages = read_conversation_file(custom_path, conversation_id)?;
    messages.push(message);
    write_conversation_file(custom_path, conversation_id, messages)
}

pub fn delete_message_from_conversation(
    custom_path: Option<&str>,
    conversation_id: &str,
    message_id: &str,
) -> Result<(), String> {
    let mut messages = read_conversation_file(custom_path, conversation_id)?;
    messages.retain(|m| m.id != message_id);
    write_conversation_file(custom_path, conversation_id, messages)
}

pub fn update_message_in_conversation(
    custom_path: Option<&str>,
    conversation_id: &str,
    message_id: &str,
    updater: impl FnOnce(&mut EncryptedMessage),
) -> Result<(), String> {
    let mut messages = read_conversation_file(custom_path, conversation_id)?;
    let mut found = false;
    for msg in &mut messages {
        if msg.id == message_id {
            updater(msg);
            found = true;
            break;
        }
    }
    if !found {
        return Err(format!("Message {} not found", message_id));
    }
    write_conversation_file(custom_path, conversation_id, messages)
}

pub fn delete_conversation_file(
    custom_path: Option<&str>,
    conversation_id: &str,
) -> Result<(), String> {
    let path = conversation_file_path(custom_path, conversation_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete file failed: {}", e))?;
    }
    Ok(())
}

pub fn write_project_messages_file(
    custom_path: Option<&str>,
    project_id: &str,
    messages: Vec<EncryptedProjectMessage>,
) -> Result<(), String> {
    let key = get_key()?;
    let file_data = EncryptedProjectMessagesFile {
        version: FILE_VERSION,
        project_id: project_id.to_string(),
        messages,
    };
    let json = serde_json::to_vec(&file_data).map_err(|e| format!("Serialize failed: {}", e))?;
    let encrypted = encryption::encrypt(&json, &key)?;

    let path = project_messages_file_path(custom_path, project_id);
    ensure_dir(&path)?;
    std::fs::write(&path, encrypted).map_err(|e| format!("Write file failed: {}", e))?;
    Ok(())
}

pub fn read_project_messages_file(
    custom_path: Option<&str>,
    project_id: &str,
) -> Result<Vec<EncryptedProjectMessage>, String> {
    let key = get_key()?;
    let path = project_messages_file_path(custom_path, project_id);

    if !path.exists() {
        return Ok(vec![]);
    }

    let encrypted = std::fs::read(&path).map_err(|e| format!("Read file failed: {}", e))?;
    let decrypted = encryption::decrypt(&encrypted, &key)?;
    let file_data: EncryptedProjectMessagesFile =
        serde_json::from_slice(&decrypted).map_err(|e| format!("Deserialize failed: {}", e))?;

    Ok(file_data.messages)
}

pub fn append_message_to_project(
    custom_path: Option<&str>,
    project_id: &str,
    message: EncryptedProjectMessage,
) -> Result<(), String> {
    let mut messages = read_project_messages_file(custom_path, project_id)?;
    messages.push(message);
    write_project_messages_file(custom_path, project_id, messages)
}

pub fn delete_project_messages_file(
    custom_path: Option<&str>,
    project_id: &str,
) -> Result<(), String> {
    let path = project_messages_file_path(custom_path, project_id);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete file failed: {}", e))?;
    }
    let dir = resolve_project_dir(custom_path, project_id);
    if dir.exists() && std::fs::read_dir(&dir).map_err(|e| e.to_string())?.next().is_none() {
        std::fs::remove_dir(&dir).ok();
    }
    Ok(())
}

pub fn delete_role_messages_from_project(
    custom_path: Option<&str>,
    project_id: &str,
    role_id: &str,
) -> Result<(), String> {
    let path = project_messages_file_path(custom_path, project_id);
    if !path.exists() {
        return Ok(());
    }
    let messages = read_project_messages_file(custom_path, project_id)?;
    let filtered: Vec<EncryptedProjectMessage> = messages
        .into_iter()
        .filter(|m| m.role_id != role_id)
        .collect();
    write_project_messages_file(custom_path, project_id, filtered)?;
    Ok(())
}

pub fn update_project_message_tokens(
    custom_path: Option<&str>,
    project_id: &str,
    message_id: &str,
    prompt_tokens: i64,
    completion_tokens: i64,
) -> Result<(), String> {
    let path = project_messages_file_path(custom_path, project_id);
    if !path.exists() {
        return Err("Project messages file not found".to_string());
    }
    let messages = read_project_messages_file(custom_path, project_id)?;
    let updated: Vec<EncryptedProjectMessage> = messages
        .into_iter()
        .map(|m| {
            if m.id == message_id {
                EncryptedProjectMessage {
                    prompt_tokens,
                    completion_tokens,
                    ..m
                }
            } else {
                m
            }
        })
        .collect();
    write_project_messages_file(custom_path, project_id, updated)?;
    Ok(())
}

pub fn migrate_conversation_from_db(
    custom_path: Option<&str>,
    conversation_id: &str,
    messages: Vec<EncryptedMessage>,
) -> Result<(), String> {
    write_conversation_file(custom_path, conversation_id, messages)
}

pub fn migrate_project_messages_from_db(
    custom_path: Option<&str>,
    project_id: &str,
    messages: Vec<EncryptedProjectMessage>,
) -> Result<(), String> {
    write_project_messages_file(custom_path, project_id, messages)
}

pub fn move_conversation_files(
    old_path: Option<&str>,
    new_path: Option<&str>,
    conversation_ids: &[String],
) -> Result<usize, String> {
    let mut moved = 0;
    for id in conversation_ids {
        let old_file = conversation_file_path(old_path, id);
        if !old_file.exists() {
            continue;
        }
        let new_file = conversation_file_path(new_path, id);
        ensure_dir(&new_file)?;
        std::fs::copy(&old_file, &new_file).map_err(|e| format!("Copy failed: {}", e))?;
        std::fs::remove_file(&old_file).map_err(|e| format!("Remove old file failed: {}", e))?;
        moved += 1;
    }
    Ok(moved)
}

pub async fn migrate_messages_from_db(pool: &sqlx::SqlitePool) -> Result<MigrationResult, String> {
    let migrated_flag: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'messages_migrated_to_files'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    if migrated_flag.as_deref() == Some("true") {
        return Ok(MigrationResult { conversations: 0, project_messages: 0 });
    }

    let storage_path: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'conversation_storage_path'"
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten()
    .filter(|v: &String| !v.is_empty());

    key_manager::init_or_load_key(storage_path.as_deref())?;

    let mut conv_count = 0u64;
    let conversation_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM conversations"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for conv_id in &conversation_ids {
        let file_path = conversation_file_path(storage_path.as_deref(), conv_id);
        if file_path.exists() {
            continue;
        }

        let rows: Vec<(String, String, String, Option<String>, Option<String>, i64, Option<String>, Option<f64>, Option<String>)> = sqlx::query_as(
            "SELECT id, role, content, thinking, files, timestamp, audio_path, audio_duration, message_type FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
        )
        .bind(conv_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        if rows.is_empty() {
            let _ = write_conversation_file(storage_path.as_deref(), conv_id, vec![]);
            conv_count += 1;
            continue;
        }

        let messages: Vec<EncryptedMessage> = rows.into_iter().map(|(id, role, content, thinking, files, timestamp, audio_path, audio_duration, message_type)| {
            EncryptedMessage {
                id,
                role,
                content,
                thinking: thinking.filter(|s| !s.is_empty()),
                files: files.filter(|s| !s.is_empty()),
                timestamp,
                audio_path: audio_path.filter(|s| !s.is_empty()),
                audio_duration: audio_duration.filter(|d| *d >= 0.0),
                message_type: message_type.filter(|s| !s.is_empty()),
            }
        }).collect();

        write_conversation_file(storage_path.as_deref(), conv_id, messages)?;
        conv_count += 1;
    }

    let mut proj_count = 0u64;
    let project_ids: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT project_id FROM project_messages"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    for proj_id in &project_ids {
        let file_path = project_messages_file_path(storage_path.as_deref(), proj_id);
        if file_path.exists() {
            continue;
        }

        let rows: Vec<(String, String, String, String, i64, i64, i64)> = sqlx::query_as(
            "SELECT id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at FROM project_messages WHERE project_id = ? ORDER BY created_at ASC"
        )
        .bind(proj_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

        let messages: Vec<EncryptedProjectMessage> = rows.into_iter().map(|(id, role_id, content, message_type, prompt_tokens, completion_tokens, created_at)| {
            EncryptedProjectMessage {
                id,
                role_id,
                content,
                message_type,
                prompt_tokens,
                completion_tokens,
                created_at,
            }
        }).collect();

        write_project_messages_file(storage_path.as_deref(), proj_id, messages)?;
        proj_count += 1;
    }

    sqlx::query("INSERT OR REPLACE INTO app_config (key, value) VALUES ('messages_migrated_to_files', 'true')")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(MigrationResult {
        conversations: conv_count,
        project_messages: proj_count,
    })
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub conversations: u64,
    pub project_messages: u64,
}

pub fn move_project_files(
    old_path: Option<&str>,
    new_path: Option<&str>,
    project_ids: &[String],
) -> Result<usize, String> {
    let mut moved = 0;
    for id in project_ids {
        let old_dir = resolve_project_dir(old_path, id);
        if !old_dir.exists() {
            continue;
        }
        let new_dir = resolve_project_dir(new_path, id);
        ensure_dir(&new_dir.join("dummy"))?;

        let entries: Vec<_> = std::fs::read_dir(&old_dir)
            .map_err(|e| format!("Read dir failed: {}", e))?
            .filter_map(|e| e.ok())
            .collect();

        for entry in entries {
            let src = entry.path();
            let dst = new_dir.join(entry.file_name());
            std::fs::copy(&src, &dst).map_err(|e| format!("Copy failed: {}", e))?;
            std::fs::remove_file(&src).map_err(|e| format!("Remove old file failed: {}", e))?;
        }

        std::fs::remove_dir(&old_dir).ok();
        moved += 1;
    }
    Ok(moved)
}
