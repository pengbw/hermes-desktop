use sqlx::SqlitePool;

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

fn all_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "add conversations.status and last_active_at",
            sql: "ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
        },
        Migration {
            version: 2,
            description: "add conversations.last_active_at",
            sql: "ALTER TABLE conversations ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 3,
            description: "add conversations.source",
            sql: "ALTER TABLE conversations ADD COLUMN source TEXT NOT NULL DEFAULT 'main'",
        },
        Migration {
            version: 4,
            description: "add conversations.kb_ids",
            sql: "ALTER TABLE conversations ADD COLUMN kb_ids TEXT",
        },
        Migration {
            version: 5,
            description: "add providers.api_key",
            sql: "ALTER TABLE providers ADD COLUMN api_key TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 6,
            description: "add avatar_gestures.source",
            sql: "ALTER TABLE avatar_gestures ADD COLUMN source TEXT NOT NULL DEFAULT 'custom'",
        },
        Migration {
            version: 7,
            description: "add messages.files",
            sql: "ALTER TABLE messages ADD COLUMN files TEXT",
        },
        Migration {
            version: 8,
            description: "add ai_roles.avatar_url",
            sql: "ALTER TABLE ai_roles ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 9,
            description: "add ai_roles.avatar_type",
            sql: "ALTER TABLE ai_roles ADD COLUMN avatar_type TEXT NOT NULL DEFAULT 'default'",
        },
        Migration {
            version: 10,
            description: "add ai_roles.avatar_preset",
            sql: "ALTER TABLE ai_roles ADD COLUMN avatar_preset TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 11,
            description: "add ai_roles.avatar_color",
            sql: "ALTER TABLE ai_roles ADD COLUMN avatar_color TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 12,
            description: "add projects.tag",
            sql: "ALTER TABLE projects ADD COLUMN tag TEXT NOT NULL DEFAULT 'none'",
        },
        Migration {
            version: 13,
            description: "add projects.icon",
            sql: "ALTER TABLE projects ADD COLUMN icon TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 14,
            description: "add projects.is_favorite",
            sql: "ALTER TABLE projects ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 15,
            description: "add projects.cover_image",
            sql: "ALTER TABLE projects ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 16,
            description: "add projects.project_rule",
            sql: "ALTER TABLE projects ADD COLUMN project_rule TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 17,
            description: "add ai_roles.nickname",
            sql: "ALTER TABLE ai_roles ADD COLUMN nickname TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 18,
            description: "add projects.project_guidelines",
            sql: "ALTER TABLE projects ADD COLUMN project_guidelines TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 19,
            description: "add project_artifacts.review_comment",
            sql: "ALTER TABLE project_artifacts ADD COLUMN review_comment TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 20,
            description: "add ai_roles.energy",
            sql: "ALTER TABLE ai_roles ADD COLUMN energy INTEGER NOT NULL DEFAULT 100",
        },
        Migration {
            version: 21,
            description: "add ai_roles.mood",
            sql: "ALTER TABLE ai_roles ADD COLUMN mood TEXT NOT NULL DEFAULT 'neutral'",
        },
        Migration {
            version: 22,
            description: "add projects.office_theme",
            sql: "ALTER TABLE projects ADD COLUMN office_theme TEXT NOT NULL DEFAULT 'cozy'",
        },
        Migration {
            version: 23,
            description: "add project_members.equipment_level",
            sql: "ALTER TABLE project_members ADD COLUMN equipment_level INTEGER NOT NULL DEFAULT 1",
        },
        Migration {
            version: 24,
            description: "add projects.office_layout",
            sql: "ALTER TABLE projects ADD COLUMN office_layout TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 25,
            description: "add knowledge_bases.retrieval_mode",
            sql: "ALTER TABLE knowledge_bases ADD COLUMN retrieval_mode TEXT NOT NULL DEFAULT 'off'",
        },
        Migration {
            version: 26,
            description: "add knowledge_bases.auto_retrieve",
            sql: "ALTER TABLE knowledge_bases ADD COLUMN auto_retrieve INTEGER NOT NULL DEFAULT 0",
        },
    ]
}

async fn ensure_migration_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _migrations (
            version INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn get_applied_versions(pool: &SqlitePool) -> Result<Vec<i64>, sqlx::Error> {
    let rows: Vec<(i64,)> = sqlx::query_as("SELECT version FROM _migrations ORDER BY version")
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|(v,)| v).collect())
}

async fn record_migration(pool: &SqlitePool, version: i64, description: &str) -> Result<(), sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO _migrations (version, description, applied_at) VALUES (?, ?, ?)")
        .bind(version)
        .bind(description)
        .bind(now)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    ensure_migration_table(pool).await?;
    let applied = get_applied_versions(pool).await?;
    let migrations = all_migrations();

    let applied_set: std::collections::HashSet<i64> = applied.into_iter().collect();

    for m in &migrations {
        if applied_set.contains(&m.version) {
            continue;
        }

        log::info!("Running migration v{}: {}", m.version, m.description);

        match sqlx::query(m.sql).execute(pool).await {
            Ok(_) => {
                record_migration(pool, m.version, m.description).await?;
                log::info!("Migration v{} applied successfully", m.version);
            }
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("duplicate column name") {
                    log::info!(
                        "Migration v{} skipped (column already exists): {}",
                        m.version,
                        m.description
                    );
                    record_migration(pool, m.version, m.description).await?;
                } else {
                    log::error!(
                        "Migration v{} failed: {} — {}",
                        m.version,
                        m.description,
                        e
                    );
                    return Err(e);
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_all_migrations_ordered() {
        let migrations = all_migrations();
        assert!(!migrations.is_empty(), "Migrations list should not be empty");

        for i in 1..migrations.len() {
            assert!(
                migrations[i].version > migrations[i - 1].version,
                "Migration versions must be strictly increasing: v{} followed by v{}",
                migrations[i - 1].version,
                migrations[i].version
            );
        }
    }

    #[test]
    fn test_all_migrations_start_at_v1() {
        let migrations = all_migrations();
        assert_eq!(migrations[0].version, 1, "First migration should start at v1");
    }

    #[test]
    fn test_all_migrations_have_sql() {
        let migrations = all_migrations();
        for m in &migrations {
            assert!(!m.sql.is_empty(), "Migration v{} should have SQL", m.version);
            assert!(!m.description.is_empty(), "Migration v{} should have description", m.version);
        }
    }

    #[test]
    fn test_all_migrations_unique_versions() {
        let migrations = all_migrations();
        let mut versions = std::collections::HashSet::new();
        for m in &migrations {
            assert!(
                versions.insert(m.version),
                "Duplicate migration version: v{}",
                m.version
            );
        }
    }

    #[tokio::test]
    async fn test_run_migrations_on_fresh_db() {
        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();

        sqlx::query(
            r#"CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                hermes_session_id TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                last_active_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                value TEXT NOT NULL UNIQUE,
                base_url TEXT NOT NULL DEFAULT '',
                api_key_env TEXT NOT NULL DEFAULT '',
                api_key TEXT NOT NULL DEFAULT '',
                is_builtin INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE avatar_gestures (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                duration INTEGER NOT NULL,
                look_at_x REAL NOT NULL DEFAULT 0.0,
                look_at_y REAL NOT NULL DEFAULT 0.0,
                tilt REAL NOT NULL DEFAULT 0.0,
                target_json TEXT NOT NULL DEFAULT '{}',
                source TEXT NOT NULL DEFAULT 'custom',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                timestamp INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE ai_roles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                responsibilities TEXT NOT NULL DEFAULT '',
                soul_content TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                avatar_preset TEXT NOT NULL DEFAULT '',
                avatar_color TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_builtin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                workspace_path TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE project_members (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                profile_name TEXT NOT NULL DEFAULT '',
                custom_soul TEXT NOT NULL DEFAULT '',
                custom_responsibilities TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE project_artifacts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                task_id TEXT NOT NULL DEFAULT '',
                artifact_type TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT '📚',
                directories TEXT NOT NULL DEFAULT '[]',
                embedding_model TEXT NOT NULL DEFAULT 'local',
                max_context_chunks INTEGER NOT NULL DEFAULT 8,
                status TEXT NOT NULL DEFAULT 'ready',
                file_count INTEGER NOT NULL DEFAULT 0,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        run_migrations(&pool).await.unwrap();

        let versions: Vec<(i64,)> = sqlx::query_as("SELECT version FROM _migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();

        let migrations = all_migrations();
        assert_eq!(versions.len(), migrations.len(), "All migrations should be recorded");

        for (i, m) in migrations.iter().enumerate() {
            assert_eq!(versions[i].0, m.version, "Migration v{} should be recorded", m.version);
        }
    }

    #[tokio::test]
    async fn test_run_migrations_idempotent() {
        let pool = sqlx::SqlitePool::connect(":memory:").await.unwrap();

        sqlx::query(
            r#"CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                hermes_session_id TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                last_active_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                value TEXT NOT NULL UNIQUE,
                base_url TEXT NOT NULL DEFAULT '',
                api_key_env TEXT NOT NULL DEFAULT '',
                api_key TEXT NOT NULL DEFAULT '',
                is_builtin INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE avatar_gestures (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                duration INTEGER NOT NULL,
                look_at_x REAL NOT NULL DEFAULT 0.0,
                look_at_y REAL NOT NULL DEFAULT 0.0,
                tilt REAL NOT NULL DEFAULT 0.0,
                target_json TEXT NOT NULL DEFAULT '{}',
                source TEXT NOT NULL DEFAULT 'custom',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thinking TEXT,
                timestamp INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE ai_roles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                responsibilities TEXT NOT NULL DEFAULT '',
                soul_content TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                avatar_preset TEXT NOT NULL DEFAULT '',
                avatar_color TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                is_builtin INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                workspace_path TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE project_members (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                profile_name TEXT NOT NULL DEFAULT '',
                custom_soul TEXT NOT NULL DEFAULT '',
                custom_responsibilities TEXT NOT NULL DEFAULT '',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE project_artifacts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                task_id TEXT NOT NULL DEFAULT '',
                artifact_type TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                file_path TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            r#"CREATE TABLE knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                icon TEXT NOT NULL DEFAULT '📚',
                directories TEXT NOT NULL DEFAULT '[]',
                embedding_model TEXT NOT NULL DEFAULT 'local',
                max_context_chunks INTEGER NOT NULL DEFAULT 8,
                status TEXT NOT NULL DEFAULT 'ready',
                file_count INTEGER NOT NULL DEFAULT 0,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )"#,
        )
        .execute(&pool)
        .await
        .unwrap();

        run_migrations(&pool).await.unwrap();
        run_migrations(&pool).await.unwrap();

        let versions: Vec<(i64,)> = sqlx::query_as("SELECT version FROM _migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();

        let migrations = all_migrations();
        assert_eq!(versions.len(), migrations.len(), "Running migrations twice should not duplicate records");
    }
}
