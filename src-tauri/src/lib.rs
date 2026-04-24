use serde::Serialize;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, State};

struct AgentProcess(Mutex<Option<std::process::Child>>);

#[derive(Serialize)]
struct ChatResponse {
    content: String,
    thinking: Option<String>,
}

/// 重启 Hermes Agent
#[tauri::command]
fn restart_hermes(state: State<'_, AgentProcess>) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }

    let child = Command::new("hermes")
        .arg("--acp")
        .arg("--stdio")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    *guard = Some(child);
    Ok("Hermes Agent 已重启".to_string())
}

/// 与 Hermes Agent 对话
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

/// 打开日志目录
#[tauri::command]
fn open_log_dir(_app: AppHandle) -> Result<(), String> {
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
        .setup(|_app| {
            log::info!("Hermes Desktop 启动");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            restart_hermes,
            chat_with_hermes,
            open_log_dir,
        ])
        .run(tauri::generate_context!())
        .expect("Hermes Desktop 启动失败");
}
