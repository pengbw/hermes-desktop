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
        Migration {
            version: 27,
            description: "add project_tasks claim and time fields",
            sql: "ALTER TABLE project_tasks ADD COLUMN claim_lock TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 28,
            description: "add project_tasks.claim_expire_at",
            sql: "ALTER TABLE project_tasks ADD COLUMN claim_expire_at INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 29,
            description: "add project_tasks.started_at",
            sql: "ALTER TABLE project_tasks ADD COLUMN started_at INTEGER",
        },
        Migration {
            version: 30,
            description: "add project_tasks.completed_at",
            sql: "ALTER TABLE project_tasks ADD COLUMN completed_at INTEGER",
        },
        Migration {
            version: 31,
            description: "add project_tasks.skills",
            sql: "ALTER TABLE project_tasks ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'",
        },
        Migration {
            version: 32,
            description: "add project_tasks.max_retries",
            sql: "ALTER TABLE project_tasks ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 33,
            description: "add project_tasks.retry_count",
            sql: "ALTER TABLE project_tasks ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 34,
            description: "add project_tasks.workspace_kind",
            sql: "ALTER TABLE project_tasks ADD COLUMN workspace_kind TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 35,
            description: "add project_tasks.workspace_path",
            sql: "ALTER TABLE project_tasks ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 36,
            description: "add project_memories table",
            sql: "CREATE TABLE IF NOT EXISTS project_memories (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, role_id TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'general', content TEXT NOT NULL, importance INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE)",
        },
        Migration {
            version: 37,
            description: "add idx_project_memories_project",
            sql: "CREATE INDEX IF NOT EXISTS idx_project_memories_project ON project_memories(project_id)",
        },
        Migration {
            version: 38,
            description: "add idx_project_memories_role_category",
            sql: "CREATE INDEX IF NOT EXISTS idx_project_memories_role_category ON project_memories(role_id, category)",
        },
        Migration {
            version: 39,
            description: "create project_file_records table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS project_file_records (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    role_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_ext TEXT NOT NULL DEFAULT '',
                    file_size INTEGER NOT NULL DEFAULT 0,
                    description TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_file_records_project ON project_file_records(project_id);
                CREATE INDEX IF NOT EXISTS idx_file_records_role ON project_file_records(project_id, role_id);
            "#,
        },
        Migration {
            version: 40,
            description: "create task_dispatches table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS task_dispatches (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    role_id TEXT NOT NULL,
                    dispatch_type TEXT NOT NULL DEFAULT 'manual',
                    message TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_task_dispatches_task ON task_dispatches(task_id);
            "#,
        },
        Migration {
            version: 41,
            description: "add task_id to project_workflows",
            sql: "ALTER TABLE project_workflows ADD COLUMN task_id TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 42,
            description: "add condition_expr and branch_label to project_workflows",
            sql: "ALTER TABLE project_workflows ADD COLUMN condition_expr TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 43,
            description: "add branch_label to project_workflows",
            sql: "ALTER TABLE project_workflows ADD COLUMN branch_label TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 44,
            description: "add parallel_group to project_workflows",
            sql: "ALTER TABLE project_workflows ADD COLUMN parallel_group TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 45,
            description: "add token tracking fields to project_messages",
            sql: "ALTER TABLE project_messages ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 46,
            description: "add completion_tokens to project_messages",
            sql: "ALTER TABLE project_messages ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0",
        },
        Migration {
            version: 47,
            description: "create project_boards table for multi-board support",
            sql: r#"
                CREATE TABLE IF NOT EXISTS project_boards (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_project_boards_project ON project_boards(project_id);
            "#,
        },
        Migration {
            version: 48,
            description: "add board_id to project_tasks",
            sql: "ALTER TABLE project_tasks ADD COLUMN board_id TEXT NOT NULL DEFAULT ''",
        },
        Migration {
            version: 49,
            description: "create project_templates table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS project_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    icon TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    project_rule TEXT NOT NULL DEFAULT '',
                    project_guidelines TEXT NOT NULL DEFAULT '',
                    is_builtin INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            "#,
        },
        Migration {
            version: 50,
            description: "create template_roles table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS template_roles (
                    id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    icon TEXT NOT NULL DEFAULT '',
                    nickname TEXT NOT NULL DEFAULT '',
                    description TEXT NOT NULL DEFAULT '',
                    responsibilities TEXT NOT NULL DEFAULT '',
                    soul_content TEXT NOT NULL DEFAULT '',
                    avatar_preset TEXT NOT NULL DEFAULT '',
                    avatar_color TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_template_roles_template ON template_roles(template_id);
            "#,
        },
        Migration {
            version: 51,
            description: "create template_workflows table",
            sql: r#"
                CREATE TABLE IF NOT EXISTS template_workflows (
                    id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    from_role_index INTEGER,
                    to_role_index INTEGER NOT NULL,
                    artifact_type TEXT NOT NULL DEFAULT '',
                    transition_type TEXT NOT NULL DEFAULT 'auto_push',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_template_workflows_template ON template_workflows(template_id);
            "#,
        },
        Migration {
            version: 52,
            description: "remove template_roles, rebuild template_workflows with role_id",
            sql: r#"
                DROP TABLE IF EXISTS template_roles;
                DROP TABLE IF EXISTS template_workflows;

                CREATE TABLE template_workflows (
                    id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    from_role_id TEXT,
                    to_role_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL DEFAULT '',
                    transition_type TEXT NOT NULL DEFAULT 'auto_push',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE,
                    FOREIGN KEY (from_role_id) REFERENCES ai_roles(id) ON DELETE SET NULL,
                    FOREIGN KEY (to_role_id) REFERENCES ai_roles(id) ON DELETE CASCADE
                );
                CREATE INDEX idx_template_workflows_template ON template_workflows(template_id);
            "#,
        },
        Migration {
            version: 53,
            description: "add run_step_id to project_artifacts for workflow step association",
            sql: "ALTER TABLE project_artifacts ADD COLUMN run_step_id TEXT NOT NULL DEFAULT ''",
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
