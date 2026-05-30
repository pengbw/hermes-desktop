use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use std::process::{Command, Stdio};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::provider::decrypt_api_key;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub(crate) fn hermes_api_base() -> String {
    std::env::var("HERMES_API_BASE")
        .unwrap_or_else(|_| "http://127.0.0.1:8642/v1".to_string())
}

pub(crate) fn hermes_api_key() -> String {
    std::env::var("HERMES_API_KEY")
        .unwrap_or_default()
}

pub(crate) async fn hermes_api_base_from_pool(pool: &SqlitePool) -> String {
    if let Ok(Some(val)) = sqlx::query_scalar::<_, String>(
        "SELECT value FROM app_config WHERE key = 'hermes_api_base'"
    )
    .fetch_optional(pool)
    .await
    {
        if !val.is_empty() {
            return val;
        }
    }
    hermes_api_base()
}

pub(crate) async fn hermes_api_key_from_pool(pool: &SqlitePool) -> String {
    if let Ok(Some(val)) = sqlx::query_scalar::<_, String>(
        "SELECT value FROM app_config WHERE key = 'hermes_api_key'"
    )
    .fetch_optional(pool)
    .await
    {
        if !val.is_empty() {
            return val;
        }
    }
    hermes_api_key()
}

pub(crate) fn build_role_constraint_rules() -> &'static str {
    "\n\n【角色行为约束 - 不可违反】\n\
     1. 只做你职责范围内的工作，不主动做其他角色的事。\n\
     2. 不要对非职责范围内的事务发表任何意见。\n\
     3. 不要提供超出你职责范围的建议、分析或解释。\n\
     4. 如果用户需求的超出职责范围，必须统一回复：「抱歉，这超出我的职责范围！」\n\
     5. 严格遵守产出物格式和输出位置要求，不得擅自更改文件路径或另起新文件。\n\
     6. 角色对话回复中不要人为的输出 [解析上下文标签格式]"
}

pub(crate) fn command(program: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd
}

pub(crate) fn hermes_bin() -> String {
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

pub(crate) fn hermes_command() -> Command {
    command(&hermes_bin())
}

pub(crate) fn home_dir() -> String {
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").unwrap_or_default()
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").unwrap_or_default()
    }
}

pub(crate) fn hermes_home_dir() -> String {
    #[cfg(not(target_os = "windows"))]
    {
        format!("{}/.hermes", home_dir())
    }
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        format!("{}\\hermes", local_appdata)
    }
}

pub(crate) fn hermes_agent_dir() -> Result<String, String> {
    let dir = {
        #[cfg(not(target_os = "windows"))]
        {
            format!("{}/.hermes/hermes-agent", home_dir())
        }
        #[cfg(target_os = "windows")]
        {
            let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
            format!("{}\\hermes\\hermes-agent", local_appdata)
        }
    };
    if std::path::Path::new(&dir).exists() {
        Ok(dir)
    } else {
        Err("Hermes project root not found.".to_string())
    }
}

pub(crate) fn hermes_venv_python() -> Result<String, String> {
    let candidates = {
        #[cfg(not(target_os = "windows"))]
        {
            let home = home_dir();
            vec![
                format!("{}/.hermes/hermes-agent/venv/bin/python3", home),
                format!("{}/.hermes/hermes-agent/venv/bin/python", home),
                format!("{}/.hermes/hermes-agent/.venv/bin/python3", home),
                format!("{}/.hermes/hermes-agent/.venv/bin/python", home),
            ]
        }
        #[cfg(target_os = "windows")]
        {
            let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
            vec![
                format!("{}\\hermes\\hermes-agent\\venv\\Scripts\\python.exe", local_appdata),
                format!("{}\\hermes\\hermes-agent\\.venv\\Scripts\\python.exe", local_appdata),
            ]
        }
    };
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Ok(path.clone());
        }
    }
    Err("Hermes Python venv not found. Please install Hermes Agent first.".to_string())
}

pub(crate) fn hermes_env_file_path() -> Result<String, String> {
    let env_path = format!("{}{}.env", hermes_home_dir(), std::path::MAIN_SEPARATOR);
    Ok(env_path)
}

/// 直接写入键值对到 ~/.hermes/.env（Windows: %LOCALAPPDATA%\hermes\.env）
/// 若 key 已存在则更新该行，否则追加到文件末尾。
/// 文件不存在时会自动创建。
pub(crate) fn write_env_value(key: &str, value: &str) -> Result<(), String> {
    let hermes_home = hermes_home_dir();
    let env_path = format!("{}{}.env", hermes_home, std::path::MAIN_SEPARATOR);
    // 确保目录存在
    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create hermes home dir: {}", e);
    }

    let mut lines: Vec<String> = if std::path::Path::new(&env_path).exists() {
        std::fs::read_to_string(&env_path)
            .unwrap_or_default()
            .lines()
            .map(String::from)
            .collect()
    } else {
        Vec::new()
    };

    let mut found = false;
    let needle = format!("{}=", key);
    for line in &mut lines {
        if line.trim_start().starts_with(&needle) {
            *line = format!("{}={}", key, value);
            found = true;
            break;
        }
    }
    if !found {
        lines.push(format!("{}={}", key, value));
    }

    // 统一换行，末尾保留空行
    let mut content = lines.join("\n");
    content.push('\n');

    std::fs::write(&env_path, &content)
        .map_err(|e| format!("Failed to write .env: {}", e))
}

pub(crate) fn which_exists(cmd: &str) -> bool {
    command("which")
        .arg(cmd)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[allow(dead_code)]
pub(crate) fn show_error_dialog(message: &str) {
    log::error!("{}", message);
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

pub(crate) fn default_shell() -> &'static str {
    if which_exists("zsh") { "zsh" } else { "bash" }
}

pub(crate) fn path_with_local_bin() -> String {
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

pub(crate) fn strip_ansi(s: &str) -> String {
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

pub(crate) fn kill_hermes_process() {
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
        let _ = command("powershell")
            .args(["-NoProfile", "-Command",
                "Get-Process python,python3 -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*hermes*' } | Stop-Process -Force"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .output();
    }
}

pub(crate) fn check_hermes_process() -> bool {
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

pub(crate) fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
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

pub(crate) fn serde_yaml_to_json(yaml_str: &str) -> serde_json::Value {
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

pub(crate) fn tool_label(tool_name: &str) -> &str {
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

pub(crate) fn hermes_config_set(key: &str, value: &str) -> Result<(), String> {
    let mut cmd = hermes_command();
    cmd.args(&["config", "set", key, value])
        .env("HERMES_HOME", hermes_home_dir());

    #[cfg(unix)]
    {
        let hermes_tmp = format!("{}/.hermes", home_dir());
        let _ = std::fs::create_dir_all(&hermes_tmp);
        cmd.env("TMPDIR", &hermes_tmp);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("hermes config set failed: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

pub(crate) fn sync_single_env_key(_app: &tauri::AppHandle, env_key: &str, env_value: &str) {
    match hermes_config_set(env_key, env_value) {
        Ok(_) => log::info!("[sync_env] Written {} via hermes config set", env_key),
        Err(e) => log::warn!("[sync_env] Failed to write {} via hermes config set: {}", env_key, e),
    }
}

pub(crate) async fn sync_api_keys_to_hermes_env(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => {
            log::warn!("Cannot get database connection, skipping API key sync");
            return;
        }
    };

    let providers: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT api_key_env, api_key FROM providers WHERE api_key != '' AND api_key_env != ''"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        log::warn!("Failed to query providers: {}", e);
        Vec::new()
    });

    let mut synced = 0u32;
    for (key_env, api_key) in &providers {
        let decrypted_key = decrypt_api_key(api_key);
        match write_env_value(key_env, &decrypted_key) {
            Ok(_) => synced += 1,
            Err(e) => log::warn!("Failed to sync {} via write_env_value: {}", key_env, e),
        }
    }

    let hermes_api_key: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'hermes_api_key'"
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .filter(|v: &String| !v.is_empty());

    if let Some(hak) = &hermes_api_key {
        // 直接写入 .env，避免通过 hermes config set 落入 config.yaml
        // hermes CLI 的 set_config_value 路由规则遗漏了 _KEY 后缀的 key，
        // 导致 API_SERVER_KEY 落入 config.yaml 而非 .env
        match write_env_value("API_SERVER_KEY", hak) {
            Ok(_) => synced += 1,
            Err(e) => log::warn!("Failed to sync API_SERVER_KEY via write_env_value: {}", e),
        }
    }

    if synced > 0 {
        log::info!("Synced {} API keys to hermes .env", synced);
    }
}

pub(crate) async fn sync_providers_to_hermes_config(app: &tauri::AppHandle) {
    let pool = match app.try_state::<AppState>() {
        Some(s) => s.db_pool.clone(),
        None => {
            log::warn!("Cannot get database connection, skipping providers sync");
            return;
        }
    };

    let providers: Vec<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT value, base_url, api_key_env, name FROM providers WHERE is_builtin = 0 AND value != ''"
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_else(|e| {
        log::warn!("Failed to query custom providers: {}", e);
        Vec::new()
    });

    let mut synced = 0u32;
    for (provider_value, base_url, api_key_env, name) in &providers {
        let slug = provider_value.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-', "_");
        if slug.is_empty() {
            continue;
        }

        if let Err(e) = hermes_config_set(&format!("providers.{}.name", slug), name) {
            log::warn!("Failed to set providers.{}.name: {}", slug, e);
            continue;
        }
        if !base_url.is_empty() {
            let _ = hermes_config_set(&format!("providers.{}.api", slug), base_url);
        }
        if !api_key_env.is_empty() {
            let _ = hermes_config_set(&format!("providers.{}.key_env", slug), api_key_env);
        }
        let _ = hermes_config_set(&format!("providers.{}.transport", slug), "openai_chat");

        synced += 1;
    }

    if synced > 0 {
        log::info!("Synced {} custom providers to hermes config.yaml", synced);
    }
}

pub(crate) async fn sync_hermes_providers_to_db(app: &tauri::AppHandle) {
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
                "INSERT INTO providers (id, name, value, base_url, api_key_env, icon, is_builtin, sort_order, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, '', 1, ?, ?, ?)"
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

    let icon_map: &[(&str, &str)] = &[
        ("alibaba", "alibaba"),
        ("alibaba-coding-plan", "alibaba"),
        ("huggingface", "huggingface"),
        ("vercel", "vercel"),
        ("github-copilot", "githubcopilot"),
        ("xiaomi", "xiaomi"),
        ("tencent-tokenhub", "tencent"),
        ("xai", "xai"),
        ("lmstudio", "lmstudio"),
        ("stepfun", "stepfun"),
        ("novita-ai", "novita"),
        ("opencode", "opencode"),
        ("opencode-go", "opencode"),
        ("kilo", "kilogateway"),
        ("ollama-cloud", "ollamacloud"),
        ("kimi-for-coding", "kimi"),
    ];
    for (value, icon) in icon_map {
        let _ = sqlx::query("UPDATE providers SET icon = ? WHERE value = ? AND icon = ''")
            .bind(icon)
            .bind(value)
            .execute(&pool)
            .await;
    }

    log::info!("Synced {} Hermes providers to local database", providers.len());
}

pub struct RunHandleInner {
    pub run_id: String,
    pub cancelled: AtomicBool,
}

pub type RunHandle = Arc<RunHandleInner>;
pub type CancelMap = Arc<Mutex<HashMap<String, RunHandle>>>;

pub struct AppState {
    pub db_pool: SqlitePool,
    pub local_embedding: crate::services::local_embedding::LocalEmbeddingState,
    pub file_watcher: crate::services::file_watcher::FileWatcherState,
    pub cancel_map: CancelMap,
}

pub(crate) struct AgentProcess(pub(crate) Mutex<Option<std::process::Child>>);

pub(crate) fn get_ssl_cert_file() -> Option<String> {
    let venv_python = match hermes_venv_python() {
        Ok(p) => p,
        Err(_) => {
            #[cfg(windows)]
            { "python".to_string() }
            #[cfg(not(windows))]
            { "python3".to_string() }
        }
    };

    let output = command(&venv_python)
        .args(["-c", "import certifi; print(certifi.where())"])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()?;

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !path.is_empty() && std::path::Path::new(&path).exists() {
        return Some(path);
    }
    None
}

#[derive(Serialize, Clone)]
pub(crate) struct ChatStreamEvent {
    pub chunk: String,
    pub done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_label: Option<String>,
}

#[derive(Serialize, Clone)]
pub(crate) struct InstallProgress {
    pub line: String,
    pub done: bool,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<String>,
}

pub(crate) fn ensure_gateway_config(app: &AppHandle) {
    let hermes_home = hermes_home_dir();
    let config_path = format!("{}{}config.yaml", hermes_home, std::path::MAIN_SEPARATOR);

    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create hermes home directory: {}", e);
        return;
    }

    let env_content = std::fs::read_to_string(format!("{}{}.env", hermes_home, std::path::MAIN_SEPARATOR)).unwrap_or_default();
    if !env_content.contains("GATEWAY_ALLOW_ALL_USERS") {
        match hermes_config_set("GATEWAY_ALLOW_ALL_USERS", "true") {
            Ok(_) => {
                let _ = app.emit("install-progress", InstallProgress {
                    line: "Gateway API access configured".to_string(), done: false, success: false, progress: Some(85), step: Some("config".to_string()),
                });
            }
            Err(e) => log::warn!("Failed to set GATEWAY_ALLOW_ALL_USERS via hermes config set: {}", e),
        }
    }

    let config_content = std::fs::read_to_string(&config_path).unwrap_or_default();
    if !config_content.contains("api_server") {
        match hermes_config_set("platforms.api_server.port", "8642") {
            Ok(_) => {
                let _ = hermes_config_set("platforms.api_server.enabled", "true");
                let _ = app.emit("install-progress", InstallProgress {
                    line: "Local API Server enabled (port 8642)".to_string(), done: false, success: false, progress: Some(88), step: Some("config".to_string()),
                });
            }
            Err(e) => log::warn!("Failed to set api_server config via hermes config set: {}", e),
        }
    }

    if !config_content.contains("max_iterations") {
        match hermes_config_set("agent.max_iterations", "10") {
            Ok(_) => {
                let _ = hermes_config_set("agent.gateway_timeout", "300");
                let _ = hermes_config_set("agent.gateway_notify_interval", "0");
                let _ = app.emit("install-progress", InstallProgress {
                    line: "Gateway agent max_iterations=10 configured".to_string(), done: false, success: false, progress: Some(90), step: Some("config".to_string()),
                });
            }
            Err(e) => log::warn!("Failed to set agent config via hermes config set: {}", e),
        }
    }
}

#[cfg(target_os = "windows")]
pub(crate) fn is_windowsapps_stub(path: &str) -> bool {
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
pub(crate) fn validate_python_version(path: &str) -> Option<String> {
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
pub(crate) fn find_windows_python() -> Option<String> {
    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    if let Ok(output) = command("py").args(["-0p"]).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut candidates: Vec<(u32, u32, String)> = Vec::new();
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
                    if let Some((major, minor, validated)) = validate_and_get_version(path) {
                        candidates.push((major, minor, validated));
                    }
                }
            }
            candidates.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
            if let Some((_, _, path)) = candidates.into_iter().next() {
                log::info!("[install] Found Python via py -0p: {}", path);
                return Some(path);
            }
        }
    }

    let python_dir = format!("{}\\Programs\\Python", local_appdata);
    if let Some(py) = scan_python_dir(&python_dir) {
        log::info!("[install] Found Python via Programs\\Python scan: {}", py);
        return Some(py);
    }

    let uv_python_dir = format!("{}\\AppData\\Local\\uv\\python", user_profile);
    if let Some(py) = scan_python_dir(&uv_python_dir) {
        log::info!("[install] Found Python via uv directory scan: {}", py);
        return Some(py);
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
                                let exe_path = windows_which(cmd);
                                let path = exe_path.as_deref().unwrap_or(cmd);
                                if !is_windowsapps_stub(path) {
                                    if let Some(validated) = validate_python_version(path) {
                                        log::info!("[install] Found Python via PATH: {}", validated);
                                        return Some(validated);
                                    }
                                }
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

#[cfg(target_os = "windows")]
pub(crate) fn scan_python_dir(base_dir: &str) -> Option<String> {
    let entries = match std::fs::read_dir(base_dir) {
        Ok(e) => e,
        Err(_) => return None,
    };
    let mut candidates: Vec<(u32, u32, String)> = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let python_exe = entry.path().join("python.exe");
        if !python_exe.exists() {
            continue;
        }
        let path_str = python_exe.to_string_lossy().to_string();
        if is_windowsapps_stub(&path_str) {
            continue;
        }
        if let Some((major, minor, validated)) = validate_and_get_version(&path_str) {
            candidates.push((major, minor, validated));
        }
    }
    candidates.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.0.cmp(&a.0)));
    candidates.into_iter().next().map(|(_, _, path)| path)
}

#[cfg(target_os = "windows")]
pub(crate) fn validate_and_get_version(path: &str) -> Option<(u32, u32, String)> {
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
                return Some((major, minor, path.to_string()));
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub(crate) fn windows_which(cmd: &str) -> Option<String> {
    if let Ok(output) = command("where").arg(cmd).output() {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let line = line.trim();
                if !line.is_empty() && std::path::Path::new(line).exists() {
                    return Some(line.to_string());
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
pub(crate) fn try_install_python_via_uv(app: &AppHandle) -> Option<String> {
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

    let uv_exe = match uv_exe {
        Some(e) => e,
        None => {
            let _ = app.emit("install-progress", InstallProgress {
                line: "Installing uv package manager...".to_string(), done: false, success: false, progress: Some(15), step: Some("uv".to_string()),
            });
            let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
            let uv_target = format!("{}\\.local\\bin\\uv.exe", user_profile);
            if !std::path::Path::new(&uv_target).exists() {
                let powershell_install = command("powershell")
                    .args(["-ExecutionPolicy", "ByPass", "-NoProfile", "-Command",
                        "irm https://astral.sh/uv/install.ps1 | iex"])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output();
                match powershell_install {
                    Ok(output) => {
                        if !output.status.success() {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            log::warn!("[install] uv install failed: {}", stderr.trim());
                            return None;
                        }
                    }
                    Err(e) => {
                        log::warn!("[install] uv install error: {}", e);
                        return None;
                    }
                }
            }
            if std::path::Path::new(&uv_target).exists() {
                uv_target
            } else {
                let cargo_target = format!("{}\\.cargo\\bin\\uv.exe", user_profile);
                if std::path::Path::new(&cargo_target).exists() {
                    cargo_target
                } else {
                    log::warn!("[install] uv installed but executable not found");
                    return None;
                }
            }
        }
    };

    let _ = app.emit("install-progress", InstallProgress {
        line: "Installing Python 3.11 via uv...".to_string(), done: false, success: false, progress: Some(22), step: Some("python".to_string()),
    });
    let _ = command(&uv_exe).args(["python", "install", "3.11"]).output();
    let _ = command(&uv_exe).args(["python", "install", "3.12"]).output();

    if let Some(py) = find_windows_python() {
        return Some(py);
    }

    for ver in &["3.12", "3.11"] {
        if let Ok(output) = command(&uv_exe).args(["python", "find", ver]).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    if let Some(validated) = validate_python_version(&path) {
                        log::info!("[install] Found Python via uv python find: {}", validated);
                        return Some(validated);
                    }
                }
            }
        }
    }

    None
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn find_unix_python() -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let local_bin = format!("{}/.local/bin", home);
    let current_path = std::env::var("PATH").unwrap_or_default();
    let extended_path = if !current_path.contains(&local_bin) {
        format!("{}:{}", local_bin, current_path)
    } else {
        current_path
    };

    for cmd in &["python3.13", "python3.12", "python3.11", "python3", "python"] {
        if let Ok(output) = command(cmd)
            .arg("--version")
            .env("PATH", &extended_path)
            .output()
        {
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
                                if let Some(full) = unix_which_with_path(cmd, &extended_path) {
                                    log::info!("[install] Found Python via PATH: {} -> {}", full, combined.trim());
                                    return Some(full);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

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

    log::warn!("[install] No Python 3.11+ found on system");
    None
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn verify_python_version(path: &str) -> bool {
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
pub(crate) fn unix_which(cmd: &str) -> Option<String> {
    let path_env = std::env::var("PATH").unwrap_or_default();
    unix_which_with_path(cmd, &path_env)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn unix_which_with_path(cmd: &str, path_env: &str) -> Option<String> {
    if let Ok(output) = command("which")
        .arg(cmd)
        .env("PATH", path_env)
        .output()
    {
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
pub(crate) fn try_install_python_via_uv(app: &AppHandle) -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let uv_exe = {
        let candidates = [
            format!("{}/.local/bin/uv", home),
            format!("{}/.cargo/bin/uv", home),
        ];
        let mut found = None;
        for p in &candidates {
            if std::path::Path::new(p).exists() {
                found = Some(p.clone());
                break;
            }
        }
        if found.is_none() {
            if let Ok(output) = command("uv").arg("--version").output() {
                if output.status.success() {
                    found = Some("uv".to_string());
                }
            }
        }
        found
    };

    let uv_exe = match uv_exe {
        Some(e) => e,
        None => {
            let _ = app.emit("install-progress", InstallProgress {
                line: "Installing uv package manager...".to_string(), done: false, success: false, progress: Some(15), step: Some("uv".to_string()),
            });
            let uv_target = format!("{}/.local/bin/uv", home);
            if !std::path::Path::new(&uv_target).exists() {
                let install_cmd = command("sh")
                    .args(["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .output();
                match install_cmd {
                    Ok(output) => {
                        if !output.status.success() {
                            let stderr = String::from_utf8_lossy(&output.stderr);
                            log::warn!("[install] uv install failed: {}", stderr.trim());
                            return None;
                        }
                    }
                    Err(e) => {
                        log::warn!("[install] uv install error: {}", e);
                        return None;
                    }
                }
            }
            if std::path::Path::new(&uv_target).exists() {
                uv_target
            } else {
                let cargo_target = format!("{}/.cargo/bin/uv", home);
                if std::path::Path::new(&cargo_target).exists() {
                    cargo_target
                } else {
                    log::warn!("[install] uv installed but executable not found");
                    return None;
                }
            }
        }
    };

    let _ = app.emit("install-progress", InstallProgress {
        line: "Installing Python 3.12 via uv...".to_string(), done: false, success: false, progress: Some(22), step: Some("python".to_string()),
    });
    let install_312 = command(&uv_exe).args(["python", "install", "3.12"]).output();
    if let Ok(ref output) = install_312 {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("[install] uv python install 3.12 failed: {}", stderr.trim());
        }
    }
    let install_311 = command(&uv_exe).args(["python", "install", "3.11"]).output();
    if let Ok(ref output) = install_311 {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("[install] uv python install 3.11 failed: {}", stderr.trim());
        }
    }

    for ver in &["3.12", "3.11"] {
        if let Ok(output) = command(&uv_exe).args(["python", "find", ver]).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    if verify_python_version(&path) {
                        log::info!("[install] Found Python via uv python find: {}", path);
                        return Some(path);
                    }
                }
            }
        }
    }

    if let Some(py) = find_unix_python() {
        return Some(py);
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip_ansi_no_codes() {
        assert_eq!(strip_ansi("hello world"), "hello world");
    }

    #[test]
    fn test_strip_ansi_color_code() {
        assert_eq!(strip_ansi("\x1b[32mgreen\x1b[0m"), "green");
    }

    #[test]
    fn test_strip_ansi_multiple_codes() {
        assert_eq!(
            strip_ansi("\x1b[1;31merror\x1b[0m: \x1b[33mwarning\x1b[0m"),
            "error: warning"
        );
    }

    #[test]
    fn test_strip_ansi_empty_string() {
        assert_eq!(strip_ansi(""), "");
    }

    #[test]
    fn test_parse_yaml_value_string() {
        let val = parse_yaml_value("hello");
        assert_eq!(val, serde_json::Value::String("hello".to_string()));
    }

    #[test]
    fn test_parse_yaml_value_quoted_string() {
        let val = parse_yaml_value("'hello world'");
        assert_eq!(val, serde_json::Value::String("hello world".to_string()));
    }

    #[test]
    fn test_parse_yaml_value_double_quoted() {
        let val = parse_yaml_value("\"test\"");
        assert_eq!(val, serde_json::Value::String("test".to_string()));
    }

    #[test]
    fn test_parse_yaml_value_bool_true() {
        let val = parse_yaml_value("true");
        assert_eq!(val, serde_json::Value::Bool(true));
    }

    #[test]
    fn test_parse_yaml_value_bool_yes() {
        let val = parse_yaml_value("yes");
        assert_eq!(val, serde_json::Value::Bool(true));
    }

    #[test]
    fn test_parse_yaml_value_bool_false() {
        let val = parse_yaml_value("false");
        assert_eq!(val, serde_json::Value::Bool(false));
    }

    #[test]
    fn test_parse_yaml_value_bool_no() {
        let val = parse_yaml_value("no");
        assert_eq!(val, serde_json::Value::Bool(false));
    }

    #[test]
    fn test_parse_yaml_value_integer() {
        let val = parse_yaml_value("42");
        assert_eq!(val, serde_json::Value::Number(serde_json::Number::from(42)));
    }

    #[test]
    fn test_parse_yaml_value_float() {
        let val = parse_yaml_value("3.14");
        assert!(val.is_number());
    }

    #[test]
    fn test_parse_yaml_value_empty() {
        let val = parse_yaml_value("");
        assert_eq!(val, serde_json::Value::String(String::new()));
    }

    #[test]
    fn test_parse_yaml_value_empty_quotes() {
        let val = parse_yaml_value("''");
        assert_eq!(val, serde_json::Value::String(String::new()));
    }

    #[test]
    fn test_serde_yaml_to_json_simple() {
        let yaml = "name: test\nport: 8080\n";
        let json = serde_yaml_to_json(yaml);
        assert_eq!(json["name"], serde_json::Value::String("test".to_string()));
        assert_eq!(json["port"], serde_json::Value::Number(serde_json::Number::from(8080)));
    }

    #[test]
    fn test_serde_yaml_to_json_nested() {
        let yaml = "server:\n  host: localhost\n  port: 3000\n";
        let json = serde_yaml_to_json(yaml);
        assert!(json["server"].is_object());
        assert_eq!(json["server"]["host"], serde_json::Value::String("localhost".to_string()));
        assert_eq!(json["server"]["port"], serde_json::Value::Number(serde_json::Number::from(3000)));
    }

    #[test]
    fn test_serde_yaml_to_json_skip_comments() {
        let yaml = "# comment\nname: test\n# another comment\n";
        let json = serde_yaml_to_json(yaml);
        assert_eq!(json["name"], serde_json::Value::String("test".to_string()));
        assert!(json.get("# comment").is_none());
    }

    #[test]
    fn test_serde_yaml_to_json_empty() {
        let json = serde_yaml_to_json("");
        assert!(json.as_object().unwrap().is_empty());
    }

    #[test]
    fn test_tool_label_known() {
        assert_eq!(tool_label("read_file"), "Reading file...");
        assert_eq!(tool_label("write_file"), "Writing file...");
        assert_eq!(tool_label("execute_code"), "Executing code...");
        assert_eq!(tool_label("web_search"), "Searching web...");
        assert_eq!(tool_label("terminal"), "Executing command...");
        assert_eq!(tool_label("bash"), "Executing command...");
    }

    #[test]
    fn test_tool_label_unknown() {
        assert_eq!(tool_label("unknown_tool"), "Processing...");
    }

    #[test]
    fn test_home_dir_not_empty() {
        let home = home_dir();
        assert!(!home.is_empty());
    }

    #[test]
    fn test_copy_dir_recursive() {
        let src = std::env::temp_dir().join("hermes_test_src");
        let dst = std::env::temp_dir().join("hermes_test_dst");

        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&dst);

        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("test.txt"), "hello").unwrap();
        std::fs::create_dir_all(src.join("subdir")).unwrap();
        std::fs::write(src.join("subdir/nested.txt"), "world").unwrap();

        copy_dir_recursive(&src, &dst).unwrap();

        assert!(dst.join("test.txt").exists());
        assert!(dst.join("subdir/nested.txt").exists());
        assert_eq!(std::fs::read_to_string(dst.join("test.txt")).unwrap(), "hello");

        let _ = std::fs::remove_dir_all(&src);
        let _ = std::fs::remove_dir_all(&dst);
    }

    #[test]
    fn test_copy_dir_recursive_nonexistent_src() {
        let dst = std::env::temp_dir().join("hermes_test_dst2");
        let result = copy_dir_recursive(
            std::path::Path::new("/nonexistent/path"),
            dst.as_path(),
        );
        assert!(result.is_err());
    }
}

/// Debounced event emitter: aggregates data change types per project and emits after 500ms
pub(crate) struct DebouncedEmitter {
    pending: Mutex<HashMap<String, (HashSet<String>, bool)>>,
}

impl DebouncedEmitter {
    pub(crate) fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
        }
    }

    /// Add a data change type to the pending queue for a project, then schedule a flush after 500ms
    pub(crate) fn add_change(&self, app: &AppHandle, project_id: &str, data_type: &str) {
        let should_schedule = {
            let mut pending = match self.pending.lock() {
                Ok(p) => p,
                Err(e) => {
                    log::error!("Failed to acquire pending lock: {}", e);
                    return;
                }
            };
            let (changes, scheduled) = pending
                .entry(project_id.to_string())
                .or_insert_with(|| (HashSet::new(), false));
            changes.insert(data_type.to_string());
            if *scheduled {
                false
            } else {
                *scheduled = true;
                true
            }
        };
        if should_schedule {
            let app_clone = app.clone();
            let project_id_clone = project_id.to_string();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let changes = {
                    let emitter = DEBOUNCED_EMITTER.get_or_init(DebouncedEmitter::new);
                    let mut pending = emitter.pending.lock().unwrap();
                    if let Some((chs, scheduled)) = pending.get_mut(&project_id_clone) {
                        *scheduled = false;
                        if chs.is_empty() {
                            pending.remove(&project_id_clone);
                            HashSet::new()
                        } else {
                            std::mem::take(chs)
                        }
                    } else {
                        HashSet::new()
                    }
                };
                if !changes.is_empty() {
                    let changes_vec: Vec<String> = changes.into_iter().collect();
                    let _ = app_clone.emit("project_data_changed", serde_json::json!({
                        "projectId": project_id_clone,
                        "changes": changes_vec,
                    }));
                }
            });
        }
    }
}

use std::sync::OnceLock;
pub(crate) static DEBOUNCED_EMITTER: OnceLock<DebouncedEmitter> = OnceLock::new();

/// Get the global DebouncedEmitter instance
pub(crate) fn debounced_emit(app: &AppHandle, project_id: &str, data_type: &str) {
    let emitter = DEBOUNCED_EMITTER.get_or_init(DebouncedEmitter::new);
    emitter.add_change(app, project_id, data_type);
}

fn shared_hermes_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_max_idle_per_host(5)
            .pool_idle_timeout(Duration::from_secs(90))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to build shared reqwest client")
    })
}

pub(crate) async fn call_hermes_api_streaming(
    api_base: &str,
    api_key: &str,
    project_id: &str,
    body: serde_json::Value,
) -> Result<reqwest::Response, String> {
    call_hermes_api_inner(api_base, api_key, project_id, body, true).await
}

pub(crate) async fn call_hermes_api_non_streaming(
    api_base: &str,
    api_key: &str,
    project_id: &str,
    body: serde_json::Value,
) -> Result<reqwest::Response, String> {
    call_hermes_api_inner(api_base, api_key, project_id, body, false).await
}

async fn call_hermes_api_inner(
    api_base: &str,
    api_key: &str,
    project_id: &str,
    body: serde_json::Value,
    use_stream: bool,
) -> Result<reqwest::Response, String> {
    let mut body = body;
    body["stream"] = serde_json::Value::Bool(use_stream);
    let client = shared_hermes_client();
    let max_retries: u32 = 3;
    let mut last_err = String::new();

    for attempt in 1..=max_retries {
        let mut req = client
            .post(format!("{}/chat/completions", api_base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json");
        if !project_id.is_empty() {
            req = req.header("X-Hermes-Session-Key", format!("project-{}", project_id));
        }
        let result = req.json(&body).send().await;

        match result {
            Ok(response) => {
                if response.status().is_server_error() && attempt < max_retries {
                    let delay = Duration::from_millis(500 * 2u64.pow(attempt - 1));
                    log::warn!("call_hermes_api: server error {} on attempt {}/{}, retrying in {:?}",
                        response.status(), attempt, max_retries, delay);
                    last_err = format!("server error: {}", response.status());
                    tokio::time::sleep(delay).await;
                    continue;
                }
                return Ok(response);
            }
            Err(e) => {
                last_err = e.to_string();
                let is_retryable = e.is_timeout() || e.is_connect();
                if attempt < max_retries && is_retryable {
                    let delay = Duration::from_millis(500 * 2u64.pow(attempt - 1));
                    log::warn!("call_hermes_api: {} on attempt {}/{}, retrying in {:?}",
                        last_err, attempt, max_retries, delay);
                    tokio::time::sleep(delay).await;
                    continue;
                }
                return Err(format!("call_hermes_api failed after {} retries: {}", max_retries, last_err));
            }
        }
    }

    Err(format!("call_hermes_api failed after {} retries: {}", max_retries, last_err))
}

pub(crate) async fn start_hermes_run(
    api_base: &str,
    api_key: &str,
    project_id: &str,
    body: serde_json::Value,
) -> Result<String, String> {
    let client = shared_hermes_client();
    let run_base = api_base.trim_end_matches("/v1");

    let messages = body["messages"].as_array().cloned().unwrap_or_default();
    let mut system_prompt_parts: Vec<String> = Vec::new();
    let mut conversation_history: Vec<serde_json::Value> = Vec::new();
    let mut user_message = String::new();

    for msg in &messages {
        let role = msg["role"].as_str().unwrap_or("");
        let content = msg["content"].as_str().unwrap_or("");
        match role {
            "system" => system_prompt_parts.push(content.to_string()),
            "user" => {
                if !content.is_empty() {
                    user_message = content.to_string();
                }
                conversation_history.push(serde_json::json!({"role": "user", "content": content}));
            }
            "assistant" => {
                conversation_history.push(serde_json::json!({"role": "assistant", "content": content}));
            }
            _ => {}
        }
    }
    if !user_message.is_empty() && !conversation_history.is_empty() {
        if let Some(last) = conversation_history.last() {
            if last["role"].as_str() == Some("user") && last["content"].as_str() == Some(&user_message) {
                conversation_history.pop();
            }
        }
    }

    let system_prompt = system_prompt_parts.join("\n\n");

    let mut run_body = serde_json::json!({
        "input": user_message,
    });
    if !system_prompt.is_empty() {
        run_body["instructions"] = serde_json::json!(system_prompt);
    }
    if !conversation_history.is_empty() {
        run_body["conversation_history"] = serde_json::json!(conversation_history);
    }
    if let Some(m) = body.get("hermes_model") {
        run_body["hermes_model"] = m.clone();
    }
    if let Some(p) = body.get("hermes_provider") {
        run_body["hermes_provider"] = p.clone();
    }
    if let Some(sid) = body.get("hermes_session_id") {
        run_body["session_id"] = sid.clone();
    }

    let mut req = client
        .post(format!("{}/v1/runs", run_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json");
    if !project_id.is_empty() {
        req = req.header("X-Hermes-Session-Key", format!("project-{}", project_id));
    }

    let response = req.json(&run_body).send().await
        .map_err(|e| format!("Failed to start run: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Run start failed ({}): {}", status, text));
    }

    let resp_json: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse run response: {}", e))?;

    resp_json["run_id"].as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No run_id in response: {:?}", resp_json))
}

pub(crate) async fn stop_hermes_run(
    api_base: &str,
    api_key: &str,
    run_id: &str,
) -> Result<(), String> {
    let client = shared_hermes_client();
    let run_base = api_base.trim_end_matches("/v1");

    let response = client
        .post(format!("{}/v1/runs/{}/stop", run_base, run_id))
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("Failed to stop run: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        log::warn!("[stop_hermes_run] stop returned {}: {}", status, text);
    }

    Ok(())
}
