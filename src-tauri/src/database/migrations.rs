use sqlx::SqlitePool;

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let has_audio_path: bool = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pragma_table_info('messages') WHERE name = 'audio_path'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0) > 0;

    if !has_audio_path {
        sqlx::query("ALTER TABLE messages ADD COLUMN audio_path TEXT DEFAULT ''")
            .execute(pool)
            .await?;
        sqlx::query("ALTER TABLE messages ADD COLUMN audio_duration REAL DEFAULT 0")
            .execute(pool)
            .await?;
        sqlx::query("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'")
            .execute(pool)
            .await?;
    }

    let has_file_task_id: bool = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pragma_table_info('project_file_records') WHERE name = 'task_id'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0) > 0;

    if !has_file_task_id {
        sqlx::query("ALTER TABLE project_file_records ADD COLUMN task_id TEXT NOT NULL DEFAULT ''")
            .execute(pool)
            .await?;
    }

    let has_workflow_group_valid: bool = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pragma_table_info('project_workflow_groups') WHERE name = 'is_valid'"
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0) > 0;

    if !has_workflow_group_valid {
        sqlx::query("ALTER TABLE project_workflow_groups ADD COLUMN is_valid BOOLEAN NOT NULL DEFAULT 1")
            .execute(pool)
            .await?;
    }

    Ok(())
}
