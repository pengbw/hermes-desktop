mod commands;
mod db;

use serde::Serialize;
use sqlx::SqlitePool;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub(crate) fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd
}

fn hermes_bin() -> String {
    #[cfg(not(target_os = "windows"))]
    {
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
        if let Ok(output) = command("which").arg("hermes").output() {
            if output.status.success() {
                let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !p.is_empty() {
                    return p;
                }
            }
        }
        "hermes".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{}\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe", local_appdata),
            format!("{}\\hermes\\hermes-agent\\.venv\\Scripts\\hermes.exe", local_appdata),
            format!("{}\\hermes\\hermes-agent\\python.exe", local_appdata),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return path.clone();
            }
        }
        "hermes".to_string()
    }
}

fn which_exists(cmd: &str) -> bool {
    command("which")
        .arg(cmd)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[allow(dead_code)]
fn show_error_dialog(message: &str) {
    eprintln!("ERROR: {}", message);
    #[cfg(target_os = "windows")]
    {
        let ps_cmd = format!(
            "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('{}', 'Hermes Desktop Error')",
            message.replace("'", "''").replace("\n", " ")
        );
        let _ = command("powershell")
            .args(["-NoProfile", "-Command", &ps_cmd])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let script = format!(
            "display dialog \"{}\" with title \"Hermes Desktop Error\" buttons {{\"OK\"}} default button \"OK\" with icon stop",
            message.replace("\\", "\\\\").replace("\"", "\\\"")
        );
        let _ = command("osascript")
            .args(["-e", &script])
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = command("zenity")
            .args(["--error", "--title=Hermes Desktop Error", &format!("--text={}", message)])
            .spawn();
    }
}

fn default_shell() -> &'static str {
    if which_exists("zsh") { "zsh" } else { "bash" }
}

fn spawn_log_reader(
    reader: impl std::io::Read + Send + 'static,
    app: AppHandle,
) -> std::thread::JoinHandle<()> {
    use std::io::{BufReader, Read};
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buf = Vec::new();
        let mut line = String::new();
        loop {
            let mut tmp = [0u8; 512];
            match reader.read(&mut tmp) {
                Ok(0) => {
                    emit_line(&app, &mut line);
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
                        emit_line(&app, &mut line);
                        line.clear();
                    }
                    if let Ok(text) = String::from_utf8(buf.clone()) {
                        line.push_str(&text);
                        buf.clear();
                    }
                }
                Err(_) => break,
            }
        }
    })
}

fn emit_line(app: &AppHandle, line: &mut String) {
    if !line.is_empty() {
        let cleaned = strip_ansi(line);
        if !cleaned.trim().is_empty() {
            let _ = app.emit("install-progress", InstallProgress {
                line: cleaned, done: false, success: false,
            });
        }
    }
}

fn path_with_local_bin() -> String {
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        let local_bin = format!("{}/.local/bin", home);
        let current_path = std::env::var("PATH").unwrap_or_default();
        if current_path.contains(&local_bin) {
            current_path
        } else {
            format!("{}:{}", local_bin, current_path)
        }
    }
    #[cfg(target_os = "windows")]
    {
        let userprofile = std::env::var("USERPROFILE").unwrap_or_default();
        let local_bin = format!("{}\\AppData\\Local\\hermes", userprofile);
        let current_path = std::env::var("PATH").unwrap_or_default();
        if current_path.to_lowercase().contains(&local_bin.to_lowercase()) {
            current_path
        } else {
            format!("{};{}", local_bin, current_path)
        }
    }
}

fn hermes_command() -> Command {
    command(&hermes_bin())
}

fn home_dir() -> String {
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").unwrap_or_default()
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").unwrap_or_default()
    }
}

async fn sync_api_keys_to_hermes_env(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => {
            log::warn!("Cannot get database connection, skipping API key sync");
            return;
        }
    };

    let env_path_output = match hermes_command()
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
        log::warn!("Failed to query providers: {}", e);
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
            Ok(_) => log::info!("Synced {} API keys to Hermes .env", env_map.len()),
            Err(e) => log::warn!("Failed to write .env: {}", e),
        }
    }
}

async fn sync_hermes_providers_to_db(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => return,
    };

    let hermes_bin_path = hermes_bin();
    #[cfg(not(target_os = "windows"))]
    let venv_python = std::path::Path::new(&hermes_bin_path)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("bin").join("python"))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| hermes_bin_path.replace("/bin/hermes", "/bin/python"));
    #[cfg(target_os = "windows")]
    let venv_python = std::path::Path::new(&hermes_bin_path)
        .parent()
        .map(|p| p.join("python.exe"))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| hermes_bin_path.replace("hermes.exe", "python.exe"));
    if !std::path::Path::new(&venv_python).exists() {
        log::warn!("hermes venv python not found: {}", venv_python);
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

    let output = match command(&venv_python)
        .args(["-c", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            log::warn!("Failed to query hermes providers: {}", e);
            return;
        }
    };

    let json_str = String::from_utf8_lossy(&output.stdout);
    let providers: Vec<serde_json::Value> = match serde_json::from_str(&json_str) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("Failed to parse hermes provider JSON: {}", e);
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
                log::warn!("Failed to update hermes provider {}: {}", pid, e);
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
                log::warn!("Failed to insert hermes provider {}: {}", pid, e);
            });
        }
    }

    log::info!("Synced {} Hermes providers to local database", providers.len());
}

pub struct AppState {
    pub db_pool: SqlitePool,
}

struct AgentProcess(Mutex<Option<std::process::Child>>);

#[derive(Serialize, Clone)]
struct ChatStreamEvent {
    chunk: String,
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_label: Option<String>,
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

/// Get Hermes Agent info (version, status, model, etc.)
#[tauri::command]
async fn get_hermes_info() -> Result<HermesInfo, String> {
    // 1. Check if hermes is installed (run hermes version)
    let version_output = hermes_command()
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

    // 2. Run hermes status to get model and API info
    let status_output = hermes_command()
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
                // Strip ANSI color codes
                let clean = strip_ansi(line_trimmed);
                let clean = clean.trim();

                if clean.starts_with("Model:") {
                    model = clean.replace("Model:", "").trim().to_string();
                } else if clean.starts_with("Provider:") {
                    provider = clean.replace("Provider:", "").trim().to_string();
                } else if clean.contains("API Keys") {
                    in_api_section = true;
                } else if clean.starts_with("✔") && in_api_section {
                    in_api_section = false;
                } else if in_api_section && (clean.contains("✔") || clean.contains("✘")) {
                    let configured = clean.contains("✔");
                    let name = clean
                        .replace("✔", "")
                        .replace("✘", "")
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

    // 3. Check if hermes process is running
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
        let _ = command("pkill")
            .args(&["-f", "hermes (acp|gateway)"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = command("pkill")
            .args(&["-f", "python.*hermes"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
    #[cfg(windows)]
    {
        let _ = command("taskkill")
            .args(&["/F", "/IM", "hermes.exe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = command("taskkill")
            .args(&["/F", "/IM", "python.exe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = command("taskkill")
            .args(&["/F", "/IM", "python3.exe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

fn check_hermes_process() -> bool {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = command("pgrep")
            .arg("-f")
            .arg("hermes (acp|gateway)")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
        {
            return output.status.success();
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = command("tasklist")
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

/// Get conversation count
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
    enabled: bool,
    description: String,
    version: String,
    tags: Vec<String>,
}

#[derive(Serialize, Clone)]
struct HermesSkillsResult {
    skills: Vec<HermesSkill>,
    total: usize,
    hub_installed: usize,
    builtin: usize,
    local: usize,
    enabled_count: usize,
    disabled_count: usize,
    categories: Vec<SkillCategory>,
}

#[derive(Serialize, Clone)]
struct SkillCategory {
    id: String,
    name: String,
    description: String,
    icon: String,
    count: usize,
}

fn parse_skill_frontmatter(category: &str, skill_name: &str) -> (String, String, Vec<String>) {
    let home = dirs::home_dir().unwrap_or_default();
    let skill_path = format!("{}/.hermes/skills/{}/{}/SKILL.md", home.display(), category, skill_name);

    let content = match std::fs::read_to_string(&skill_path) {
        Ok(c) => c,
        Err(_) => return (String::new(), String::new(), Vec::new()),
    };

    let mut description = String::new();
    let mut version = String::new();
    let mut tags: Vec<String> = Vec::new();
    let mut in_tags_list = false;

    if let Some(fm) = content.strip_prefix("---") {
        if let Some(end) = fm.find("---") {
            let frontmatter = &fm[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if in_tags_list && line.starts_with("- ") {
                    let tag = line.trim_start_matches("- ").trim().trim_matches('"').to_string();
                    if !tag.is_empty() {
                        tags.push(tag);
                    }
                    continue;
                }
                in_tags_list = false;

                if let Some(val) = line.strip_prefix("description:") {
                    description = val.trim().trim_matches('"').to_string();
                } else if let Some(val) = line.strip_prefix("version:") {
                    version = val.trim().trim_matches('"').to_string();
                } else if line.contains("tags:") {
                    if let Some(start) = line.find('[') {
                        if let Some(end_bracket) = line.find(']') {
                            let inner = &line[start + 1..end_bracket];
                            tags = inner.split(',')
                                .map(|t| t.trim().trim_matches('"').to_string())
                                .filter(|t| !t.is_empty())
                                .collect();
                        }
                    } else {
                        in_tags_list = true;
                    }
                }
            }
        }
    }

    (description, version, tags)
}

fn parse_category_description(category: &str) -> String {
    let home = dirs::home_dir().unwrap_or_default();
    let desc_path = format!("{}/.hermes/skills/{}/DESCRIPTION.md", home.display(), category);

    let content = match std::fs::read_to_string(&desc_path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    if let Some(fm) = content.strip_prefix("---") {
        if let Some(end) = fm.find("---") {
            let frontmatter = &fm[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("description:") {
                    return val.trim().trim_matches('"').to_string();
                }
            }
        }
    }

    String::new()
}

fn category_icon(cat: &str) -> String {
    match cat {
        "apple" => "\u{1F34E}",
        "autonomous-ai-agents" => "\u{1F916}",
        "creative" => "\u{1F3A8}",
        "data-science" => "\u{1F4CA}",
        "devops" => "\u{1F527}",
        "diagramming" => "\u{1F4D0}",
        "dogfood" => "\u{1F415}",
        "domain" => "\u{1F310}",
        "email" => "\u{1F4E7}",
        "gaming" => "\u{1F3AE}",
        "gifs" => "🎞️",
        "github" => "\u{1F419}",
        "inference-sh" => "\u{26A1}",
        "mcp" => "\u{1F50C}",
        "media" => "\u{1F3B5}",
        "mlops" => "\u{1F9E0}",
        "note-taking" => "\u{1F4DD}",
        "productivity" => "\u{1F4CB}",
        "red-teaming" => "\u{1F534}",
        "research" => "\u{1F52C}",
        "smart-home" => "\u{1F3E0}",
        "social-media" => "\u{1F4F1}",
        "software-development" => "\u{1F4BB}",
        _ => "\u{1F4C2}",
    }.to_string()
}

#[tauri::command]
async fn list_hermes_skills() -> Result<HermesSkillsResult, String> {
    let output = hermes_command()
        .args(&["skills", "list"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills list \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills: Vec<HermesSkill> = Vec::new();
    let mut hub_installed: usize = 0;
    let mut builtin: usize = 0;
    let mut local: usize = 0;
    let mut enabled_count: usize = 0;
    let mut disabled_count: usize = 0;
    let mut category_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let category = parts[1].to_string();
                let source = parts[2].to_string();
                let trust = parts[3].to_string();
                let enabled = if parts.len() >= 5 {
                    parts[4].eq_ignore_ascii_case("enabled")
                } else {
                    true
                };

                if name == "Name" || name.contains("\u{2501}") || name.contains("-") && category.contains("-") {
                    continue;
                }

                let (description, version, tags) = parse_skill_frontmatter(&category, &name);

                if enabled {
                    enabled_count += 1;
                } else {
                    disabled_count += 1;
                }
                *category_counts.entry(category.clone()).or_insert(0) += 1;

                skills.push(HermesSkill {
                    name,
                    category,
                    source,
                    trust,
                    enabled,
                    description,
                    version,
                    tags,
                });
            }
        }

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

    let mut categories: Vec<SkillCategory> = category_counts.into_iter().map(|(id, count)| {
        let desc = parse_category_description(&id);
        let icon = category_icon(&id);
        let display_name = id.split('-').map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }).collect::<Vec<_>>().join(" ");
        SkillCategory {
            id,
            name: display_name,
            description: desc,
            icon,
            count,
        }
    }).collect();
    categories.sort_by(|a, b| a.id.cmp(&b.id));

    let total = skills.len();
    Ok(HermesSkillsResult {
        skills,
        total,
        hub_installed,
        builtin,
        local,
        enabled_count,
        disabled_count,
        categories,
    })
}

#[derive(Serialize, Clone)]
struct BrowseSkill {
    name: String,
    description: String,
    source: String,
    trust: String,
    identifier: String,
}

#[derive(Serialize, Clone)]
struct BrowseResult {
    skills: Vec<BrowseSkill>,
    page: usize,
    total_pages: usize,
    total_skills: usize,
}

#[tauri::command]
async fn browse_skills(page: Option<usize>, size: Option<usize>, source: Option<String>) -> Result<BrowseResult, String> {
    let page = page.unwrap_or(1);
    let size = size.unwrap_or(20);
    let source = source.unwrap_or_else(|| "all".to_string());

    let mut cmd = hermes_command();
    cmd.args(&["skills", "browse", "--page", &page.to_string(), "--size", &size.to_string(), "--source", &source]);

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills browse \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills = Vec::new();
    let mut total_pages = 1usize;
    let mut total_skills = 0usize;

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.contains("page") && clean.contains('/') {
            if let Some(idx) = clean.rfind("page ") {
                let rest = &clean[idx + 5..];
                let parts: Vec<&str> = rest.split('/').collect();
                if parts.len() >= 2 {
                    total_pages = parts[1].split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(1);
                }
            }
        }

        if clean.contains("skills loaded") {
            if let Some(idx) = clean.find(|c: char| c.is_ascii_digit()) {
                let rest = &clean[idx..];
                total_skills = rest.split_whitespace().next()
                    .and_then(|n| n.parse().ok()).unwrap_or(0);
            }
        }

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let first = parts[0].to_string();
                if first == "#" {
                    continue;
                }

                let skill_name = if parts.len() >= 5 { parts[1].to_string() } else { first.clone() };
                let desc = if parts.len() >= 5 { parts[2].to_string() } else { parts[1].to_string() };
                let src = if parts.len() >= 5 { parts[3].to_string() } else { parts[2].to_string() };
                let trust_val = if parts.len() >= 6 { parts[4].to_string() } else { parts[3].to_string() };
                let identifier = if parts.len() >= 7 { parts[5].to_string() } else { String::new() };

                if skill_name == "Name" || skill_name.contains("\u{2501}") {
                    continue;
                }

                skills.push(BrowseSkill {
                    name: skill_name,
                    description: desc,
                    source: src,
                    trust: trust_val,
                    identifier,
                });
            }
        }
    }

    Ok(BrowseResult {
        skills,
        page,
        total_pages,
        total_skills,
    })
}

#[tauri::command]
async fn search_skills(query: String, source: Option<String>, limit: Option<usize>) -> Result<Vec<BrowseSkill>, String> {
    let mut cmd = hermes_command();
    cmd.args(&["skills", "search", &query]);
    if let Some(s) = source {
        cmd.args(&["--source", &s]);
    }
    if let Some(l) = limit {
        cmd.args(&["--limit", &l.to_string()]);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills search \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills = Vec::new();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let name = parts[0].to_string();
                if name == "Name" || name.contains("\u{2501}") {
                    continue;
                }

                let desc = parts[1].to_string();
                let src = parts[2].to_string();
                let trust_val = parts[3].to_string();
                let identifier = if parts.len() >= 5 { parts[4].to_string() } else { String::new() };

                skills.push(BrowseSkill {
                    name,
                    description: desc,
                    source: src,
                    trust: trust_val,
                    identifier,
                });
            }
        }
    }

    Ok(skills)
}

#[tauri::command]
async fn install_skill(identifier: String, category: Option<String>, name: Option<String>) -> Result<String, String> {
    let mut cmd = hermes_command();
    cmd.args(&["skills", "install", &identifier, "-y"]);
    if let Some(cat) = category {
        cmd.args(&["--category", &cat]);
    }
    if let Some(n) = name {
        cmd.args(&["--name", &n]);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills install \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("\u{5B89}\u{88C5}\u{5931}\u{8D25}: {}", stderr))
    }
}

#[tauri::command]
async fn uninstall_skill(name: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["skills", "uninstall", &name])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills uninstall \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("\u{5378}\u{8F7D}\u{5931}\u{8D25}: {}", stderr))
    }
}

#[tauri::command]
async fn inspect_skill(identifier: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["skills", "inspect", &identifier])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills inspect \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if output.status.success() && !stdout.trim().is_empty() {
        return Ok(stdout);
    }

    let home = dirs::home_dir().unwrap_or_default();
    let local_path = format!("{}/.hermes/skills/{}/SKILL.md", home.display(), identifier);
    if let Ok(content) = std::fs::read_to_string(&local_path) {
        return Ok(content);
    }

    let parts: Vec<&str> = identifier.split('/').collect();
    if parts.len() >= 2 {
        let cat_name = format!("{}/{}", parts[parts.len() - 2], parts[parts.len() - 1]);
        let local_path2 = format!("{}/.hermes/skills/{}/SKILL.md", home.display(), cat_name);
        if let Ok(content) = std::fs::read_to_string(&local_path2) {
            return Ok(content);
        }
    }

    Err(format!("Failed to view details: skill {} not found", identifier))
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

/// Get Hermes Agent config
#[tauri::command]
async fn get_hermes_config() -> Result<HermesConfig, String> {
    // Get config file path
    let config_path_output = hermes_command()
        .args(&["config", "path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    let config_path = String::from_utf8_lossy(&config_path_output.stdout).trim().to_string();

    let env_path_output = hermes_command()
        .args(&["config", "env-path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get env path: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    // Read config.yaml
    let yaml_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

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

/// Simplified YAML parser (convert to JSON Value)
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

/// Modify Hermes Agent config
#[tauri::command]
async fn set_hermes_config(key: String, value: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["config", "set", &key, &value])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to modify config: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

/// Restart Hermes Agent
#[tauri::command]
fn restart_hermes(state: State<'_, AgentProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    let _ = guard.take();

    kill_hermes_process();

    std::thread::sleep(std::time::Duration::from_millis(500));

    let child = hermes_command()
        .args(["gateway", "run", "--accept-hooks"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start hermes: {}", e))?;

    *guard = Some(child);
    Ok("Hermes Agent restarted".to_string())
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
    let version_output = hermes_command()
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

fn ensure_gateway_config(app: &AppHandle) {
    let home = home_dir();
    let hermes_home = format!("{}/.hermes", home);
    let config_path = format!("{}/config.yaml", hermes_home);
    let env_path = format!("{}/.env", hermes_home);

    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create .hermes directory: {}", e);
        return;
    }

    let mut env_content = String::new();
    if let Ok(existing) = std::fs::read_to_string(&env_path) {
        env_content = existing;
    }
    if !env_content.contains("GATEWAY_ALLOW_ALL_USERS") {
        env_content.push_str("\nGATEWAY_ALLOW_ALL_USERS=true\n");
        if let Err(e) = std::fs::write(&env_path, &env_content) {
            log::warn!("Failed to write gateway env config: {}", e);
        } else {
            let _ = app.emit("install-progress", InstallProgress {
                line: "Gateway API access configured".to_string(), done: false, success: false,
            });
        }
    }

    let mut config_content = String::new();
    if let Ok(existing) = std::fs::read_to_string(&config_path) {
        config_content = existing;
    }
    if !config_content.contains("api_server") {
        config_content.push_str("\n\nplatforms:\n  api_server:\n    port: 8642\n    enabled: true\n");
        if let Err(e) = std::fs::write(&config_path, &config_content) {
            log::warn!("Failed to write gateway api_server config: {}", e);
        } else {
            let _ = app.emit("install-progress", InstallProgress {
                line: "Local API Server enabled (port 8642)".to_string(), done: false, success: false,
            });
        }
    }
}

#[tauri::command]
#[allow(unused_variables)]
async fn install_hermes_agent(app: AppHandle, method: String) -> Result<bool, String> {
    log::info!("[install] Starting installation, method={}", method);
    let _ = app.emit(
        "install-progress",
        InstallProgress { line: "Detecting system environment...".to_string(), done: false, success: false },
    );

    kill_hermes_process();

    log::info!("[install] Proceeding with native install (bundled source)");

    #[cfg(target_os = "windows")]
    {
        return windows_native_install(&app).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return unix_native_install(&app).await;
    }
}

#[cfg(target_os = "windows")]
fn is_windowsapps_stub(path: &str) -> bool {
    let lower = path.to_lowercase();
    if !lower.contains("windowsapps") {
        return false;
    }
    if lower.contains("pythonsoftwarefoundation") {
        return false;
    }
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() == 0 {
            return true;
        }
    }
    let check = command(path)
        .args(["-c", "import sys; print(sys.version)"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();
    match check {
        Ok(output) => !output.status.success(),
        Err(_) => true,
    }
}

#[cfg(target_os = "windows")]
fn validate_python_version(path: &str) -> Option<String> {
    let output = command(path)
        .args(["-c", "import sys; v=sys.version_info; print(f'{v.major}.{v.minor}')"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = ver.split('.').collect();
    if parts.len() >= 2 {
        if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
            if major > 3 || (major == 3 && minor >= 11) {
                return Some(path.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_windows_python() -> Option<String> {
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let program_files = std::env::var("ProgramFiles").unwrap_or_default();
    let paths = [
        format!("{}\\Programs\\Python\\Python314\\python.exe", local_appdata),
        format!("{}\\Programs\\Python\\Python313\\python.exe", local_appdata),
        format!("{}\\Programs\\Python\\Python312\\python.exe", local_appdata),
        format!("{}\\Programs\\Python\\Python311\\python.exe", local_appdata),
        format!("{}\\Python314\\python.exe", program_files),
        format!("{}\\Python313\\python.exe", program_files),
        format!("{}\\Python312\\python.exe", program_files),
        format!("{}\\Python311\\python.exe", program_files),
        format!("C:\\Python314\\python.exe"),
        format!("C:\\Python313\\python.exe"),
        format!("C:\\Python312\\python.exe"),
        format!("C:\\Python311\\python.exe"),
    ];

    for path in &paths {
        if std::path::Path::new(path).exists() {
            if !is_windowsapps_stub(path) {
                if let Some(validated) = validate_python_version(path) {
                    return Some(validated);
                }
            }
        }
    }
    if let Ok(output) = command("py").args(["-0p"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('-') {
                    continue;
                }
                let path = if line.contains(' ') {
                    line.split_whitespace().last().unwrap_or("")
                } else {
                    line
                };
                if path.is_empty() || !path.to_lowercase().ends_with("python.exe") {
                    continue;
                }
                if is_windowsapps_stub(path) {
                    continue;
                }
                if std::path::Path::new(path).exists() {
                    if let Some(validated) = validate_python_version(path) {
                        return Some(validated);
                    }
                }
            }
        }
    }

    for cmd in &["python3.13", "python3.12", "python3.11", "python3", "python"] {
        if let Ok(output) = command(cmd).arg("--version").output() {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let line = line.trim();
                    if line.is_empty() {
                        continue;
                    }
                    if is_windowsapps_stub(line) {
                        log::warn!("[install] Skipping WindowsApps stub: {}", line);
                        continue;
                    }
                    if std::path::Path::new(line).exists() {
                        if let Some(validated) = validate_python_version(line) {
                            return Some(validated);
                        }
                    }
                }
            }
        }
    }

    log::warn!("[install] No Python 3.11+ found on system");
    None
}

#[cfg(target_os = "windows")]
fn try_install_python_via_uv(app: &AppHandle) -> Option<String> {
    let uv_exe = {
        let local = format!("{}\\AppData\\Local\\hermes", std::env::var("USERPROFILE").unwrap_or_default());
        let custom_path = format!("{};{}", local, std::env::var("PATH").unwrap_or_default());
        let candidates = [
            format!("{}\\.local\\bin\\uv.exe", std::env::var("USERPROFILE").unwrap_or_default()),
            format!("{}\\.cargo\\bin\\uv.exe", std::env::var("USERPROFILE").unwrap_or_default()),
        ];
        let mut found = None;
        for p in &candidates {
            if std::path::Path::new(p).exists() {
                found = Some(p.clone());
                break;
            }
        }
        if found.is_none() {
            if let Ok(output) = command("uv").arg("--version").env("PATH", &custom_path).output() {
                if output.status.success() {
                    found = Some("uv".to_string());
                }
            }
        }
        found
    };

    if let Some(uv) = &uv_exe {
        let _ = app.emit("install-progress", InstallProgress {
            line: "Installing Python 3.11 via uv...".to_string(), done: false, success: false,
        });
        let _ = command(uv).args(["python", "install", "3.11"]).output();
        let _ = command(uv).args(["python", "install", "3.12"]).output();
        if let Some(py) = find_windows_python() {
            return Some(py);
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn find_unix_python() -> Option<String> {
    let brew_prefixes = if std::path::Path::new("/opt/homebrew/bin/brew").exists() {
        vec!["/opt/homebrew"]
    } else if std::path::Path::new("/usr/local/bin/brew").exists() {
        vec!["/usr/local"]
    } else {
        vec!["/opt/homebrew", "/usr/local"]
    };

    for prefix in &brew_prefixes {
        for ver in &["3.13", "3.12", "3.11"] {
            let path = format!("{}/opt/python@{}/bin/python3", prefix, ver);
            if std::path::Path::new(&path).exists() {
                if verify_python_version(&path) {
                    log::info!("[install] Found Python via brew: {}", path);
                    return Some(path);
                }
            }
        }
        let default_brew = format!("{}/bin/python3", prefix);
        if std::path::Path::new(&default_brew).exists() {
            if verify_python_version(&default_brew) {
                log::info!("[install] Found Python via brew default: {}", default_brew);
                return Some(default_brew);
            }
        }
    }

    let explicit_paths = [
        "/usr/local/bin/python3.13", "/usr/local/bin/python3.12", "/usr/local/bin/python3.11",
        "/usr/bin/python3.13", "/usr/bin/python3.12", "/usr/bin/python3.11",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
    ];
    for path in &explicit_paths {
        if std::path::Path::new(path).exists() {
            if verify_python_version(path) {
                log::info!("[install] Found Python at: {}", path);
                return Some(path.to_string());
            }
        }
    }

    for cmd in &["python3.13", "python3.12", "python3.11", "python3", "python"] {
        if let Ok(output) = command(cmd).arg("--version").output() {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout);
                let stderr_version = String::from_utf8_lossy(&output.stderr);
                let combined = format!("{}{}", version, stderr_version);
                if combined.contains("Python 3.") {
                    let major_minor: Vec<&str> = combined.split("Python ")
                        .nth(1).unwrap_or("0.0")
                        .split('.').collect();
                    if major_minor.len() >= 2 {
                        if let (Ok(major), Ok(minor)) = (major_minor[0].parse::<u32>(), major_minor[1].parse::<u32>()) {
                            if major == 3 && minor >= 11 {
                                let full = unix_which(cmd);
                                let exe_path = full.as_deref().unwrap_or(cmd);
                                log::info!("[install] Found Python via PATH: {} -> {}", exe_path, version.trim());
                                return Some(exe_path.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    log::warn!("[install] No Python 3.11+ found on system");
    None
}

#[cfg(not(target_os = "windows"))]
fn verify_python_version(path: &str) -> bool {
    if let Ok(output) = command(path).arg("--version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout);
            let stderr_version = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{}{}", version, stderr_version);
            if let Some(ver_start) = combined.find("Python ") {
                let ver_str = &combined[ver_start + 7..];
                let parts: Vec<&str> = ver_str.splitn(2, '.').collect();
                if parts.len() >= 2 {
                    if let (Ok(major), Ok(minor)) = (parts[0].parse::<u32>(), parts[1].parse::<u32>()) {
                        return major == 3 && minor >= 11;
                    }
                }
            }
        }
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn unix_which(cmd: &str) -> Option<String> {
    if let Ok(output) = command("which").arg(cmd).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
async fn unix_native_install(app: &AppHandle) -> Result<bool, String> {
    let home = home_dir();
    let hermes_dir = format!("{}/.hermes/hermes-agent", home);
    let venv_dir = format!("{}/venv", hermes_dir);

    let _ = app.emit("install-progress", InstallProgress {
        line: "Extracting project from bundled source...".to_string(), done: false, success: false,
    });

    if std::path::Path::new(&hermes_dir).exists() {
        log::info!("[install] Removing existing hermes_dir: {}", hermes_dir);
        let _ = std::fs::remove_dir_all(&hermes_dir);
    }
    std::fs::create_dir_all(&hermes_dir)
        .map_err(|e| format!("Failed to create dir {}: {}", hermes_dir, e))?;

    let source_candidates = vec![
        app.path().resource_dir()
            .map(|p| p.join("hermes-agent-source"))
            .unwrap_or_default(),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("hermes-agent-source"),
        std::env::current_exe()
            .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("hermes-agent-source"))
            .unwrap_or_default(),
    ];

    let mut bundled_found = false;
    let mut found_path = std::path::PathBuf::new();
    for candidate in &source_candidates {
        log::info!("[install] Looking for bundled source at: {}", candidate.display());
        if candidate.exists() && candidate.is_dir() {
            let has_real_source = candidate.join("pyproject.toml").exists()
                || candidate.join("setup.py").exists()
                || candidate.join("setup.cfg").exists();
            if has_real_source {
                bundled_found = true;
                found_path = candidate.clone();
                break;
            } else {
                log::warn!("[install] Found directory but no valid source files, skipping: {}", candidate.display());
            }
        }
    }

    if bundled_found {
        log::info!("[install] Copying bundled hermes-agent source from: {}", found_path.display());
        copy_dir_recursive(&found_path, std::path::Path::new(&hermes_dir))
            .map_err(|e| format!("Failed to copy source: {}", e))?;
        log::info!("[install] Source copy complete");
    } else {
        return Err("Bundled hermes-agent source not found. Please build the application with 'node scripts/download-hermes-source.cjs' first, or reinstall.".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Source code ready".to_string(), done: false, success: false,
    });

    let python = find_unix_python()
        .ok_or("Python 3.11+ not found, please install Python first")?;

    let _ = app.emit("install-progress", InstallProgress {
        line: format!("Using Python: {}", python), done: false, success: false,
    });

    let _ = app.emit("install-progress", InstallProgress {
        line: "Creating virtual environment...".to_string(), done: false, success: false,
    });

    let venv = command(&python)
        .args(["-m", "venv", &venv_dir])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to create venv: {}", e))?;

    if !venv.status.success() {
        return Err("Failed to create virtual environment".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Virtual environment created, installing dependencies...".to_string(), done: false, success: false,
    });

    let python_exe = format!("{}/bin/python", venv_dir);
    let _pip_upgrade = command(&python_exe)
        .args(["-m", "pip", "install", "--upgrade", "pip",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let install = command(&python_exe)
        .args(["-m", "pip", "install", "-e", &hermes_dir,
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("pip install failed: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("pip install failed: {}", stderr.trim()));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Dependencies installed, verifying...".to_string(), done: false, success: false,
    });

    let venv_hermes_bin = format!("{}/bin/hermes", venv_dir);
    let version_check = command(&venv_hermes_bin)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !version_check {
        return Err("Hermes Agent installation verification failed. The bundled source may be incomplete or corrupted. Please reinstall the application.".to_string());
    }

    let local_bin = format!("{}/.local/bin", home);
    let hermes_link = format!("{}/hermes", local_bin);
    let venv_hermes = format!("{}/bin/hermes", venv_dir);
    if std::path::Path::new(&venv_hermes).exists() && !std::path::Path::new(&hermes_link).exists() {
        let _ = std::fs::create_dir_all(&local_bin);
        let _ = std::os::unix::fs::symlink(&venv_hermes, &hermes_link);
    }

    let actual_installed = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if actual_installed {
        ensure_gateway_config(app);
        sync_hermes_providers_to_db(app).await;
        sync_api_keys_to_hermes_env(app).await;
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: if actual_installed { "Installation complete".to_string() } else { "Installation failed".to_string() },
        done: true, success: actual_installed,
    });

    Ok(actual_installed)
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    if !dst.exists() {
        std::fs::create_dir_all(dst).map_err(|e| format!("Failed to create dir {}: {}", dst.display(), e))?;
    }
    let entries = std::fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {}", src.display(), e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Failed to copy {} to {}: {}", src_path.display(), dst_path.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(target_os = "windows")]
async fn windows_native_install(app: &AppHandle) -> Result<bool, String> {
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let hermes_dir = format!("{}\\hermes\\hermes-agent", local_appdata);
    let venv_dir = format!("{}\\venv", hermes_dir);

    let _ = app.emit("install-progress", InstallProgress {
        line: "Extracting project from bundled source...".to_string(), done: false, success: false,
    });

    if std::path::Path::new(&hermes_dir).exists() {
        log::info!("[install] Removing existing hermes_dir: {}", hermes_dir);
        let _ = std::fs::remove_dir_all(&hermes_dir);
    }
    std::fs::create_dir_all(&hermes_dir)
        .map_err(|e| format!("Failed to create dir {}: {}", hermes_dir, e))?;

    let resource_base = app.path().resource_dir()
        .map_err(|e| format!("Cannot get resource dir: {}", e))?;

    let source_candidates = vec![
        resource_base.join("hermes-agent-source"),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("hermes-agent-source"),
        std::path::Path::new(&std::env::current_exe().map_err(|e| e.to_string())?)
            .parent().unwrap_or(std::path::Path::new("."))
            .join("hermes-agent-source"),
    ];

    let mut bundled_found = false;
    let mut found_path = std::path::PathBuf::new();
    for candidate in &source_candidates {
        log::info!("[install] Looking for bundled source at: {}", candidate.display());
        if candidate.exists() && candidate.is_dir() {
            let has_real_source = candidate.join("pyproject.toml").exists()
                || candidate.join("setup.py").exists()
                || candidate.join("setup.cfg").exists();
            if has_real_source {
                bundled_found = true;
                found_path = candidate.clone();
                break;
            } else {
                log::warn!("[install] Found directory but no valid source files, skipping: {}", candidate.display());
            }
        }
    }

    if bundled_found {
        log::info!("[install] Copying bundled hermes-agent source from: {}", found_path.display());
        copy_dir_recursive(&found_path, std::path::Path::new(&hermes_dir))
            .map_err(|e| format!("Failed to copy source: {}", e))?;
        log::info!("[install] Source copy complete");
    } else {
        return Err("Bundled hermes-agent source not found. Please build the application with 'node scripts/download-hermes-source.cjs' first, or reinstall.".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Source code ready".to_string(), done: false, success: false,
    });

    let python = find_windows_python()
        .or_else(|| try_install_python_via_uv(app))
        .ok_or("Python not found, please install Python 3.11 or higher")?;

    let _ = app.emit("install-progress", InstallProgress {
        line: format!("Using Python: {}", python), done: false, success: false,
    });

    let _ = app.emit("install-progress", InstallProgress {
        line: "Creating virtual environment...".to_string(), done: false, success: false,
    });

    let venv = command(&python)
        .args(["-m", "venv", &venv_dir])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to create venv: {}", e))?;

    if !venv.status.success() {
        let stderr = String::from_utf8_lossy(&venv.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&venv.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Unknown error".to_string()
        };
        log::error!("[install] venv creation failed: {}", detail);
        return Err(format!(
            "Failed to create virtual environment with Python '{}': {}. Please ensure Python 3.11+ is installed from python.org (not Microsoft Store stub)",
            python, detail
        ));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Virtual environment created, installing dependencies (Tsinghua mirror)...".to_string(), done: false, success: false,
    });

    let python_exe = format!("{}\\Scripts\\python.exe", venv_dir);
    let install = command(&python_exe)
        .args(["-m", "pip", "install", "--upgrade", "pip",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let install = command(&python_exe)
        .args(["-m", "pip", "install", "-e", &hermes_dir,
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("pip install failed: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("pip install failed: {}", stderr.trim()));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Dependencies installed, verifying...".to_string(), done: false, success: false,
    });

    let venv_hermes_bin = format!("{}\\Scripts\\hermes.exe", venv_dir);
    let version_check = command(&venv_hermes_bin)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !version_check {
        return Err("Hermes Agent installation verification failed. The bundled source may be incomplete or corrupted. Please reinstall the application.".to_string());
    }

    let actual_installed = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if actual_installed {
        ensure_gateway_config(app);
        sync_hermes_providers_to_db(app).await;
        sync_api_keys_to_hermes_env(app).await;
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: if actual_installed { "Installation complete".to_string() } else { "Installation failed".to_string() },
        done: true, success: actual_installed,
    });

    Ok(actual_installed)
}

#[tauri::command]
async fn start_hermes_agent(_app: AppHandle, state: State<'_, AgentProcess>) -> Result<String, String> {
    kill_hermes_process();
    std::thread::sleep(std::time::Duration::from_millis(300));

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let _ = guard.take();

    let new_path = path_with_local_bin();

    match hermes_command()
        .args(["gateway", "run", "--accept-hooks"])
        .env("PATH", &new_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            log::info!("Hermes Agent started");
            *guard = Some(child);
            Ok("Hermes Agent started".to_string())
        }
        Err(e) => {
            log::error!("Failed to start Hermes Agent: {}", e);
            Err(format!("Failed to start Hermes Agent: {}", e))
        }
    }
}

/// Streaming chat - send data to frontend via events (using hermes chat -q)
/// True streaming: read stdout and emit events to frontend
#[tauri::command]
async fn chat_with_hermes_stream(
    app: AppHandle,
    message: String,
    conversation_id: String,
    model: Option<String>,
    provider: Option<String>,
    image: Option<String>,
) -> Result<(), String> {
    let event_id = format!("chat_stream_{}", conversation_id);
    log::info!("[chat_stream] start conversation_id={}, message={}, model={:?}, provider={:?}, image={:?}", conversation_id, message, model, provider, image);

    let bin = hermes_bin();
    let model_arg = match &model {
        Some(m) => format!(" -m '{}'", m.replace('\'', "'\"'\"'")),
        None => String::new(),
    };
    let provider_arg = match &provider {
        Some(p) => format!(" --provider '{}'", p.replace('\'', "'\"'\"'")),
        None => String::new(),
    };
    let image_arg = match &image {
        Some(img) => format!(" --image '{}'", img.replace('\'', "'\"'\"'")),
        None => String::new(),
    };
    let shell_cmd = format!(
        "{} chat -q '{}' -Q{}{}{}",
        bin,
        message.replace('\\', "\\\\").replace('\'', "'\"'\"'"),
        model_arg,
        provider_arg,
        image_arg
    );
    let shell = default_shell();
    log::info!("[chat_stream] executing command: {} -lc {}", shell, shell_cmd);

    let new_path = path_with_local_bin();

    let mut child = match tokio::process::Command::from(command(shell))
        .args(["-lc", &shell_cmd])
        .env("PATH", &new_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("[chat_stream] failed to start command: {}", e);
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: None,
                tool_name: None,
                tool_label: None,
                chunk: format!("[Error] Failed to start hermes chat: {}", e),
                done: false,
            });
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: None,
                tool_name: None,
                tool_label: None,
                chunk: "".to_string(),
                done: true,
            });
            return Ok(());
        }
    };

    let stdout = child.stdout.take();
    let stderr_child = child.stderr.take();

    // Read stderr in background
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

    // Read stdout in real-time and emit events
    use tokio::io::{AsyncBufReadExt, BufReader};

    let result = if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut total_content = String::new();

        // Line-by-line read loop with timeout
        loop {
            let line_result = tokio::time::timeout(
                tokio::time::Duration::from_secs(180),
                lines.next_line(),
            ).await;

            match line_result {
                Ok(Ok(Some(line))) => {
                    // Skip session_id line
                    if line.starts_with("session_id:") {
                        log::info!("[chat_stream] skip session_id line: {}", line);
                        continue;
                    }
                    if !line.is_empty() {
                        total_content.push_str(&line);
                        total_content.push('\n');
                        let _ = app.emit(&event_id, ChatStreamEvent {
                            event_type: None,
                            tool_name: None,
                            tool_label: None,
                            chunk: line,
                            done: false,
                        });
                    }
                }
                Ok(Ok(None)) => {
                    // stdout EOF
                    log::info!("[chat_stream] stdout EOF, total length: {}", total_content.len());
                    break;
                }
                Ok(Err(e)) => {
                    log::warn!("[chat_stream] read stdout error: {}", e);
                    break;
                }
                Err(_) => {
                    log::warn!("[chat_stream] read timeout");
                    let _ = app.emit(&event_id, ChatStreamEvent {
                        event_type: None,
                        tool_name: None,
                        tool_label: None,
                        chunk: "[Error] Request timeout, please check network or model config".to_string(),
                        done: false,
                    });
                    break;
                }
            }
        }

        if total_content.is_empty() {
            log::warn!("[chat_stream] stdout empty");
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: None,
                tool_name: None,
                tool_label: None,
                chunk: "[No response]".to_string(),
                done: false,
            });
        }

        Ok(())
    } else {
        log::error!("[chat_stream] cannot get stdout");
        let _ = app.emit(&event_id, ChatStreamEvent {
            event_type: None,
            tool_name: None,
            tool_label: None,
            chunk: "[Error] Cannot get command output".to_string(),
            done: false,
        });
        Ok(())
    };

    // Wait for child process to exit
    let _ = child.wait().await;

    // Check stderr
    let stderr_output = stderr_task.await.unwrap_or_default();
    if !stderr_output.trim().is_empty() {
        log::warn!("[chat_stream] stderr: {}", stderr_output.trim());
    }

    // Send done event
    let _ = app.emit(&event_id, ChatStreamEvent {
        event_type: None,
        tool_name: None,
        tool_label: None,
        chunk: "".to_string(),
        done: true,
    });

    log::info!("[chat_stream] done");
    result
}

fn tool_label(tool_name: &str) -> &str {
    match tool_name {
        "read_file" => "Reading file...",
        "write_file" => "Writing file...",
        "execute_code" => "Executing code...",
        "web_search" => "Searching web...",
        "browser" => "Browsing web...",
        "terminal" => "Executing command...",
        "bash" => "Executing command...",
        "list_files" => "Listing files...",
        "search_files" => "Searching files...",
        "grep" => "Searching code...",
        "memory_search" => "Searching memory...",
        "delegate_task" => "Delegating task...",
        "clarify" => "Requesting clarification...",
        _ => "Processing...",
    }
}

#[tauri::command]
async fn chat_with_hermes_api(
    app: AppHandle,
    message: String,
    session_id: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    image: Option<String>,
    event_id: Option<String>,
) -> Result<(), String> {
    let event_id = event_id.unwrap_or_else(|| format!("chat-stream-{}", uuid::Uuid::new_v4()));
    log::info!("[chat_api] start event_id={}, message={}, session_id={:?}, model={:?}, provider={:?}, image={:?}", event_id, message, session_id, model, provider, image);

    let api_base = "http://127.0.0.1:8642/v1";
    let api_key = "hermes-desktop-local-dev-key";

    let mut messages: Vec<serde_json::Value> = Vec::new();

    if let Some(img) = &image {
        messages.push(serde_json::json!({
            "role": "user",
            "content": [
                {"type": "text", "text": message},
                {"type": "image_url", "image_url": {"url": format!("file://{}", img)}}
            ]
        }));
    } else {
        messages.push(serde_json::json!({
            "role": "user",
            "content": message
        }));
    }

    let mut request_body = serde_json::json!({
        "model": "hermes-agent",
        "messages": messages,
        "stream": true
    });

    if let Some(m) = &model {
        request_body["hermes_model"] = serde_json::json!(m);
    }
    if let Some(p) = &provider {
        request_body["hermes_provider"] = serde_json::json!(p);
    }
    if let Some(sid) = &session_id {
        request_body["hermes_session_id"] = serde_json::json!(sid);
    }

    let client = reqwest::Client::new();
    let response = match client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            log::error!("[chat_api] HTTP request failed: {}", e);
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: Some("error".to_string()),
                tool_name: None,
                tool_label: None,
                chunk: format!("[Error] API request failed: {}", e),
                done: false,
            });
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: None,
                tool_name: None,
                tool_label: None,
                chunk: "".to_string(),
                done: true,
            });
            return Ok(());
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        log::error!("[chat_api] API returned error ({}): {}", status, body);
        let _ = app.emit(&event_id, ChatStreamEvent {
            event_type: Some("error".to_string()),
            tool_name: None,
            tool_label: None,
            chunk: format!("[Error] API returned {}: {}", status, body),
            done: false,
        });
        let _ = app.emit(&event_id, ChatStreamEvent {
            event_type: None,
            tool_name: None,
            tool_label: None,
            chunk: "".to_string(),
            done: true,
        });
        return Ok(());
    }

    use futures_util::StreamExt;

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut current_event: Option<String> = None;
    let mut first_chunk = true;

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                if first_chunk && buffer.trim_start().starts_with('{') {
                    if let Ok(err) = serde_json::from_str::<serde_json::Value>(buffer.trim()) {
                        let msg = err["error"]["message"].as_str().unwrap_or("Unknown error");
                        log::error!("[chat_api] API returned error: {}", msg);
                        let _ = app.emit(&event_id, ChatStreamEvent {
                            event_type: Some("error".to_string()),
                            tool_name: None,
                            tool_label: None,
                            chunk: format!("[Error] {}", msg),
                            done: false,
                        });
                        let _ = app.emit(&event_id, ChatStreamEvent {
                            event_type: None,
                            tool_name: None,
                            tool_label: None,
                            chunk: "".to_string(),
                            done: true,
                        });
                        return Ok(());
                    }
                }
                first_chunk = false;

                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].trim().to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    if line.starts_with("event: ") {
                        current_event = Some(line[7..].trim().to_string());
                        continue;
                    }

                    if line.starts_with("data: ") {
                        let data = line[6..].trim();

                        if data == "[DONE]" {
                            continue;
                        }

                        match serde_json::from_str::<serde_json::Value>(data) {
                            Ok(parsed) => {
                                let event_type = current_event.take();

                                if event_type.as_deref() == Some("hermes.tool.progress") {
                                    let tool_name = parsed["tool_name"].as_str().unwrap_or("unknown");
                                    let label = tool_label(tool_name);
                                    log::info!("[chat_api] tool progress: {} -> {}", tool_name, label);
                                    let _ = app.emit(&event_id, ChatStreamEvent {
                                        event_type: Some("tool_progress".to_string()),
                                        tool_name: Some(tool_name.to_string()),
                                        tool_label: Some(label.to_string()),
                                        chunk: label.to_string(),
                                        done: false,
                                    });
                                } else {
                                    if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                                        let _ = app.emit(&event_id, ChatStreamEvent {
                                            event_type: Some("text".to_string()),
                                            tool_name: None,
                                            tool_label: None,
                                            chunk: delta.to_string(),
                                            done: false,
                                        });
                                    }
                                }
                            }
                            Err(e) => {
                                log::warn!("[chat_api] failed to parse SSE data: {} data={}", e, data);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("[chat_api] stream read error: {}", e);
                break;
            }
        }
    }

    let _ = app.emit(&event_id, ChatStreamEvent {
        event_type: None,
        tool_name: None,
        tool_label: None,
        chunk: "".to_string(),
        done: true,
    });

    log::info!("[chat_api] done");
    Ok(())
}

/// Open log directory
#[tauri::command]
fn open_log_dir() -> Result<(), String> {
    let log_dir = db::log_dir();

    #[cfg(target_os = "macos")]
    command("open")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    command("explorer")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Toggle Avatar window show/hide
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
            log::info!("Hermes Desktop started");

            if let Some(avatar_win) = app.get_webview_window("avatar") {
                let _ = avatar_win.set_decorations(false);
                let _ = avatar_win.set_shadow(false);
            }

            let db_path = db::db_path();
            log::info!("Database path: {}", db_path.display());

            if let Some(parent) = db_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    log::error!("Failed to create directory: {}", e);
                }
            }

            let app_handle = app.handle().clone();

            let wal_path = db_path.with_extension("db-wal");
            let shm_path = db_path.with_extension("db-shm");
            for stale in [&wal_path, &shm_path] {
                if stale.exists() {
                    log::info!("Cleaning up stale WAL/SHM files: {}", stale.display());
                    let _ = std::fs::remove_file(stale);
                }
            }

            let db_path_clone = db_path.clone();
            let connect_fn = || {
                db_path_clone.to_str()
                    .unwrap_or("hermes.db")
                    .parse::<sqlx::sqlite::SqliteConnectOptions>()
                    .unwrap_or_else(|_| sqlx::sqlite::SqliteConnectOptions::new().filename(&db_path_clone))
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete)
                    .foreign_keys(true)
            };

            tauri::async_runtime::block_on(async {
                let result = SqlitePool::connect_with(connect_fn()).await;

                match result {
                    Ok(pool) => {
                        if let Err(e) = db::init_db(&pool).await {
                            log::error!("Failed to initialize database: {}", e);
                        }
                        app_handle.manage(AppState { db_pool: pool });
                    }
                    Err(e) => {
                        log::warn!("Database connection failed: {}, attempting recovery...", e);

                        let _ = std::fs::remove_file(&db_path);
                        let _ = std::fs::remove_file(&wal_path);
                        let _ = std::fs::remove_file(&shm_path);

                        match SqlitePool::connect_with(connect_fn()).await {
                            Ok(pool) => {
                                log::info!("Database rebuilt successfully");
                                if let Err(e) = db::init_db(&pool).await {
                                    log::error!("Failed to initialize database: {}", e);
                                }
                                app_handle.manage(AppState { db_pool: pool });
                            }
                            Err(e2) => {
                                log::error!("Database recovery failed: {}", e2);
                                show_error_dialog(&format!("Database connection failed\n\n{}\n\nApplication will exit", e2));
                                std::process::exit(1);
                            }
                        }
                    }
                }
            });

            let hermes_installed = hermes_command()
                .arg("version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if hermes_installed {
        ensure_gateway_config(app.handle());
        let handle = app.handle().clone();
                tauri::async_runtime::block_on(async {
                    sync_hermes_providers_to_db(&handle).await;
                    sync_api_keys_to_hermes_env(&handle).await;
                });

                kill_hermes_process();
                std::thread::sleep(std::time::Duration::from_millis(300));

                match hermes_command()
                    .args(["gateway", "run", "--accept-hooks"])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        log::info!("Hermes Gateway started (+API Server)");
                        app.manage(AgentProcess(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        log::error!("Failed to start Hermes Gateway: {}", e);
                        app.manage(AgentProcess(Mutex::new(None)));
                    }
                }
            } else {
                log::warn!("Hermes Agent not installed, skipping startup, waiting for frontend guide");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restart_hermes,
            toggle_avatar_window,
            sync_chat_window,
            close_chat_window,
            hide_avatar_window,
            chat_with_hermes_stream,
            chat_with_hermes_api,
            open_log_dir,
            get_hermes_info,
            check_hermes_installed,
            install_hermes_agent,
            start_hermes_agent,
            get_conversation_count,
            list_hermes_skills,
            browse_skills,
            search_skills,
            install_skill,
            uninstall_skill,
            inspect_skill,
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
            commands::save_temp_file,
            commands::list_ai_roles,
            commands::create_ai_role,
            commands::update_ai_role,
            commands::delete_ai_role,
            commands::list_projects,
            commands::create_project,
            commands::update_project,
            commands::delete_project,
            commands::list_project_members,
            commands::add_project_member,
            commands::remove_project_member,
            commands::list_project_workflows,
            commands::add_project_workflow,
            commands::remove_project_workflow,
            commands::list_project_artifacts,
            commands::create_project_artifact,
            commands::update_project_artifact_status,
            commands::list_project_messages,
            commands::create_project_message,
            commands::read_text_file,
            commands::sync_workflow_to_file,
            commands::load_workflow_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("Hermes Desktop failed to start");
}
