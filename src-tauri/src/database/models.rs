use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

static GESTURE_CACHE: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();

fn load_gesture_json(name: &str) -> &'static str {
    let cache = GESTURE_CACHE.get_or_init(|| {
        let mut map = HashMap::new();
        for (n, raw) in [
            ("silent", include_str!("../../resources/silent.json")),
            ("greeting", include_str!("../../resources/greeting.json")),
            ("think", include_str!("../../resources/think.json")),
        ] {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
                if let Some(pose) = v.get("pose") {
                    let s: &'static str = Box::leak(pose.to_string().into_boxed_str());
                    map.insert(n, s);
                }
            }
        }
        map
    });
    cache.get(name).copied().unwrap_or("{}")
}

pub fn db_path() -> std::path::PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop");

    let _ = std::fs::create_dir_all(&data_dir);

    let db_file = data_dir.join("hermes.db");
    let test_file = data_dir.join(".write_test");
    if std::fs::write(&test_file, b"test").is_ok() {
        let _ = std::fs::remove_file(&test_file);
        log::info!("Database path (primary): {}", db_file.display());
        return db_file;
    }

    log::warn!("Data directory not writable: {}, trying fallback", data_dir.display());

    let fallback = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(".hermes-data");
    let _ = std::fs::create_dir_all(&fallback);
    log::warn!("Using fallback database: {}", fallback.join("hermes.db").display());
    fallback.join("hermes.db")
}

pub fn log_dir() -> std::path::PathBuf {
    let dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("logs");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub async fn init_db(pool: &sqlx::SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            hermes_session_id TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            source TEXT NOT NULL DEFAULT 'main',
            kb_ids TEXT,
            last_active_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

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
            files TEXT,
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

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS providers (
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
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS avatar_gestures (
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
        )
        "#,
    )
    .execute(pool)
    .await?;

    let providers_data = crate::database::seeds::load_providers();

    sqlx::query("ALTER TABLE providers ADD COLUMN icon TEXT NOT NULL DEFAULT ''")
        .execute(pool)
        .await
        .ok();

    for (i, provider) in providers_data.providers.iter().enumerate() {
        let id = format!("builtin_{}", provider.value);
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            "INSERT OR IGNORE INTO providers (id, name, value, base_url, api_key_env, icon, is_builtin, sort_order, created_at, updated_at) VALUES (?, '', ?, ?, ?, ?, 1, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&provider.value)
        .bind(&provider.base_url)
        .bind(&provider.api_key_env)
        .bind(&provider.icon)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string()).ok();

        sqlx::query("UPDATE providers SET icon = ? WHERE value = ? AND icon = ''")
            .bind(&provider.icon)
            .bind(&provider.value)
            .execute(pool)
            .await
            .ok();
    }

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ai_roles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nickname TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            responsibilities TEXT NOT NULL DEFAULT '',
            soul_content TEXT NOT NULL DEFAULT '',
            avatar_url TEXT NOT NULL DEFAULT '',
            avatar_type TEXT NOT NULL DEFAULT 'default',
            avatar_preset TEXT NOT NULL DEFAULT '',
            avatar_color TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            energy INTEGER NOT NULL DEFAULT 100,
            mood TEXT NOT NULL DEFAULT 'neutral',
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            workspace_path TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            tag TEXT NOT NULL DEFAULT 'none',
            icon TEXT NOT NULL DEFAULT '',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            cover_image TEXT NOT NULL DEFAULT '',
            project_rule TEXT NOT NULL DEFAULT '',
            project_guidelines TEXT NOT NULL DEFAULT '',
            office_theme TEXT NOT NULL DEFAULT 'cozy',
            office_layout TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_members (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            profile_name TEXT NOT NULL DEFAULT '',
            custom_soul TEXT NOT NULL DEFAULT '',
            custom_responsibilities TEXT NOT NULL DEFAULT '',
            equipment_level INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES ai_roles(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_workflows (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            from_role_id TEXT,
            to_role_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL DEFAULT '',
            transition_type TEXT NOT NULL DEFAULT 'auto_push',
            reject_to_role_id TEXT NOT NULL DEFAULT '',
            task_id TEXT NOT NULL DEFAULT '',
            condition_expr TEXT NOT NULL DEFAULT '',
            branch_label TEXT NOT NULL DEFAULT '',
            parallel_group TEXT NOT NULL DEFAULT '',
            is_primary BOOLEAN NOT NULL DEFAULT 0,
            group_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_artifacts (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            task_id TEXT NOT NULL DEFAULT '',
            artifact_type TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            review_comment TEXT NOT NULL DEFAULT '',
            run_step_id TEXT NOT NULL DEFAULT '',
            workflow_run_id TEXT,
            step_index INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_workflows_project ON project_workflows(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_artifacts_project ON project_artifacts(project_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_messages (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            content TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_messages_project ON project_messages(project_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            assignee TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'todo',
            priority INTEGER NOT NULL DEFAULT 0,
            parent_task_id TEXT,
            artifact_id TEXT,
            result TEXT NOT NULL DEFAULT '',
            claim_lock TEXT NOT NULL DEFAULT '',
            claim_expire_at INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER,
            completed_at INTEGER,
            skills TEXT NOT NULL DEFAULT '[]',
            max_retries INTEGER NOT NULL DEFAULT 0,
            retry_count INTEGER NOT NULL DEFAULT 0,
            workspace_kind TEXT NOT NULL DEFAULT '',
            workspace_path TEXT NOT NULL DEFAULT '',
            board_id TEXT NOT NULL DEFAULT '',
            workflow_group_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS knowledge_bases (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '📚',
            directories TEXT NOT NULL DEFAULT '[]',
            embedding_model TEXT NOT NULL DEFAULT 'local',
            retrieval_mode TEXT NOT NULL DEFAULT 'off',
            max_context_chunks INTEGER NOT NULL DEFAULT 8,
            auto_retrieve INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ready',
            file_count INTEGER NOT NULL DEFAULT 0,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS knowledge_files (
            id TEXT PRIMARY KEY,
            knowledge_base_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_ext TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            chunk_count INTEGER NOT NULL DEFAULT 0,
            index_status TEXT NOT NULL DEFAULT 'pending',
            modified_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_knowledge_files_kb ON knowledge_files(knowledge_base_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id TEXT PRIMARY KEY,
            knowledge_base_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            content TEXT NOT NULL,
            chunk_index INTEGER NOT NULL DEFAULT 0,
            vector BLOB,
            token_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE,
            FOREIGN KEY (file_id) REFERENCES knowledge_files(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(knowledge_base_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file ON knowledge_chunks(file_id)")
        .execute(pool)
        .await?;

    let gestures_data = crate::database::seeds::load_gestures();

    for gesture in &gestures_data.gestures {
        let id = format!("gesture_{}", gesture.name);
        let now = chrono::Utc::now().timestamp_millis();
        let exists: bool = sqlx::query_scalar("SELECT COUNT(*) FROM avatar_gestures WHERE name = ?")
            .bind(&gesture.name)
            .fetch_one(pool)
            .await
            .map(|count: i64| count > 0)
            .unwrap_or(false);
        if exists {
            sqlx::query("UPDATE avatar_gestures SET source = 'system' WHERE name = ?")
                .bind(&gesture.name)
                .execute(pool)
                .await
                .map_err(|e| e.to_string()).ok();
            if gesture.name == "silent" {
                let target_json = load_gesture_json("silent");
                sqlx::query("UPDATE avatar_gestures SET target_json = ?, duration = 0 WHERE name = 'silent'")
                    .bind(target_json)
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string()).ok();
            }
            continue;
        }
        let pose_name = gesture.pose_file.strip_suffix(".json").unwrap_or(&gesture.pose_file);
        let target_json = load_gesture_json(pose_name);
        sqlx::query(
            "INSERT INTO avatar_gestures (id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'system', ?, ?)"
        )
        .bind(&id)
        .bind(&gesture.name)
        .bind(gesture.duration)
        .bind(gesture.look_at_x)
        .bind(gesture.look_at_y)
        .bind(gesture.tilt)
        .bind(target_json)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string()).ok();
    }

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS task_comments (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS task_links (
            id TEXT PRIMARY KEY,
            from_task_id TEXT NOT NULL,
            to_task_id TEXT NOT NULL,
            link_type TEXT NOT NULL DEFAULT 'depends_on',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (from_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE,
            FOREIGN KEY (to_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_task_links_from ON task_links(from_task_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_task_links_to ON task_links(to_task_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS task_events (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            role_id TEXT,
            detail TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            workflow_id TEXT,
            current_step INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            context TEXT NOT NULL DEFAULT '{}',
            task_id TEXT NOT NULL DEFAULT '',
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workflow_run_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            step_index INTEGER NOT NULL,
            role_id TEXT,
            action TEXT NOT NULL DEFAULT 'auto_push',
            status TEXT NOT NULL DEFAULT 'pending',
            input TEXT NOT NULL DEFAULT '',
            output TEXT NOT NULL DEFAULT '',
            started_at INTEGER,
            completed_at INTEGER,
            FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run ON workflow_run_steps(run_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS artifact_versions (
            id TEXT PRIMARY KEY,
            artifact_id TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            content TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (artifact_id) REFERENCES project_artifacts(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifact_versions_artifact ON artifact_versions(artifact_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS role_skills (
            id TEXT PRIMARY KEY,
            role_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (role_id) REFERENCES ai_roles(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_role_skills_role ON role_skills(role_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_member_skills (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            member_id TEXT NOT NULL,
            skill_name TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (member_id) REFERENCES project_members(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_pms_project ON project_member_skills(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_pms_member ON project_member_skills(member_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_activities (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            detail TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_activities_project ON project_activities(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_activities_created ON project_activities(created_at)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_memories (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            content TEXT NOT NULL,
            importance INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_memories_project ON project_memories(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_memories_role_category ON project_memories(role_id, category)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_file_records (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            task_id TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_ext TEXT NOT NULL DEFAULT '',
            file_size INTEGER NOT NULL DEFAULT 0,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_records_project ON project_file_records(project_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_records_role ON project_file_records(project_id, role_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS task_dispatches (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            dispatch_type TEXT NOT NULL DEFAULT 'manual',
            message TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_task_dispatches_task ON task_dispatches(task_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
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
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_project_boards_project ON project_boards(project_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
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
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS template_workflows (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            from_role_id TEXT,
            to_role_id TEXT NOT NULL,
            artifact_type TEXT NOT NULL DEFAULT '',
            transition_type TEXT NOT NULL DEFAULT 'auto_push',
            reject_to_role_id TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (template_id) REFERENCES project_templates(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_template_workflows_template ON template_workflows(template_id)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS project_workflow_groups (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '默认流程',
            is_primary BOOLEAN NOT NULL DEFAULT 0,
            is_valid BOOLEAN NOT NULL DEFAULT 1,
            parent_group_id TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS skill_catalog (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            identifier TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            category_label TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT 'hub',
            trust TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]',
            config_schema TEXT NOT NULL DEFAULT '{}',
            user_config TEXT NOT NULL DEFAULT '{}',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL DEFAULT 0,
            UNIQUE(identifier)
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_skill_catalog_category ON skill_catalog(category)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_skill_catalog_source ON skill_catalog(source)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_role_status ON project_artifacts(project_id, role_id, status)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON project_tasks(project_id, assignee, status)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workflows_from_role ON project_workflows(project_id, from_role_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_workflows_to_role ON project_workflows(project_id, to_role_id)")
        .execute(pool)
        .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_run_steps_role_status ON workflow_run_steps(run_id, role_id, status)")
        .execute(pool)
        .await?;

    crate::database::migrations::run_migrations(pool).await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS channel_configs (
            id TEXT PRIMARY KEY,
            channel_type TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            config_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'disconnected',
            is_home INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            connected_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
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
    pub kb_ids: Option<String>,
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
    pub files: Option<String>,
    pub timestamp: i64,
    #[serde(default)]
    pub audio_path: Option<String>,
    #[serde(default)]
    pub audio_duration: Option<f64>,
    #[serde(default)]
    pub message_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationRequest {
    pub title: String,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageRequest {
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub thinking: Option<String>,
    #[serde(default)]
    pub files: Option<String>,
    #[serde(default)]
    pub audio_path: Option<String>,
    #[serde(default)]
    pub audio_duration: Option<f64>,
    #[serde(default)]
    pub message_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageRequest {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub audio_path: Option<String>,
    #[serde(default)]
    pub audio_duration: Option<f64>,
    #[serde(default)]
    pub message_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub value: String,
    pub base_url: String,
    pub api_key_env: String,
    pub api_key: String,
    pub icon: String,
    pub is_builtin: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProviderRequest {
    pub name: String,
    pub value: String,
    pub base_url: Option<String>,
    pub api_key_env: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProviderRequest {
    pub id: String,
    pub name: Option<String>,
    pub base_url: Option<String>,
    pub api_key_env: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AvatarGesture {
    pub id: String,
    pub name: String,
    pub duration: i64,
    pub look_at_x: f64,
    pub look_at_y: f64,
    pub tilt: f64,
    pub target_json: String,
    pub source: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAvatarGestureRequest {
    pub name: String,
    pub duration: i64,
    #[serde(default)]
    pub look_at_x: f64,
    #[serde(default)]
    pub look_at_y: f64,
    #[serde(default)]
    pub tilt: f64,
    #[serde(default)]
    pub target_json: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAvatarGestureRequest {
    pub id: String,
    pub name: Option<String>,
    pub duration: Option<i64>,
    pub look_at_x: Option<f64>,
    pub look_at_y: Option<f64>,
    pub tilt: Option<f64>,
    pub target_json: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AiRole {
    pub id: String,
    pub name: String,
    pub nickname: String,
    pub icon: String,
    pub description: String,
    pub responsibilities: String,
    pub soul_content: String,
    pub avatar_url: String,
    pub avatar_type: String,
    pub avatar_preset: String,
    pub avatar_color: String,
    pub department: String,
    pub sort_order: i64,
    pub is_builtin: bool,
    pub energy: i64,
    pub mood: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAiRoleRequest {
    pub name: String,
    pub nickname: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub responsibilities: Option<String>,
    pub soul_content: Option<String>,
    pub avatar_url: Option<String>,
    pub avatar_type: Option<String>,
    pub avatar_preset: Option<String>,
    pub avatar_color: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiRoleRequest {
    pub id: String,
    pub name: Option<String>,
    pub nickname: Option<String>,
    pub icon: Option<String>,
    pub description: Option<String>,
    pub responsibilities: Option<String>,
    pub soul_content: Option<String>,
    pub avatar_url: Option<String>,
    pub avatar_type: Option<String>,
    pub avatar_preset: Option<String>,
    pub avatar_color: Option<String>,
    pub energy: Option<i64>,
    pub mood: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub workspace_path: String,
    pub status: String,
    pub tag: String,
    pub icon: String,
    pub is_favorite: i64,
    pub cover_image: String,
    pub project_rule: String,
    pub project_guidelines: String,
    pub office_theme: String,
    pub office_layout: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub cover_image: Option<String>,
    pub project_rule: Option<String>,
    pub project_guidelines: Option<String>,
    pub office_theme: Option<String>,
    pub office_layout: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectRequest {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub tag: Option<String>,
    pub icon: Option<String>,
    pub is_favorite: Option<bool>,
    pub cover_image: Option<String>,
    pub project_rule: Option<String>,
    pub project_guidelines: Option<String>,
    pub office_theme: Option<String>,
    pub office_layout: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMember {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub profile_name: String,
    pub custom_soul: String,
    pub custom_responsibilities: String,
    pub equipment_level: i64,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectMemberRequest {
    pub project_id: String,
    pub role_id: String,
    pub profile_name: Option<String>,
    pub custom_soul: Option<String>,
    pub custom_responsibilities: Option<String>,
    pub equipment_level: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectWorkflow {
    pub id: String,
    pub project_id: String,
    pub from_role_id: Option<String>,
    pub to_role_id: String,
    pub artifact_type: String,
    pub transition_type: String,
    pub reject_to_role_id: String,
    pub task_id: String,
    pub condition_expr: String,
    pub branch_label: String,
    pub parallel_group: String,
    pub is_primary: bool,
    pub group_id: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectWorkflowRequest {
    pub project_id: String,
    pub from_role_id: Option<String>,
    pub to_role_id: String,
    pub artifact_type: Option<String>,
    pub transition_type: Option<String>,
    pub reject_to_role_id: Option<String>,
    pub task_id: Option<String>,
    pub condition_expr: Option<String>,
    pub branch_label: Option<String>,
    pub parallel_group: Option<String>,
    pub group_id: Option<String>,
}

// 流程组：支持项目多流程
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowGroup {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub is_primary: bool,
    pub is_valid: bool,
    pub parent_group_id: Option<String>,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkflowGroupRequest {
    pub project_id: String,
    pub name: Option<String>,
    pub parent_group_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectArtifact {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub task_id: String,
    pub artifact_type: String,
    pub title: String,
    pub file_path: String,
    pub content: String,
    pub status: String,
    pub review_comment: String,
    pub workflow_run_id: Option<String>,
    pub step_index: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectArtifactRequest {
    pub project_id: String,
    pub role_id: String,
    pub task_id: Option<String>,
    pub artifact_type: Option<String>,
    pub title: Option<String>,
    pub file_path: Option<String>,
    pub content: Option<String>,
    pub status: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFileRecord {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub task_id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_ext: String,
    pub file_size: i64,
    pub description: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileRecordRequest {
    pub project_id: String,
    pub role_id: String,
    pub task_id: Option<String>,
    pub file_path: String,
    pub file_name: String,
    pub file_ext: Option<String>,
    pub file_size: Option<i64>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoard {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub sort_order: i64,
    pub is_default: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectBoardRequest {
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectBoardRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub sort_order: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMessage {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub content: String,
    pub message_type: String,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectMessageRequest {
    pub project_id: String,
    pub role_id: String,
    pub content: String,
    pub message_type: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTask {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub body: String,
    pub assignee: String,
    pub status: String,
    pub priority: i32,
    pub parent_task_id: String,
    pub artifact_id: String,
    pub result: String,
    pub claim_lock: String,
    pub claim_expire_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub skills: String,
    pub max_retries: i32,
    pub retry_count: i32,
    pub workspace_kind: String,
    pub workspace_path: String,
    pub board_id: String,
    pub workflow_group_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectTaskRequest {
    pub project_id: String,
    pub title: String,
    pub body: Option<String>,
    pub assignee: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub parent_task_id: Option<String>,
    pub skills: Option<String>,
    pub max_retries: Option<i32>,
    pub workspace_kind: Option<String>,
    pub workspace_path: Option<String>,
}

// 任务进度查询结果
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub task: ProjectTask,
    pub workflow_run: Option<WorkflowRunStatus>,
    pub artifacts: Vec<ProjectArtifact>,
    pub activities: Vec<ProjectActivity>,
}

// 待审核任务
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewTask {
    pub task: ProjectTask,
    pub pending_artifacts: Vec<ProjectArtifact>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectTaskRequest {
    pub title: Option<String>,
    pub body: Option<String>,
    pub assignee: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub result: Option<String>,
    pub skills: Option<String>,
    pub max_retries: Option<i32>,
    pub workspace_kind: Option<String>,
    pub workspace_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskComment {
    pub id: String,
    pub task_id: String,
    pub role_id: String,
    pub content: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskCommentRequest {
    pub task_id: String,
    pub role_id: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskLink {
    pub id: String,
    pub from_task_id: String,
    pub to_task_id: String,
    pub link_type: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskEvent {
    pub id: String,
    pub task_id: String,
    pub event_type: String,
    pub role_id: Option<String>,
    pub detail: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub project_id: String,
    pub workflow_id: Option<String>,
    pub current_step: i64,
    pub status: String,
    pub context: String,
    pub task_id: String,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunStep {
    pub id: String,
    pub run_id: String,
    pub step_index: i64,
    pub role_id: Option<String>,
    pub action: String,
    pub status: String,
    pub input: String,
    pub output: String,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRunStatus {
    pub run: WorkflowRun,
    pub steps: Vec<WorkflowRunStep>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactVersion {
    pub id: String,
    pub artifact_id: String,
    pub version: i64,
    pub content: String,
    pub file_path: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDiff {
    pub from_version: ArtifactVersion,
    pub to_version: ArtifactVersion,
    pub additions: i64,
    pub deletions: i64,
    pub diff_text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoleSkill {
    pub id: String,
    pub role_id: String,
    pub skill_name: String,
    pub enabled: bool,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemberSkill {
    pub id: String,
    pub project_id: String,
    pub member_id: String,
    pub skill_name: String,
    pub enabled: bool,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectActivity {
    pub id: String,
    pub project_id: String,
    pub role_id: Option<String>,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub detail: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMemory {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub category: String,
    pub content: String,
    pub importance: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectMemoryRequest {
    pub project_id: String,
    pub role_id: String,
    pub category: Option<String>,
    pub content: String,
    pub importance: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    pub task_stats: TaskStats,
    pub artifact_stats: ArtifactStats,
    pub role_workload: Vec<RoleWorkload>,
    pub health_score: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TaskStats {
    pub total: i64,
    pub by_status: std::collections::HashMap<String, i64>,
    pub completion_rate: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactStats {
    pub total: i64,
    pub by_status: std::collections::HashMap<String, i64>,
    pub approval_rate: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RoleWorkload {
    pub role_id: String,
    pub name: String,
    pub task_count: i64,
    pub completed_count: i64,
    pub avg_duration: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub directories: String,
    pub embedding_model: String,
    pub retrieval_mode: String,
    pub max_context_chunks: i64,
    pub auto_retrieve: bool,
    pub status: String,
    pub file_count: i64,
    pub chunk_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeBaseRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub directories: Option<String>,
    pub embedding_model: Option<String>,
    pub retrieval_mode: Option<String>,
    pub max_context_chunks: Option<i64>,
    pub auto_retrieve: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKnowledgeBaseRequest {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub directories: Option<String>,
    pub embedding_model: Option<String>,
    pub retrieval_mode: Option<String>,
    pub max_context_chunks: Option<i64>,
    pub auto_retrieve: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFile {
    pub id: String,
    pub knowledge_base_id: String,
    pub file_path: String,
    pub file_name: String,
    pub file_ext: String,
    pub file_size: i64,
    pub chunk_count: i64,
    pub index_status: String,
    pub modified_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTemplate {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub description: String,
    pub project_rule: String,
    pub project_guidelines: String,
    pub is_builtin: bool,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TemplateWorkflow {
    pub id: String,
    pub template_id: String,
    pub from_role_id: Option<String>,
    pub to_role_id: String,
    pub artifact_type: String,
    pub transition_type: String,
    pub reject_to_role_id: String,
    pub sort_order: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTemplateDetail {
    #[serde(flatten)]
    pub template: ProjectTemplate,
    pub roles: Vec<AiRole>,
    pub workflows: Vec<TemplateWorkflow>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectFromTemplateRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub template_id: String,
    pub office_theme: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateEmptyProjectRequest {
    pub name: String,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub office_theme: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogItem {
    pub id: String,
    pub name: String,
    pub identifier: String,
    pub category: String,
    pub category_label: String,
    pub description: String,
    pub source: String,
    pub trust: String,
    pub version: String,
    pub tags: String,
    pub config_schema: String,
    pub user_config: String,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}
