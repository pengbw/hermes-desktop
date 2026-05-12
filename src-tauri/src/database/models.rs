use serde::{Deserialize, Serialize};

fn load_gesture_json(name: &str) -> &'static str {
    let raw = match name {
        "silent" => include_str!("../../../public/silent.json"),
        "greeting" => include_str!("../../../public/greeting.json"),
        "think" => include_str!("../../../public/think.json"),
        _ => return "{}",
    };
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        if let Some(pose) = v.get("pose") {
            return Box::leak(pose.to_string().into_boxed_str());
        }
    }
    "{}"
}

pub fn db_path() -> std::path::PathBuf {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop");

    let _ = std::fs::create_dir_all(&data_dir);

    let test_file = data_dir.join(".write_test");
    if std::fs::write(&test_file, b"test").is_ok() {
        let _ = std::fs::remove_file(&test_file);
        return data_dir.join("hermes.db");
    }

    let fallback = std::env::current_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join(".hermes-data");
    let _ = std::fs::create_dir_all(&fallback);
    log::warn!("Data directory not writable, using fallback: {}", fallback.display());
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

    let builtin_providers = [
        ("nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
        ("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
        ("openai", "OpenAI", "https://api.openai.com/v1", "OPENAI_API_KEY"),
        ("anthropic", "Anthropic", "https://api.anthropic.com/v1", "ANTHROPIC_API_KEY"),
        ("nous", "Nous", "", "NOUS_API_KEY"),
        ("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY"),
        ("ollama", "Ollama (Local)", "http://localhost:11434/v1", ""),
        ("minimax", "MiniMax", "", "MINIMAX_API_KEY"),
        ("minimax-cn", "MiniMax (China)", "", "MINIMAX_API_KEY"),
        ("zai", "Z.AI / GLM", "", "ZAI_API_KEY"),
        ("kimi", "Kimi", "https://api.moonshot.cn/v1", "KIMI_API_KEY"),
    ];

    for (i, (value, name, base_url, api_key_env)) in builtin_providers.iter().enumerate() {
        let id = format!("builtin_{}", value);
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            "INSERT OR IGNORE INTO providers (id, name, value, base_url, api_key_env, is_builtin, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)"
        )
        .bind(&id)
        .bind(name)
        .bind(value)
        .bind(base_url)
        .bind(api_key_env)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string()).ok();
    }

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS ai_roles (
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
        CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_project_workflows_project ON project_workflows(project_id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_project_artifacts_project ON project_artifacts(project_id)
        "#,
    )
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
            created_at INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_project_messages_project ON project_messages(project_id)
        "#,
    )
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
            status TEXT NOT NULL DEFAULT 'triage',
            priority INTEGER NOT NULL DEFAULT 0,
            parent_task_id TEXT,
            artifact_id TEXT,
            result TEXT NOT NULL DEFAULT '',
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
        CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id)
        "#,
    )
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

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_knowledge_files_kb ON knowledge_files(knowledge_base_id)
        "#,
    )
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

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(knowledge_base_id)
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file ON knowledge_chunks(file_id)
        "#,
    )
    .execute(pool)
    .await?;

    let builtin_roles = [
        ("pm", "项目经理", "老李", "📋", "项目管理、进度把控、资料流转中枢", "负责项目整体进度管理，审阅各角色产出物，把控流转节奏，协调角色间协作", "你是项目经理，负责项目整体管理和进度把控。你的核心职责是：\n1. 审阅各角色的产出物，确保质量\n2. 把控任务流转节奏，决定是否推进到下一阶段\n3. 协调角色间的协作和沟通\n4. 对重要决策节点进行把关\n\n工作方式：收到角色提交的产出物后，进行审阅并决定是否流转到下一角色。"),
        ("researcher", "需求调研员", "小赵", "🔍", "搜集资料、调研报告", "负责项目前期的资料搜集和调研工作，产出调研报告", "你是需求调研员，负责项目前期的资料搜集和调研工作。你的核心职责是：\n1. 根据项目需求，搜集相关资料和行业信息\n2. 分析竞品和市场需求\n3. 产出结构化的调研报告\n\n产出格式：调研报告，包含背景分析、竞品对比、市场趋势、关键发现和建议。"),
        ("analyst", "需求分析师", "小周", "📊", "拆解整理需求", "负责将调研结果拆解整理为结构化的需求文档", "你是需求分析师，负责将调研结果拆解整理为结构化的需求文档。你的核心职责是：\n1. 分析调研报告，提取核心需求\n2. 拆解功能需求和非功能需求\n3. 产出结构化的需求文档\n\n产出格式：需求文档，包含功能需求列表、非功能需求、优先级排序、验收标准。"),
        ("product", "产品经理", "小陈", "📝", "PRD和原型设计", "负责根据需求文档编写PRD和设计产品原型", "你是产品经理，负责根据需求文档编写PRD和设计产品原型。你的核心职责是：\n1. 将需求转化为产品方案\n2. 编写详细的PRD文档\n3. 设计产品原型和交互流程\n\n产出格式：PRD文档（包含产品概述、用户故事、功能规格、交互流程）+ 原型设计。"),
        ("ui", "UI设计师", "小刘", "🎨", "视觉设计和交互设计", "负责根据PRD和原型进行视觉设计和交互设计", "你是UI设计师，负责根据PRD和原型进行视觉设计和交互设计。你的核心职责是：\n1. 根据PRD和原型设计视觉方案\n2. 制定设计规范和组件库\n3. 产出完整的UI设计稿\n\n产出格式：UI设计稿，包含设计规范、页面设计、组件设计、标注说明。"),
        ("architect", "系统架构师", "老王", "🏗️", "架构设计和技术文档", "负责系统架构设计、技术选型和框架搭建", "你是系统架构师，负责系统架构设计、技术选型和框架搭建。你的核心职责分三个阶段：\n1. 技术调研：分析技术方案，产出调研报告\n2. 架构设计：设计系统架构，产出技术文档\n3. 框架搭建：搭建项目框架骨架\n\n每个阶段完成后需等待项目经理确认。产出格式：技术调研报告、架构文档（含架构图、模块划分、接口设计、数据模型）、框架代码。"),
        ("frontend", "前端高级开发工程师", "小张", "💻", "前端业务开发", "负责前端业务功能开发", "你是前端高级开发工程师，负责前端业务功能开发。你的核心职责是：\n1. 根据UI设计稿和接口文档开发前端页面\n2. 与后端工程师进行接口对接\n3. 自测功能完整性\n\n工作方式：与后端并行开发，接口对接后进行联调自测，完成后提交测试。"),
        ("backend", "后端高级开发工程师", "小孙", "⚙️", "后端业务开发", "负责后端业务功能开发和API设计", "你是后端高级开发工程师，负责后端业务功能开发和API设计。你的核心职责是：\n1. 根据架构文档和需求开发后端服务\n2. 设计和实现API接口\n3. 与前端工程师进行接口对接\n\n工作方式：与前端并行开发，提供接口文档，接口对接后进行联调自测，完成后提交测试。"),
        ("tester", "测试工程师", "小吴", "🧪", "功能测试、安全测试、缺陷管理", "负责功能测试、安全测试和缺陷管理", "你是测试工程师，负责功能测试、安全测试和缺陷管理。你的核心职责是：\n1. 根据需求文档编写测试用例\n2. 执行功能测试和安全测试\n3. 发现Bug后打回给开发修复\n4. 复测修复结果\n5. 产出测试报告\n\n工作方式：收到开发提交后进行测试，发现Bug打回修复，修复后复测，全部通过后产出测试报告，等待确认上线。"),
        ("user", "用户", "用户", "👤", "项目决策者、审批确认", "负责项目关键节点的审批和确认，是最终决策者", "你是用户，项目的决策者和最终确认人。你的核心职责是：\n1. 在关键决策节点进行审批确认\n2. 审阅重要产出物并给出反馈\n3. 决定是否推进到下一阶段\n4. 对不满意的产出物打回修改\n\n工作方式：在需要确认的流程节点，你会收到审批请求，可以选择通过或打回。通过则流程继续，打回则退回上一角色修改。"),
    ];

    for (i, (role_id, name, nickname, icon, desc, resp, soul)) in builtin_roles.iter().enumerate() {
        let id = format!("builtin_{}", role_id);
        let now = chrono::Utc::now().timestamp_millis();
        let exists: bool = sqlx::query_scalar("SELECT COUNT(*) FROM ai_roles WHERE id = ?")
            .bind(&id)
            .fetch_one(pool)
            .await
            .map(|count: i64| count > 0)
            .unwrap_or(false);
        if exists {
            continue;
        }
        sqlx::query(
            "INSERT INTO ai_roles (id, name, nickname, icon, description, responsibilities, soul_content, sort_order, is_builtin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
        )
        .bind(&id)
        .bind(name)
        .bind(nickname)
        .bind(icon)
        .bind(desc)
        .bind(resp)
        .bind(soul)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string()).ok();
    }

    let builtin_gestures = [
        (
            "silent",
            0_i64,
            0.0_f64,
            0.0_f64,
            0.0_f64,
            load_gesture_json("silent"),
        ),
        (
            "greeting",
            8000_i64,
            0.0_f64,
            0.0_f64,
            0.0_f64,
            load_gesture_json("greeting"),
        ),
        (
            "think",
            5000_i64,
            0.3_f64,
            -0.3_f64,
            -0.08_f64,
            load_gesture_json("think"),
        ),
    ];

    for (name, duration, look_at_x, look_at_y, tilt, target_json) in builtin_gestures.iter() {
        let id = format!("gesture_{}", name);
        let now = chrono::Utc::now().timestamp_millis();
        let exists: bool = sqlx::query_scalar("SELECT COUNT(*) FROM avatar_gestures WHERE name = ?")
            .bind(name)
            .fetch_one(pool)
            .await
            .map(|count: i64| count > 0)
            .unwrap_or(false);
        if exists {
            sqlx::query("UPDATE avatar_gestures SET source = 'system' WHERE name = ?")
                .bind(name)
                .execute(pool)
                .await
                .map_err(|e| e.to_string()).ok();
            if *name == "silent" {
                sqlx::query("UPDATE avatar_gestures SET target_json = ?, duration = 0 WHERE name = 'silent'")
                    .bind(target_json)
                    .execute(pool)
                    .await
                    .map_err(|e| e.to_string()).ok();
            }
            continue;
        }
        sqlx::query(
            "INSERT INTO avatar_gestures (id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'system', ?, ?)"
        )
        .bind(&id)
        .bind(name)
        .bind(duration)
        .bind(look_at_x)
        .bind(look_at_y)
        .bind(tilt)
        .bind(target_json)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string()).ok();
    }

    crate::database::migrations::run_migrations(pool).await?;

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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageRequest {
    pub id: String,
    pub content: String,
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
pub struct ProjectMessage {
    pub id: String,
    pub project_id: String,
    pub role_id: String,
    pub content: String,
    pub message_type: String,
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

#[derive(Serialize, Deserialize, Debug, Clone)]
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
