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

    for alter in [
        "ALTER TABLE providers ADD COLUMN api_key TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE avatar_gestures ADD COLUMN source TEXT NOT NULL DEFAULT 'custom'",
        "ALTER TABLE messages ADD COLUMN files TEXT",
    ] {
        let _ = sqlx::query(alter).execute(pool).await;
    }

    let builtin_providers = [
        ("nvidia", "NVIDIA NIM", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY"),
        ("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY"),
        ("openai", "OpenAI", "https://api.openai.com/v1", "OPENAI_API_KEY"),
        ("anthropic", "Anthropic", "https://api.anthropic.com/v1", "ANTHROPIC_API_KEY"),
        ("nous", "Nous", "", "NOUS_API_KEY"),
        ("deepseek", "DeepSeek", "https://api.deepseek.com/v1", "DEEPSEEK_API_KEY"),
        ("ollama", "Ollama (本地)", "http://localhost:11434/v1", ""),
        ("minimax", "MiniMax", "", "MINIMAX_API_KEY"),
        ("minimax-cn", "MiniMax (中国)", "", "MINIMAX_API_KEY"),
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

    let builtin_gestures = [
        (
            "silent",
            0_i64,
            0.0_f64,
            0.0_f64,
            0.0_f64,
            r#"{}"#,
        ),
        (
            "greeting",
            8000_i64,
            0.0_f64,
            0.0_f64,
            0.0_f64,
            r#"{"leftUpperArm":{"position":[0,0,0],"rotation":[0,0,0.605186,0.796084]},"rightUpperArm":{"position":[0,0,0],"rotation":[-0.303564,0.511747,-0.032165,0.803075]},"leftLowerArm":{"position":[0,0,0],"rotation":[0,0,0.049979,0.99875]},"rightLowerArm":{"position":[0,0,0],"rotation":[0.454649,0.454649,0.708073,0.291927]},"rightHand":{"position":[0,0,0],"rotation":[-0.104175,0.039527,-0.104175,0.988298]},"rightThumbMetacarpal":{"position":[0,0,0],"rotation":[0.161773,0.132271,0.119824,0.970555]},"rightThumbProximal":{"position":[0,0,0],"rotation":[0.099833,0,0,0.995004]},"rightThumbDistal":{"position":[0,0,0],"rotation":[0.099833,0,0,0.995004]},"rightIndexProximal":{"position":[0,0,0],"rotation":[0,0,-0.149438,0.988771]},"rightIndexIntermediate":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightIndexDistal":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightMiddleProximal":{"position":[0,0,0],"rotation":[0,0,-0.149438,0.988771]},"rightMiddleIntermediate":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightMiddleDistal":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightRingProximal":{"position":[0,0,0],"rotation":[0,0,-0.149438,0.988771]},"rightRingIntermediate":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightRingDistal":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightLittleProximal":{"position":[0,0,0],"rotation":[0,0,-0.149438,0.988771]},"rightLittleIntermediate":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]},"rightLittleDistal":{"position":[0,0,0],"rotation":[0,0,-0.099833,0.995004]}}"#,
        ),
        (
            "think",
            5000_i64,
            0.3_f64,
            -0.3_f64,
            -0.08_f64,
            r#"{"hips":{"position":[0,0,0],"rotation":[0,0,0,1]},"spine":{"position":[0,0,0],"rotation":[0,0,0,1]},"chest":{"position":[0,0,0],"rotation":[0,0,0,1]},"upperChest":{"position":[0,0,0],"rotation":[0,0,0,1]},"neck":{"position":[0,0,0],"rotation":[0.00858609197003729,-0.10388657662891106,0.021573862350766193,0.9943180711846074]},"head":{"position":[0,0,0],"rotation":[0.08345126655993985,0.0002492061031117632,0.10551524183241544,0.9909098635834176]},"leftEye":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightEye":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftUpperLeg":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftLowerLeg":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftFoot":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftToes":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightUpperLeg":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightLowerLeg":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightFoot":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightToes":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftShoulder":{"position":[0,0,0],"rotation":[0.10962026202597093,0.043166549335375996,0.061320421791995185,0.9911406827706579]},"leftUpperArm":{"position":[0,0,0],"rotation":[0.12851175634296264,-0.18954069849938737,0.5631267213387391,0.7940071459428395]},"leftLowerArm":{"position":[0,0,0],"rotation":[-0.412089952600085,-0.5094295288093464,0.538231329277798,0.5300664697252615]},"leftHand":{"position":[0,0,0],"rotation":[0.1035218740803728,-0.003866041239642172,0.2669691652636122,0.9581209423191163]},"rightShoulder":{"position":[0,0,0],"rotation":[0.008859390483535335,0.07251303666101228,-0.012103436329397876,0.9972546703543078]},"rightUpperArm":{"position":[0,0,0],"rotation":[0.11919197561956842,0.10165827989205732,-0.5886242552333382,0.7930828161221819]},"rightLowerArm":{"position":[0,0,0],"rotation":[0,0.9598211130776013,0,0.2806125993081466]},"rightHand":{"position":[0,0,0],"rotation":[0.2054241973541633,0.14666635184503019,-0.18085714238946418,0.9505685532483099]},"leftThumbMetacarpal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftThumbProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftThumbDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftIndexProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftIndexIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftIndexDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftMiddleProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftMiddleIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftMiddleDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftRingProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftRingIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftRingDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftLittleProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftLittleIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"leftLittleDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightThumbMetacarpal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightThumbProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightThumbDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightIndexProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightIndexIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightIndexDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightMiddleProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightMiddleIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightMiddleDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightRingProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightRingIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightRingDistal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightLittleProximal":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightLittleIntermediate":{"position":[0,0,0],"rotation":[0,0,0,1]},"rightLittleDistal":{"position":[0,0,0],"rotation":[0,0,0,1]}}"#,
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
