use serde::{Deserialize, Serialize};

pub fn db_path() -> std::path::PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let data_dir = home.join("Library").join("Application Support").join("com.hermes-desktop");
    if let Err(e) = std::fs::create_dir_all(&data_dir) {
        eprintln!("Failed to create data directory: {}", e);
    }
    data_dir.join("hermes.db")
}

pub async fn init_db(pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            hermes_session_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            last_active_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    // 迁移：为旧表添加新列
    for alter in [
        "ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE conversations ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE conversations ADD COLUMN source TEXT NOT NULL DEFAULT 'main'",
    ] {
        let _ = sqlx::query(alter).execute(pool).await; // 忽略已存在的列错误
    }

    // 更新 last_active_at 为 updated_at（旧数据迁移）
    sqlx::query("UPDATE conversations SET last_active_at = updated_at WHERE last_active_at = 0")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thinking TEXT,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub hermes_session_id: Option<String>,
    pub status: String,
    pub source: Option<String>,
    pub last_active_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
    pub timestamp: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationRequest {
    pub title: String,
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageRequest {
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub thinking: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageRequest {
    pub id: String,
    pub content: String,
}
