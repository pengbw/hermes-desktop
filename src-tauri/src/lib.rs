mod commands;
mod db;

use serde::Serialize;
use sqlx::SqlitePool;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

fn hermes_bin() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{}/.hermes/hermes-agent/venv/bin/hermes", home),
        format!("{}/.local/bin/hermes", home),
        "/usr/local/bin/hermes".to_string(),
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return path.clone();
        }
    }
    if let Ok(output) = Command::new("which").arg("hermes").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return p;
            }
        }
    }
    "hermes".to_string()
}

fn path_with_local_bin() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = format!("{}/.local/bin", home);
    let current_path = std::env::var("PATH").unwrap_or_default();
    if current_path.contains(&local_bin) {
        current_path
    } else {
        format!("{}:{}", local_bin, current_path)
    }
}

async fn sync_api_keys_to_hermes_env(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => {
            log::warn!("无法获取数据库连接，跳过 API key 同步");
            return;
        }
    };

    let env_path_output = match std::process::Command::new(hermes_bin())
        .args(&["config", "env-path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        Ok(o) => o,
        Err(_) => return,
    };
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();
    if env_path.is_empty() {
        return;
    }

    if let Some(parent) = std::path::Path::new(&env_path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let mut env_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if std::path::Path::new(&env_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((k, v)) = line.split_once('=') {
                    env_map.insert(k.trim().to_uppercase(), v.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }

    let providers: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT api_key_env, api_key FROM providers WHERE api_key != '' AND api_key_env != ''"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        log::warn!("查询 providers 失败: {}", e);
        Vec::new()
    });

    let mut changed = false;
    for (key_env, api_key) in &providers {
        let key_upper = key_env.to_uppercase();
        if let Some(existing) = env_map.get(&key_upper) {
            if existing != api_key {
                env_map.insert(key_upper, api_key.clone());
                changed = true;
            }
        } else {
            env_map.insert(key_upper, api_key.clone());
            changed = true;
        }
    }

    if changed {
        let content: String = env_map.iter().map(|(k, v)| format!("{}={}", k, v)).collect::<Vec<_>>().join("\n");
        match std::fs::write(&env_path, content) {
            Ok(_) => log::info!("已同步 {} 个 API key 到 Hermes .env", env_map.len()),
            Err(e) => log::warn!("写入 .env 失败: {}", e),
        }
    }
}

async fn sync_hermes_providers_to_db(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => return,
    };

    let venv_python = hermes_bin().replace("/bin/hermes", "/bin/python");
    if !std::path::Path::new(&venv_python).exists() {
        log::warn!("hermes venv python 不存在: {}", venv_python);
        return;
    }

    let script = r#"
import json, sys
try:
    from hermes_cli.providers import HERMES_OVERLAYS
    from agent.models_dev import get_provider_info
    results = []
    for pid in HERMES_OVERLAYS:
        info = get_provider_info(pid)
        if info and info.env:
            results.append({
                'id': info.id,
                'name': info.name,
                'env_vars': list(info.env),
                'base_url': info.api or ''
            })
    print(json.dumps(results, ensure_ascii=False))
except Exception as e:
    print(json.dumps({'error': str(e)}), file=sys.stderr)
    sys.exit(1)
"#;

    let output = match std::process::Command::new(&venv_python)
        .args(["-c", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            log::warn!("查询 hermes 供应商失败: {}", e);
            return;
        }
    };

    let json_str = String::from_utf8_lossy(&output.stdout);
    let providers: Vec<serde_json::Value> = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("解析 hermes 供应商 JSON 失败: {}", e);
            return;
        }
    };

    let now = chrono::Utc::now().timestamp_millis();

    for (i, p) in providers.iter().enumerate() {
        let pid = p["id"].as_str().unwrap_or("");
        let name = p["name"].as_str().unwrap_or("");
        let base_url = p["base_url"].as_str().unwrap_or("");
        let env_vars: Vec<String> = p["env_vars"]
            .as_array()
            .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default();
        let api_key_env = env_vars.first().cloned().unwrap_or_default();

        let provider_value = pid.to_string();
        let db_id = format!("hermes_{}", pid.replace('-', "_"));

        let exists: bool = sqlx::query_scalar(
            "SELECT COUNT(*) > 0 FROM providers WHERE value = ?"
        )
        .bind(&provider_value)
        .fetch_one(&pool)
        .await
        .unwrap_or(false);

        if exists {
            let _ = sqlx::query(
                "UPDATE providers SET name = ?, base_url = ?, api_key_env = ?, updated_at = ? WHERE value = ?"
            )
            .bind(name)
            .bind(base_url)
            .bind(&api_key_env)
            .bind(now)
            .bind(&provider_value)
            .execute(&pool)
            .await
            .map_err(|e| {
                log::warn!("更新 hermes 供应商 {} 失败: {}", pid, e);
            });
        } else {
            let _ = sqlx::query(
                "INSERT INTO providers (id, name, value, base_url, api_key_env, is_builtin, sort_order, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)"
            )
            .bind(&db_id)
            .bind(name)
            .bind(&provider_value)
            .bind(base_url)
            .bind(&api_key_env)
            .bind(i as i64 + 100)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| {
                log::warn!("插入 hermes 供应商 {} 失败: {}", pid, e);
            });
        }
    }

    log::info!("已同步 {} 个 Hermes 供应商到本地数据库", providers.len());
}

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
#[serde(rename_all = "camelCase")]
struct ChatResponse {
    content: String,
    thinking: Option<String>,
    session_id: Option<String>,
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
    let version_output = Command::new(&hermes_bin())
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
    let status_output = Command::new(&hermes_bin())
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

fn kill_hermes_process() {
    #[cfg(unix)]
    {
        let _ = Command::new("pkill")
            .args(&["-f", "hermes acp"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "hermes.exe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

#[cfg(unix)]
fn get_install_shell_args<'a>(method: &str, install_cmd: &'a str) -> (&'static str, Vec<&'a str>) {
    let _ = method;
    ("bash", vec!["-lc", install_cmd])
}

#[cfg(windows)]
fn get_install_shell_args<'a>(method: &str, install_cmd: &'a str) -> (&'static str, Vec<&'a str>) {
    if method == "curl" {
        ("wsl", vec!["bash", "-lc", install_cmd])
    } else {
        ("cmd", vec!["/C", install_cmd])
    }
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
    let output = Command::new(&hermes_bin())
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
    let config_path_output = Command::new(&hermes_bin())
        .args(&["config", "path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("获取配置路径失败: {}", e))?;
    let config_path = String::from_utf8_lossy(&config_path_output.stdout).trim().to_string();

    let env_path_output = Command::new(&hermes_bin())
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
    let output = Command::new(&hermes_bin())
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

    let _ = guard.take();

    kill_hermes_process();

    std::thread::sleep(std::time::Duration::from_millis(500));

    let child = Command::new(&hermes_bin())
        .arg("acp")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    *guard = Some(child);
    Ok("Hermes Agent 已重启".to_string())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallProgress {
    line: String,
    done: bool,
    success: bool,
}

#[tauri::command]
async fn check_hermes_installed() -> Result<serde_json::Value, String> {
    let version_output = Command::new(&hermes_bin())
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut version = String::new();
            let mut python = String::new();
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("Hermes Agent") {
                    version = line.to_string();
                } else if line.starts_with("Python:") {
                    python = line.replace("Python:", "").trim().to_string();
                }
            }
            Ok(serde_json::json!({
                "installed": true,
                "version": version,
                "python": python
            }))
        }
        _ => Ok(serde_json::json!({
            "installed": false,
            "version": "",
            "python": ""
        })),
    }
}

#[tauri::command]
async fn install_hermes_agent(app: AppHandle, method: String) -> Result<bool, String> {
    let already_installed = Command::new(&hermes_bin())
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let hermes_dir = format!(
        "{}/.hermes/hermes-agent",
        std::env::var("HOME").unwrap_or_default()
    );
    if std::path::Path::new(&hermes_dir).exists() {
        let venv_exists = std::path::Path::new(&format!("{}/venv/bin/hermes", hermes_dir)).exists();
        if venv_exists {
            let _ = Command::new("git")
                .args(["stash", "clear"])
                .current_dir(&hermes_dir)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        } else {
            let _ = app.emit(
                "install-progress",
                InstallProgress {
                    line: "检测到损坏的安装目录，正在清理...".to_string(),
                    done: false,
                    success: false,
                },
            );
            let _ = std::fs::remove_dir_all(&hermes_dir);
        }
    }

    let install_cmd: String = if already_installed && method == "curl" {
        let _ = app.emit(
            "install-progress",
            InstallProgress {
                line: "检测到已有安装，使用 hermes update 更新...".to_string(),
                done: false,
                success: false,
            },
        );
        let bin = hermes_bin();
        #[cfg(unix)]
        {
            format!("{} update", bin)
        }
        #[cfg(windows)]
        {
            format!("wsl {} update", bin)
        }
    } else {
        match method.as_str() {
            "curl" => {
                #[cfg(unix)]
                {
                    r#"bash -c 'export GIT_SSH_COMMAND="ssh -o ConnectTimeout=30 -o BatchMode=yes"; export GIT_TERMINAL_PROMPT=0; curl -fsSL --connect-timeout 30 --max-time 300 https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup'"#.to_string()
                }
                #[cfg(windows)]
                {
                    "wsl bash -c 'export GIT_SSH_COMMAND=\"ssh -o ConnectTimeout=30 -o BatchMode=yes\"; export GIT_TERMINAL_PROMPT=0; curl -fsSL --connect-timeout 30 --max-time 300 https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup'".to_string()
                }
            }
            "pip" => {
                #[cfg(unix)]
                {
                    "pip install --upgrade --timeout 60 hermes-agent".to_string()
                }
                #[cfg(windows)]
                {
                    "pip install --upgrade --timeout 60 hermes-agent".to_string()
                }
            }
            _ => return Err(format!("不支持的安装方式: {}", method)),
        }
    };

    let (shell, args) = get_install_shell_args(&method, &install_cmd);

    let new_path = path_with_local_bin();
    let mut child = Command::new(shell)
        .args(&args)
        .env("PATH", &new_path)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("CI", "1")
        .env("HERMES_NO_PROMPT", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动安装进程失败: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法获取标准输出")?;
    let stderr = child.stderr.take().ok_or("无法获取标准错误")?;

    use std::io::{BufReader, Read};

    let app_stdout = app.clone();
    let stdout_thread = std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        let mut line = String::new();
        loop {
            let mut tmp = [0u8; 512];
            match reader.read(&mut tmp) {
                Ok(0) => {
                    if !line.is_empty() {
                        let cleaned = strip_ansi(&line);
                        if !cleaned.trim().is_empty() {
                            let _ = app_stdout.emit(
                                "install-progress",
                                InstallProgress { line: cleaned, done: false, success: false },
                            );
                        }
                    }
                    break;
                }
                Ok(n) => {
                    buf.extend_from_slice(&tmp[..n]);
                    while let Some(pos) = buf.iter().position(|&b| b == b'\n' || b == b'\r') {
                        let before: Vec<u8> = buf.drain(..pos).collect();
                        buf.drain(..1);
                        if let Ok(text) = String::from_utf8(before) {
                            line.push_str(&text);
                        }
                        if !line.is_empty() {
                            let cleaned = strip_ansi(&line);
                            if !cleaned.trim().is_empty() {
                                let _ = app_stdout.emit(
                                    "install-progress",
                                    InstallProgress { line: cleaned, done: false, success: false },
                                );
                            }
                            line.clear();
                        }
                    }
                    if let Ok(text) = String::from_utf8(buf.clone()) {
                        line.push_str(&text);
                        buf.clear();
                    }
                }
                Err(_) => break,
            }
        }
    });

    let app_stderr = app.clone();
    let stderr_thread = std::thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut buf = Vec::new();
        let mut line = String::new();
        loop {
            let mut tmp = [0u8; 512];
            match reader.read(&mut tmp) {
                Ok(0) => {
                    if !line.is_empty() {
                        let cleaned = strip_ansi(&line);
                        if !cleaned.trim().is_empty() {
                            let _ = app_stderr.emit(
                                "install-progress",
                                InstallProgress { line: cleaned, done: false, success: false },
                            );
                        }
                    }
                    break;
                }
                Ok(n) => {
                    buf.extend_from_slice(&tmp[..n]);
                    while let Some(pos) = buf.iter().position(|&b| b == b'\n' || b == b'\r') {
                        let before: Vec<u8> = buf.drain(..pos).collect();
                        buf.drain(..1);
                        if let Ok(text) = String::from_utf8(before) {
                            line.push_str(&text);
                        }
                        if !line.is_empty() {
                            let cleaned = strip_ansi(&line);
                            if !cleaned.trim().is_empty() {
                                let _ = app_stderr.emit(
                                    "install-progress",
                                    InstallProgress { line: cleaned, done: false, success: false },
                                );
                            }
                            line.clear();
                        }
                    }
                    if let Ok(text) = String::from_utf8(buf.clone()) {
                        line.push_str(&text);
                        buf.clear();
                    }
                }
                Err(_) => break,
            }
        }
    });

    let status = child.wait().map_err(|e| format!("等待安装进程失败: {}", e))?;

    let _ = stdout_thread.join();
    let _ = stderr_thread.join();

    let script_success = status.success();

    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = format!("{}/.local/bin", home);
    let hermes_link = format!("{}/hermes", local_bin);
    let venv_hermes = format!("{}/.hermes/hermes-agent/venv/bin/hermes", home);
    if std::path::Path::new(&venv_hermes).exists() && !std::path::Path::new(&hermes_link).exists() {
        let _ = std::fs::create_dir_all(&local_bin);
        let _ = std::os::unix::fs::symlink(&venv_hermes, &hermes_link);
        let _ = app.emit(
            "install-progress",
            InstallProgress {
                line: "已修复 hermes 命令链接".to_string(),
                done: false,
                success: false,
            },
        );
    }

    let path_line = "export PATH=\"$HOME/.local/bin:$PATH\"";
    let mut path_written = false;
    for rc_file in [format!("{}/.zshrc", home), format!("{}/.bashrc", home)] {
        if !std::path::Path::new(&rc_file).exists() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(&rc_file) {
            if content.contains("$HOME/.local/bin") || content.contains("~/.local/bin") {
                path_written = true;
                continue;
            }
        }
        if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&rc_file) {
            let _ = std::io::Write::write_fmt(&mut f, format_args!("\n{}\n", path_line));
            path_written = true;
        }
    }
    if !path_written {
        let zprofile = format!("{}/.zprofile", home);
        if let Ok(content) = std::fs::read_to_string(&zprofile) {
            if !content.contains("$HOME/.local/bin") && !content.contains("~/.local/bin") {
                if let Ok(mut f) = std::fs::OpenOptions::new().append(true).open(&zprofile) {
                    let _ = std::io::Write::write_fmt(&mut f, format_args!("\n{}\n", path_line));
                }
            }
        }
    }

    let actual_installed = Command::new(&hermes_bin())
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if actual_installed {
        sync_hermes_providers_to_db(&app).await;
        sync_api_keys_to_hermes_env(&app).await;
    }

    let success = actual_installed || script_success;

    if !script_success && actual_installed {
        let _ = app.emit(
            "install-progress",
            InstallProgress {
                line: "安装脚本返回非零退出码，但 Hermes Agent 已可用".to_string(),
                done: false,
                success: false,
            },
        );
    }

    let _ = app.emit(
        "install-progress",
        InstallProgress {
            line: if success {
                "安装完成".to_string()
            } else {
                "安装失败".to_string()
            },
            done: true,
            success,
        },
    );

    Ok(success)
}

#[tauri::command]
async fn start_hermes_agent(_app: AppHandle, state: State<'_, AgentProcess>) -> Result<String, String> {
    kill_hermes_process();
    std::thread::sleep(std::time::Duration::from_millis(300));

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let _ = guard.take();

    let new_path = path_with_local_bin();

    match Command::new(&hermes_bin())
        .arg("acp")
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            log::info!("Hermes Agent 已启动");
            *guard = Some(child);
            Ok("Hermes Agent 已启动".to_string())
        }
        Err(e) => {
            log::error!("启动 Hermes Agent 失败: {}", e);
            Err(format!("启动 Hermes Agent 失败: {}", e))
        }
    }
}

/// 与 Hermes Agent 对话（阻塞式，使用 hermes chat -q）
/// 支持 session_id 恢复上下文
#[tauri::command]
async fn chat_with_hermes(message: String, session_id: Option<String>, file_path: Option<String>, model: Option<String>) -> Result<ChatResponse, String> {
    log::info!("[chat] 开始: message={}, session_id={:?}, has_file={}, model={:?}", message, session_id, file_path.is_some(), model);

    let (full_message, image_arg) = if let Some(ref fp) = file_path {
        let p = std::path::Path::new(fp);
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let size_mb = std::fs::metadata(fp).map(|m| m.len() as f64 / 1024.0 / 1024.0).unwrap_or(0.0);
        let image_exts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
        if image_exts.contains(&ext.as_str()) {
            (message.clone(), format!(" --image '{}'", fp))
        } else {
            let label = if ext.is_empty() { "文件" } else { &ext };
            let hint = format!(
                "{}\n\n[用户上传了文件]\n路径: {}\n名称: {}\n类型: {}\n大小: {:.1}MB\n请使用文件读取工具读取该文件内容。",
                message, fp, name, label, size_mb
            );
            (hint, String::new())
        }
    } else {
        (message.clone(), String::new())
    };

    let bin = hermes_bin();
    let new_path = path_with_local_bin();
    let mut last_session_id = session_id.clone();

    let msg_file = std::env::temp_dir().join(format!("hermes_msg_{}", std::process::id()));
    std::fs::write(&msg_file, &full_message).map_err(|e| format!("写入临时文件失败: {}", e))?;
    let msg_file_str = msg_file.to_string_lossy().to_string();

    for attempt in 0..2 {
        let resume_arg = match &last_session_id {
            Some(sid) => format!(" --resume '{}'", sid.replace('\'', "'\"'\"'")),
            None => String::new(),
        };
        let model_arg = match &model {
            Some(m) => format!(" -m '{}'", m.replace('\'', "'\"'\"'")),
            None => String::new(),
        };
        let shell_cmd = format!(
            "{} chat -q \"$(cat '{}')\" -Q{}{}{}",
            bin,
            msg_file_str,
            image_arg,
            model_arg,
            resume_arg
        );
        log::info!("[chat] 执行命令(attempt={})", attempt);

        let output = match tokio::time::timeout(
            tokio::time::Duration::from_secs(60),
            tokio::process::Command::new("zsh")
                .args(["-lc", &shell_cmd])
                .env("PATH", &new_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output(),
        )
        .await
        {
            Ok(Ok(o)) => {
                log::info!("[chat] 命令完成, exit={:?}", o.status.code());
                o
            }
            Ok(Err(e)) => {
                log::error!("[chat] 启动失败: {}", e);
                return Err(format!("启动 hermes chat 失败: {}", e));
            }
            Err(_) => {
                log::error!("[chat] 超时");
                return Err("请求超时，请检查网络或模型配置".to_string());
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::info!("[chat] stdout 长度={}, stderr 长度={}", stdout.len(), stderr.len());

        if !output.status.success() {
            let err_text = if stderr.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                stderr.trim().to_string()
            };
            if attempt == 0 && last_session_id.is_some() && err_text.contains("Session not found") {
                log::warn!("[chat] Session 无效，去掉 resume 重试");
                last_session_id = None;
                continue;
            }
            log::error!("[chat] 命令失败: {}", err_text);
            return Err(format!("hermes chat 出错: {}", err_text));
        }

        let mut new_session_id: Option<String> = None;

        for line in stderr.lines() {
            let line = line.trim();
            if line.starts_with("session_id:") {
                new_session_id = Some(line.replace("session_id:", "").trim().to_string());
                break;
            }
        }

        let content: String = stdout
            .lines()
            .filter(|line| {
                let line = line.trim();
                if line.starts_with("session_id:") {
                    if new_session_id.is_none() {
                        new_session_id = Some(line.replace("session_id:", "").trim().to_string());
                    }
                    false
                } else if line.starts_with("↻ Resumed session") {
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<&str>>()
            .join("\n")
            .trim()
            .to_string();

        if content.is_empty() {
            return Ok(ChatResponse {
                content: "无法获取响应".to_string(),
                thinking: None,
                session_id: new_session_id,
            });
        }

        log::info!("[chat] 返回内容长度={}, session_id={:?}", content.len(), new_session_id);
        return Ok(ChatResponse {
            content,
            thinking: None,
            session_id: new_session_id,
        });
    }

    Err("hermes chat 出错: 重试失败".to_string())
}

/// 与 Avatar 数字人对话（简化版，直接返回文本）
#[tauri::command]
async fn chat_with_agent(_app: AppHandle, message: String, session_id: Option<String>, file_path: Option<String>, model: Option<String>) -> Result<ChatResponse, String> {
    log::info!("[avatar_chat] 开始: message={}, session_id={:?}, has_file={}, model={:?}", message, session_id, file_path.is_some(), model);

    let (full_message, image_arg) = if let Some(ref fp) = file_path {
        let p = std::path::Path::new(fp);
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let size_mb = std::fs::metadata(fp).map(|m| m.len() as f64 / 1024.0 / 1024.0).unwrap_or(0.0);
        let image_exts = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
        if image_exts.contains(&ext.as_str()) {
            (message.clone(), format!(" --image '{}'", fp))
        } else {
            let label = if ext.is_empty() { "文件" } else { &ext };
            let hint = format!(
                "{}\n\n[用户上传了文件]\n路径: {}\n名称: {}\n类型: {}\n大小: {:.1}MB\n请使用文件读取工具读取该文件内容。",
                message, fp, name, label, size_mb
            );
            (hint, String::new())
        }
    } else {
        (message.clone(), String::new())
    };

    let bin = hermes_bin();
    let new_path = path_with_local_bin();

    let mut last_session_id = session_id.clone();

    let msg_file = std::env::temp_dir().join(format!("hermes_avatar_msg_{}", std::process::id()));
    std::fs::write(&msg_file, &full_message).map_err(|e| format!("写入临时文件失败: {}", e))?;
    let msg_file_str = msg_file.to_string_lossy().to_string();

    for attempt in 0..2 {
        let resume_arg = match &last_session_id {
            Some(sid) => format!(" --resume '{}'", sid.replace('\'', "'\"'\"'")),
            None => String::new(),
        };
        let model_arg = match &model {
            Some(m) => format!(" -m '{}'", m.replace('\'', "'\"'\"'")),
            None => String::new(),
        };
        let shell_cmd = format!(
            "{} chat -q \"$(cat '{}')\" -Q{}{}{}",
            bin,
            msg_file_str,
            image_arg,
            model_arg,
            resume_arg
        );
        log::info!("[avatar_chat] 执行命令(attempt={})", attempt);

        let output = match tokio::time::timeout(
            tokio::time::Duration::from_secs(120),
            tokio::process::Command::new("zsh")
                .args(["-lc", &shell_cmd])
                .env("PATH", &new_path)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output(),
        )
        .await
        {
            Ok(Ok(o)) => {
                log::info!("[avatar_chat] 命令完成, exit={:?}, stdout_len={}, stderr_len={}", 
                    o.status.code(), o.stdout.len(), o.stderr.len());
                o
            }
            Ok(Err(e)) => {
                log::error!("[avatar_chat] 启动失败: {}", e);
                return Err(format!("启动 hermes chat 失败: {}", e));
            }
            Err(_) => {
                log::error!("[avatar_chat] 超时");
                return Err("请求超时，请检查网络或模型配置".to_string());
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::info!("[avatar_chat] stdout 长度={}, stderr 长度={}", stdout.len(), stderr.len());

        if !output.status.success() {
            let err_text = if stderr.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                stderr.trim().to_string()
            };
            if attempt == 0 && last_session_id.is_some() && err_text.contains("Session not found") {
                log::warn!("[avatar_chat] Session 无效，去掉 resume 重试");
                last_session_id = None;
                continue;
            }
            log::error!("[avatar_chat] 命令失败: {}", err_text);
            return Err(format!("hermes chat 出错: {}", err_text));
        }

        let mut new_session_id: Option<String> = None;

        for line in stderr.lines() {
            let line = line.trim();
            if line.starts_with("session_id:") {
                new_session_id = Some(line.replace("session_id:", "").trim().to_string());
                break;
            }
        }

        let content: String = stdout
            .lines()
            .filter(|line| {
                let line = line.trim();
                if line.starts_with("session_id:") {
                    if new_session_id.is_none() {
                        new_session_id = Some(line.replace("session_id:", "").trim().to_string());
                    }
                    false
                } else if line.starts_with("↻ Resumed session") {
                    false
                } else {
                    true
                }
            })
            .collect::<Vec<&str>>()
            .join("\n")
            .trim()
            .to_string();

        if content.is_empty() {
            return Ok(ChatResponse {
                content: "抱歉，我没有理解你的意思，能再说一遍吗？".to_string(),
                thinking: None,
                session_id: new_session_id,
            });
        }

        log::info!("[avatar_chat] 返回内容长度={}, session_id={:?}", content.len(), new_session_id);
        return Ok(ChatResponse {
            content,
            thinking: None,
            session_id: new_session_id,
        });
    }

    Err("hermes chat 出错: 重试失败".to_string())
}

/// 流式对话 - 通过事件发送数据到前端（使用 hermes chat -q）
/// 真正的流式：边读 stdout 边 emit 事件到前端
#[tauri::command]
async fn chat_with_hermes_stream(
    app: AppHandle,
    message: String,
    conversation_id: String,
    model: Option<String>,
) -> Result<(), String> {
    let event_id = format!("chat_stream_{}", conversation_id);
    log::info!("[chat_stream] 开始: conversation_id={}, message={}, model={:?}", conversation_id, message, model);

    let bin = hermes_bin();
    let model_arg = match &model {
        Some(m) => format!(" -m '{}'", m.replace('\'', "'\"'\"'")),
        None => String::new(),
    };
    let shell_cmd = format!(
        "{} chat -q '{}' -Q{}",
        bin,
        message.replace('\\', "\\\\").replace('\'', "'\"'\"'"),
        model_arg,
    );
    log::info!("[chat_stream] 执行命令: zsh -lc {}", shell_cmd);

    let new_path = path_with_local_bin();

    // spawn 子进程，实时读取 stdout
    let mut child = match tokio::process::Command::new("zsh")
        .args(["-lc", &shell_cmd])
        .env("PATH", &new_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("[chat_stream] 启动命令失败: {}", e);
            let _ = app.emit(&event_id, ChatStreamEvent {
                chunk: format!("[错误] 启动 hermes chat 失败: {}", e),
                done: false,
            });
            let _ = app.emit(&event_id, ChatStreamEvent {
                chunk: "".to_string(),
                done: true,
            });
            return Ok(());
        }
    };

    let stdout = child.stdout.take();
    let stderr_child = child.stderr.take();

    // 在后台读取 stderr
    let stderr_task = tokio::spawn(async move {
        if let Some(mut stderr) = stderr_child {
            use tokio::io::AsyncReadExt;
            let mut buf = Vec::new();
            let _ = stderr.read_to_end(&mut buf).await;
            String::from_utf8_lossy(&buf).to_string()
        } else {
            String::new()
        }
    });

    // 实时读取 stdout 并 emit 事件
    use tokio::io::{AsyncBufReadExt, BufReader};

    let result = if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut total_content = String::new();

        // 带超时的逐行读取循环
        loop {
            let line_result = tokio::time::timeout(
                tokio::time::Duration::from_secs(60),
                lines.next_line(),
            ).await;

            match line_result {
                Ok(Ok(Some(line))) => {
                    // 跳过 session_id 行
                    if line.starts_with("session_id:") {
                        log::info!("[chat_stream] 跳过 session_id 行: {}", line);
                        continue;
                    }
                    if !line.is_empty() {
                        total_content.push_str(&line);
                        total_content.push('\n');
                        let _ = app.emit(&event_id, ChatStreamEvent {
                            chunk: line,
                            done: false,
                        });
                    }
                }
                Ok(Ok(None)) => {
                    // stdout EOF
                    log::info!("[chat_stream] stdout EOF, 总长度={}", total_content.len());
                    break;
                }
                Ok(Err(e)) => {
                    log::error!("[chat_stream] 读取 stdout 错误: {}", e);
                    break;
                }
                Err(_) => {
                    log::error!("[chat_stream] 读取超时");
                    let _ = app.emit(&event_id, ChatStreamEvent {
                        chunk: "[错误] 请求超时，请检查网络或模型配置".to_string(),
                        done: false,
                    });
                    break;
                }
            }
        }

        if total_content.is_empty() {
            log::warn!("[chat_stream] stdout 为空");
            let _ = app.emit(&event_id, ChatStreamEvent {
                chunk: "[无回复]".to_string(),
                done: false,
            });
        }

        Ok(())
    } else {
        log::error!("[chat_stream] 无法获取 stdout");
        let _ = app.emit(&event_id, ChatStreamEvent {
            chunk: "[错误] 无法获取命令输出".to_string(),
            done: false,
        });
        Ok(())
    };

    // 等待子进程退出
    let _ = child.wait().await;

    // 检查 stderr
    let stderr_output = stderr_task.await.unwrap_or_default();
    if !stderr_output.trim().is_empty() {
        log::warn!("[chat_stream] stderr: {}", stderr_output.trim());
    }

    // 发送 done 事件
    let _ = app.emit(&event_id, ChatStreamEvent {
        chunk: "".to_string(),
        done: true,
    });

    log::info!("[chat_stream] 完成");
    result
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

/// 切换 Avatar 窗口的显示/隐藏
#[tauri::command]
async fn toggle_avatar_window(app: AppHandle) -> Result<bool, String> {
    let avatar = app.get_webview_window("avatar")
        .ok_or("Avatar window not found")?;

    let visible = avatar.is_visible().map_err(|e| e.to_string())?;
    if visible {
        avatar.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        avatar.show().map_err(|e| e.to_string())?;
        avatar.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
async fn close_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(chat_win) = app.get_webview_window("chat") {
        chat_win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_avatar_window(app: AppHandle) -> Result<(), String> {
    if let Some(avatar_win) = app.get_webview_window("avatar") {
        avatar_win.hide().map_err(|e| e.to_string())?;
    }
    if let Some(chat_win) = app.get_webview_window("chat") {
        chat_win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn sync_chat_window(app: AppHandle) -> Result<bool, String> {
    let avatar_win = app.get_webview_window("avatar").ok_or("avatar window not found")?;
    let chat_win = match app.get_webview_window("chat") {
        Some(w) => w,
        None => return Ok(false),
    };

    let pos = avatar_win.outer_position().map_err(|e| e.to_string())?;
    let size = avatar_win.outer_size().map_err(|e| e.to_string())?;
    let monitor = avatar_win.primary_monitor().map_err(|e| e.to_string())?;
    let monitor = match monitor {
        Some(m) => m,
        None => return Err("no monitor".into()),
    };

    let sf = monitor.scale_factor();
    let chat_w_phys = (300.0 * sf) as i32;
    let screen_w = monitor.size().width as i32;
    let avatar_right = pos.x as i32 + size.width as i32;
    let space_right = screen_w - avatar_right;
    let space_left = pos.x as i32;

    let chat_x = if space_right >= chat_w_phys {
        avatar_right
    } else if space_left >= chat_w_phys {
        pos.x as i32 - chat_w_phys
    } else if space_right >= space_left {
        avatar_right
    } else {
        pos.x as i32 - chat_w_phys
    };

    chat_win
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            chat_x,
            pos.y as i32,
        )))
        .map_err(|e| e.to_string())?;

    Ok(true)
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

            let hermes_installed = Command::new(&hermes_bin())
                .arg("version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if hermes_installed {
                let handle = app.handle().clone();
                tauri::async_runtime::block_on(async {
                    sync_hermes_providers_to_db(&handle).await;
                    sync_api_keys_to_hermes_env(&handle).await;
                });

                kill_hermes_process();
                std::thread::sleep(std::time::Duration::from_millis(300));

                match Command::new(&hermes_bin())
                    .arg("acp")
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        log::info!("Hermes Agent 已启动");
                        app.manage(AgentProcess(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        log::error!("启动 Hermes Agent 失败: {}", e);
                        app.manage(AgentProcess(Mutex::new(None)));
                    }
                }
            } else {
                log::warn!("Hermes Agent 未安装，跳过启动，等待前端引导安装");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restart_hermes,
            toggle_avatar_window,
            sync_chat_window,
            close_chat_window,
            hide_avatar_window,
            chat_with_agent,
            chat_with_hermes,
            chat_with_hermes_stream,
            open_log_dir,
            get_hermes_info,
            check_hermes_installed,
            install_hermes_agent,
            start_hermes_agent,
            get_conversation_count,
            list_hermes_skills,
            get_hermes_config,
            set_hermes_config,
            commands::create_conversation,
            commands::list_conversations,
            commands::delete_conversation,
            commands::update_conversation_session_id,
            commands::activate_conversation,
            commands::rename_conversation,
            commands::get_avatar_gestures,
            commands::create_avatar_gesture,
            commands::update_avatar_gesture,
            commands::delete_avatar_gesture,
            commands::archive_stale_conversations,
            commands::create_message,
            commands::list_messages,
            commands::update_message,
            commands::delete_message,
            commands::get_config,
            commands::set_config,
            commands::get_avatar_conversation,
            commands::create_avatar_conversation,
            commands::get_avatar_messages,
            commands::list_providers,
            commands::create_provider,
            commands::update_provider,
            commands::delete_provider,
            commands::sync_provider_keys,
            commands::list_models,
            commands::read_file_for_chat,
            commands::prepare_temp_file,
        ])
        .run(tauri::generate_context!())
        .expect("Hermes Desktop 启动失败");
}
