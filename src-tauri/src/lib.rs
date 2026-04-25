mod commands;
mod db;

use serde::Serialize;
use sqlx::SqlitePool;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

pub struct AppState {
    pub db_pool: SqlitePool,
}

struct AgentProcess(Mutex<Option<std::process::Child>>);

#[derive(Serialize, Clone)]
struct ChatStreamEvent {
    chunk: String,
    done: bool,
}

#[derive(Serialize)]
struct ChatResponse {
    content: String,
    thinking: Option<String>,
}

#[derive(Serialize, Clone)]
struct HermesInfo {
    installed: bool,
    running: bool,
    version: String,
    python: String,
    model: String,
    provider: String,
    project_path: String,
    api_keys: Vec<ApiKeyStatus>,
}

#[derive(Serialize, Clone)]
struct ApiKeyStatus {
    name: String,
    configured: bool,
}

/// 获取 Hermes Agent 信息（版本、状态、模型等）
#[tauri::command]
async fn get_hermes_info() -> Result<HermesInfo, String> {
    // 1. 检查 hermes 是否安装（运行 hermes version）
    let version_output = Command::new("hermes")
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let (installed, version, python, project_path) = match version_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut ver = String::new();
            let mut py = String::new();
            let mut proj = String::new();

            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("Hermes Agent") {
                    // "Hermes Agent v0.11.0 (2026.4.23)"
                    ver = line.to_string();
                } else if line.starts_with("Python:") {
                    py = line.replace("Python:", "").trim().to_string();
                } else if line.starts_with("Project:") {
                    proj = line.replace("Project:", "").trim().to_string();
                }
            }
            (output.status.success(), ver, py, proj)
        }
        Err(_) => (false, String::new(), String::new(), String::new()),
    };

    if !installed {
        return Ok(HermesInfo {
            installed: false,
            running: false,
            version: String::new(),
            python: String::new(),
            model: String::new(),
            provider: String::new(),
            project_path: String::new(),
            api_keys: vec![],
        });
    }

    // 2. 运行 hermes status 获取模型和 API 信息
    let status_output = Command::new("hermes")
        .arg("status")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let (model, provider, api_keys) = match status_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut model = String::new();
            let mut provider = String::new();
            let mut keys: Vec<ApiKeyStatus> = Vec::new();
            let mut in_api_section = false;

            for line in stdout.lines() {
                let line_trimmed = line.trim();
                // 去掉 ANSI 颜色码
                let clean = strip_ansi(line_trimmed);
                let clean = clean.trim();

                if clean.starts_with("Model:") {
                    model = clean.replace("Model:", "").trim().to_string();
                } else if clean.starts_with("Provider:") {
                    provider = clean.replace("Provider:", "").trim().to_string();
                } else if clean.contains("API Keys") {
                    in_api_section = true;
                } else if clean.starts_with("◆") && in_api_section {
                    in_api_section = false;
                } else if in_api_section && (clean.contains("✓") || clean.contains("✗")) {
                    let configured = clean.contains("✓");
                    let name = clean
                        .replace("✓", "")
                        .replace("✗", "")
                        .split("(")
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !name.is_empty() {
                        keys.push(ApiKeyStatus { name, configured });
                    }
                }
            }
            (model, provider, keys)
        }
        Err(_) => (String::new(), String::new(), vec![]),
    };

    // 3. 检查 hermes 进程是否在运行
    let running = check_hermes_process();

    Ok(HermesInfo {
        installed,
        running,
        version,
        python,
        model,
        provider,
        project_path,
        api_keys,
    })
}

fn strip_ansi(s: &str) -> String {
    let mut result = String::new();
    let mut in_escape = false;
    for c in s.chars() {
        if c == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if c.is_ascii_alphabetic() {
                in_escape = false;
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn check_hermes_process() -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("pgrep")
            .arg("-f")
            .arg("hermes")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            return output.status.success();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("tasklist")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            let out = String::from_utf8_lossy(&output.stdout);
            return out.contains("hermes");
        }
    }
    false
}

/// 获取会话数量
#[tauri::command]
async fn get_conversation_count(app: AppHandle) -> Result<i64, String> {
    let state = app.state::<AppState>();
    let pool = &state.db_pool;
    let row = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM conversations")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.0)
}

#[derive(Serialize, Clone)]
struct HermesSkill {
    name: String,
    category: String,
    source: String,
    trust: String,
}

#[derive(Serialize, Clone)]
struct HermesSkillsResult {
    skills: Vec<HermesSkill>,
    total: usize,
    hub_installed: usize,
    builtin: usize,
    local: usize,
}

/// 获取 Hermes Agent 已安装的技能列表
#[tauri::command]
async fn list_hermes_skills() -> Result<HermesSkillsResult, String> {
    let output = Command::new("hermes")
        .args(&["skills", "list"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("运行 hermes skills list 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills: Vec<HermesSkill> = Vec::new();
    let mut hub_installed: usize = 0;
    let mut builtin: usize = 0;
    let mut local: usize = 0;

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        // 解析表格行：“│ name │ category │ source │ trust │”
        if clean.starts_with("│") || clean.starts_with("|") {
            let sep = if clean.contains("│") { "│" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let category = parts[1].to_string();
                let source = parts[2].to_string();
                let trust = parts[3].to_string();

                // 跳过表头
                if name == "Name" || name.contains("━") || name.contains("-") && category.contains("-") {
                    continue;
                }

                skills.push(HermesSkill { name, category, source, trust });
            }
        }

        // 解析统计行：“0 hub-installed, 74 builtin, 12 local”
        if clean.contains("hub-installed") && clean.contains("builtin") {
            for part in clean.split(',') {
                let part = part.trim();
                if part.contains("hub-installed") {
                    hub_installed = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                } else if part.contains("builtin") {
                    builtin = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                } else if part.contains("local") {
                    local = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                }
            }
        }
    }

    let total = skills.len();
    Ok(HermesSkillsResult {
        skills,
        total,
        hub_installed,
        builtin,
        local,
    })
}

#[derive(Serialize, Clone)]
struct HermesConfig {
    model: String,
    provider: String,
    base_url: String,
    max_turns: i64,
    personality: String,
    show_reasoning: bool,
    timezone: String,
    terminal_backend: String,
    terminal_timeout: i64,
    compression_enabled: bool,
    memory_enabled: bool,
    tts_provider: String,
    config_path: String,
    env_path: String,
}

/// 获取 Hermes Agent 配置
#[tauri::command]
async fn get_hermes_config() -> Result<HermesConfig, String> {
    // 获取配置文件路径
    let config_path_output = Command::new("hermes")
        .args(&["config", "path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("获取配置路径失败: {}", e))?;
    let config_path = String::from_utf8_lossy(&config_path_output.stdout).trim().to_string();

    let env_path_output = Command::new("hermes")
        .args(&["config", "env-path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("获取 env 路径失败: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    // 读取 config.yaml
    let yaml_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("读取配置文件失败: {}", e))?;

    let yaml = serde_yaml_to_json(&yaml_content);

    let model = yaml.pointer("/model/default")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let provider = yaml.pointer("/model/provider")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let base_url = yaml.pointer("/model/base_url")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let max_turns = yaml.pointer("/agent/max_turns")
        .and_then(|v| v.as_i64()).unwrap_or(90);
    let personality = yaml.pointer("/display/personality")
        .and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let show_reasoning = yaml.pointer("/display/show_reasoning")
        .and_then(|v| v.as_bool()).unwrap_or(false);
    let timezone = yaml.get("timezone")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let terminal_backend = yaml.pointer("/terminal/backend")
        .and_then(|v| v.as_str()).unwrap_or("local").to_string();
    let terminal_timeout = yaml.pointer("/terminal/timeout")
        .and_then(|v| v.as_i64()).unwrap_or(180);
    let compression_enabled = yaml.pointer("/compression/enabled")
        .and_then(|v| v.as_bool()).unwrap_or(true);
    let memory_enabled = yaml.pointer("/memory/memory_enabled")
        .and_then(|v| v.as_bool()).unwrap_or(true);
    let tts_provider = yaml.pointer("/tts/provider")
        .and_then(|v| v.as_str()).unwrap_or("edge").to_string();

    Ok(HermesConfig {
        model,
        provider,
        base_url,
        max_turns,
        personality,
        show_reasoning,
        timezone,
        terminal_backend,
        terminal_timeout,
        compression_enabled,
        memory_enabled,
        tts_provider,
        config_path,
        env_path,
    })
}

/// 简化版 YAML 解析（转为 JSON Value）
fn serde_yaml_to_json(yaml_str: &str) -> serde_json::Value {
    let mut root = serde_json::Map::new();
    let mut current_section = String::new();

    for line in yaml_str.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let indent = line.len() - line.trim_start().len();

        if let Some(colon_pos) = trimmed.find(':') {
            let key = trimmed[..colon_pos].trim().to_string();
            let value_str = trimmed[colon_pos + 1..].trim();

            if indent == 0 {
                if value_str.is_empty() || value_str == "{}" || value_str == "[]" {
                    current_section = key.clone();
                    if !root.contains_key(&key) {
                        root.insert(key, serde_json::Value::Object(serde_json::Map::new()));
                    }
                } else {
                    current_section.clear();
                    root.insert(key, parse_yaml_value(value_str));
                }
            } else if indent >= 2 && !current_section.is_empty() {
                let section = root.entry(current_section.clone())
                    .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
                if let serde_json::Value::Object(map) = section {
                    map.insert(key, parse_yaml_value(value_str));
                }
            }
        }
    }

    serde_json::Value::Object(root)
}

fn parse_yaml_value(s: &str) -> serde_json::Value {
    if s.is_empty() || s == "''" || s == "\"\"" {
        return serde_json::Value::String(String::new());
    }
    if s == "true" || s == "yes" {
        return serde_json::Value::Bool(true);
    }
    if s == "false" || s == "no" || s == "off" {
        return serde_json::Value::Bool(false);
    }
    if let Ok(n) = s.parse::<i64>() {
        return serde_json::Value::Number(serde_json::Number::from(n));
    }
    if let Ok(f) = s.parse::<f64>() {
        if let Some(n) = serde_json::Number::from_f64(f) {
            return serde_json::Value::Number(n);
        }
    }
    let unquoted = s.trim_matches('\'').trim_matches('"');
    serde_json::Value::String(unquoted.to_string())
}

/// 修改 Hermes Agent 配置
#[tauri::command]
async fn set_hermes_config(key: String, value: String) -> Result<String, String> {
    let output = Command::new("hermes")
        .args(&["config", "set", &key, &value])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("修改配置失败: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

/// 重启 Hermes Agent
#[tauri::command]
fn restart_hermes(state: State<'_, AgentProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }

    let child = Command::new("hermes")
        .arg("acp")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    *guard = Some(child);
    Ok("Hermes Agent 已重启".to_string())
}

/// 与 Hermes Agent 对话（阻塞式，用于非流式场景）
#[tauri::command]
async fn chat_with_hermes(message: String) -> Result<ChatResponse, String> {
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "1",
        "method": "chat",
        "params": { "message": message }
    });

    let mut child = Command::new("hermes")
        .arg("--acp")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("无法获取 stdin")?;
    use std::io::Write;
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .map_err(|e| e.to_string())?;

    let output = child
        .wait_with_output()
        .map_err(|e| e.to_string())?;

    let resp_text = String::from_utf8_lossy(&output.stdout);
    let resp: serde_json::Value = serde_json::from_str(&resp_text).unwrap_or(serde_json::json!({
        "content": resp_text.to_string(),
        "thinking": null
    }));

    Ok(ChatResponse {
        content: resp["content"].as_str().unwrap_or("").to_string(),
        thinking: resp["thinking"].as_str().map(|s| s.to_string()),
    })
}

/// 流式对话 - 通过事件发送数据到前端
#[tauri::command]
async fn chat_with_hermes_stream(
    app: AppHandle,
    message: String,
    conversation_id: String,
) -> Result<(), String> {
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "1",
        "method": "chat",
        "params": { "message": message, "stream": true }
    });

    let mut child = Command::new("hermes")
        .arg("--acp")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("无法获取 stdin")?;
    use std::io::Write;
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    use std::io::{BufRead, BufReader};
    let reader = BufReader::new(stdout);

    let event_id = format!("chat-stream-{}", conversation_id);

    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            if let Some(chunk) = json.get("chunk").and_then(|v| v.as_str()) {
                let _ = app.emit(&event_id, ChatStreamEvent {
                    chunk: chunk.to_string(),
                    done: false,
                });
            } else if json.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                let _ = app.emit(&event_id, ChatStreamEvent {
                    chunk: "".to_string(),
                    done: true,
                });
                break;
            }
        } else {
            let _ = app.emit(&event_id, ChatStreamEvent {
                chunk: line,
                done: false,
            });
        }
    }

    let _ = app.emit(&event_id, ChatStreamEvent {
        chunk: "".to_string(),
        done: true,
    });

    Ok(())
}

/// 打开日志目录
#[tauri::command]
fn open_log_dir() -> Result<(), String> {
    let log_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("logs");

    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    Command::new("open")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    Command::new("explorer")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AgentProcess(Mutex::new(None)))
        .setup(|app| {
            log::info!("Hermes Desktop 启动");

            let db_path = db::db_path();
            log::info!("Database path: {}", db_path.display());

            if let Some(parent) = db_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    log::error!("Failed to create directory: {}", e);
                }
            }

            let db_url = format!("sqlite:{}", db_path.to_str().unwrap());

            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async {
                let pool = SqlitePool::connect(&db_url)
                    .await
                    .expect("Failed to connect to database");
                db::init_db(&pool)
                    .await
                    .expect("Failed to initialize database");
                app_handle.manage(AppState { db_pool: pool });
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restart_hermes,
            chat_with_hermes,
            chat_with_hermes_stream,
            open_log_dir,
            get_hermes_info,
            get_conversation_count,
            list_hermes_skills,
            get_hermes_config,
            set_hermes_config,
            commands::create_conversation,
            commands::list_conversations,
            commands::delete_conversation,
            commands::create_message,
            commands::list_messages,
            commands::update_message,
            commands::delete_message,
            commands::get_config,
            commands::set_config,
        ])
        .run(tauri::generate_context!())
        .expect("Hermes Desktop 启动失败");
}
