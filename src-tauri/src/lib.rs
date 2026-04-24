use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ── 状态管理 ──
struct AgentProcess(Mutex<Option<tokio::process::Child>>);

#[derive(Serialize)]
struct ChatResponse {
    content: String,
    thinking: Option<String>,
}

// ── Rust 命令 ──

/// 重启 Hermes Agent
#[tauri::command]
async fn restart_hermes(state: State<'_, AgentProcess>) -> Result<String, String> {
    // 先杀掉现有进程
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }
    }

    // 启动新进程
    let child = Command::new("hermes")
        .arg("--acp")
        .arg("--stdio")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);

    Ok("Hermes Agent 已重启".to_string())
}

/// 与 Hermes Agent 对话
#[tauri::command]
async fn chat_with_hermes(
    message: String,
    state: State<'_, AgentProcess>,
) -> Result<ChatResponse, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // 如果没有运行中的进程，先启动
    if guard.is_none() {
        let child = Command::new("hermes")
            .arg("--acp")
            .arg("--stdio")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("启动 hermes 失败: {}", e))?;
        *guard = Some(child);
    }

    let child = guard.as_mut().ok_or("Agent 进程未运行")?;
    let stdout = child.stdout.as_mut().ok_or("无法获取 stdout")?;

    let mut reader = BufReader::new(stdout).lines();
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "1",
        "method": "chat",
        "params": { "message": message }
    });

    // 发给 hermes stdin
    let mut child = Command::new("hermes")
        .arg("--acp")
        .arg("--stdio")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 hermes 失败: {}", e))?;

    let stdin = child.stdin.as_mut().ok_or("无法获取 stdin")?;
    use tokio::io::AsyncWriteExt;
    stdin
        .write_all(format!("{}\n", request).as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    // 读取响应
    let mut resp_lines = Vec::new();
    let mut reader = BufReader::new(child.stdout.take().unwrap()).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        resp_lines.push(line);
        if line.contains("\"result\"") || line.contains("\"error\"") {
            break;
        }
    }

    let resp_text = resp_lines.join("\n");
    let resp: serde_json::Value =
        serde_json::from_str(&resp_text).unwrap_or(serde_json::json!({
            "content": resp_text,
            "thinking": null
        }));

    Ok(ChatResponse {
        content: resp["content"].as_str().unwrap_or("").to_string(),
        thinking: resp["thinking"].as_str().map(|s| s.to_string()),
    })
}

/// 打开日志目录
#[tauri::command]
async fn open_log_dir(app: AppHandle) -> Result<(), String> {
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

// ── 入口点 ──
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_context_menu::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentProcess(Mutex::new(None)))
        .setup(|app| {
            // avatar 窗口已由 tauri.conf.json 定义，默认可见
            // main 窗口通过 JS 按需创建
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
