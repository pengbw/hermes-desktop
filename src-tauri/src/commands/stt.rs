use std::process::Stdio;
use tauri::{Emitter, Manager};

use crate::commands::helpers::{command, InstallProgress};

#[cfg(not(target_os = "windows"))]
use crate::commands::helpers::home_dir;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SttAvailableResult {
    pub available: bool,
    pub python_path: Option<String>,
    pub error: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeResult {
    pub success: bool,
    pub text: String,
    pub error: Option<String>,
    pub audio_path: Option<String>,
    pub audio_duration: Option<f64>,
}

fn find_python() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{}\\hermes\\hermes-agent\\venv\\Scripts\\python.exe", local_appdata),
            format!("{}\\hermes\\hermes-agent\\.venv\\Scripts\\python.exe", local_appdata),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return Some(path.clone());
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = home_dir();
        let candidates = [
            format!("{}/.hermes/hermes-agent/venv/bin/python3", home),
            format!("{}/.hermes/hermes-agent/.venv/bin/python3", home),
            format!("{}/.hermes/hermes-agent/venv/bin/python", home),
            format!("{}/.hermes/hermes-agent/.venv/bin/python", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/venv/bin/python3", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/.venv/bin/python3", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/venv/bin/python", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/.venv/bin/python", home),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return Some(path.clone());
            }
        }
        if let Ok(output) = command("which").arg("python3").output() {
            if output.status.success() {
                let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !p.is_empty() {
                    return Some(p);
                }
            }
        }
    }
    None
}

fn check_faster_whisper_installed(python: &str) -> bool {
    let output = command(python)
        .args(["-c", "import faster_whisper; print(faster_whisper.__version__)"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output();

    match output {
        Ok(o) => o.status.success(),
        Err(_) => false,
    }
}

const WHISPER_SCRIPT: &str = r#"
import sys
import json
import os

def eprint(msg):
    print(json.dumps({"success": False, "text": "", "error": msg, "progress": msg}), flush=True)

try:
    from faster_whisper import WhisperModel
    audio_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

    model_dir = os.path.join(os.path.expanduser("~"), ".hermes", "whisper-models", "base")
    os.makedirs(model_dir, exist_ok=True)

    if not os.path.exists(os.path.join(model_dir, "model.bin")):
        print(json.dumps({"success": False, "text": "", "error": "", "progress": "downloading_model"}), flush=True)
        model = WhisperModel("base", device="cpu", compute_type="int8", download_root=model_dir)
    else:
        print(json.dumps({"success": False, "text": "", "error": "", "progress": "loading_model"}), flush=True)
        model = WhisperModel(model_dir, device="cpu", compute_type="int8")

    print(json.dumps({"success": False, "text": "", "error": "", "progress": "transcribing"}), flush=True)
    segments, info = model.transcribe(audio_path, language=lang, beam_size=1, best_of=1)
    text = "".join(segment.text for segment in segments).strip()
    print(json.dumps({"success": True, "text": text, "error": "", "progress": "done"}), flush=True)
except Exception as e:
    eprint(str(e))
"#;

#[tauri::command]
pub async fn check_stt_available() -> Result<SttAvailableResult, String> {
    match find_python() {
        Some(python) => {
            let installed = check_faster_whisper_installed(&python);
            Ok(SttAvailableResult {
                available: installed,
                python_path: Some(python),
                error: if installed {
                    None
                } else {
                    Some("faster-whisper not installed".to_string())
                },
            })
        }
        None => Ok(SttAvailableResult {
            available: false,
            python_path: None,
            error: Some("Python not found in Hermes Agent venv".to_string()),
        }),
    }
}

#[tauri::command]
pub async fn install_stt(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let python = find_python().ok_or_else(|| "Python not found in Hermes Agent venv".to_string())?;

    let _ = app.emit("stt-install-progress", InstallProgress {
        line: "正在安装语音识别组件 (faster-whisper + ctranslate2)...\n首次安装需下载约 500MB，请耐心等待".to_string(),
        done: false,
        success: false,
    });

    log::info!("[stt] Installing faster-whisper via pip...");

    let child = command(&python)
        .args([
            "-m", "pip", "install", "faster-whisper",
            "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
            "--trusted-host", "pypi.tuna.tsinghua.edu.cn",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run pip: {}", e))?;

    let mut child = child;
    let stderr = child.stderr.take().unwrap();
    use std::io::{BufRead, BufReader};
    let app_clone = app.clone();
    let stderr_handle = std::thread::spawn(move || -> String {
        let reader = BufReader::new(stderr);
        let mut last_lines = Vec::new();
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let trimmed = l.trim().to_string();
                    if !trimmed.is_empty() {
                        last_lines.push(trimmed.clone());
                        if last_lines.len() > 5 {
                            last_lines.remove(0);
                        }
                        let _ = app_clone.emit("stt-install-progress", InstallProgress {
                            line: trimmed,
                            done: false,
                            success: false,
                        });
                    }
                }
                Err(_) => break,
            }
        }
        last_lines.join("\n")
    });

    let status = child.wait().map_err(|e| format!("Failed to wait for pip: {}", e))?;
    let stderr_output = stderr_handle.join().unwrap_or_default();

    if !status.success() {
        let _ = app.emit("stt-install-progress", InstallProgress {
            line: "安装失败".to_string(),
            done: true,
            success: false,
        });
        return Err(format!("pip install failed: {}", stderr_output.trim()));
    }

    let _ = app.emit("stt-install-progress", InstallProgress {
        line: "正在验证安装...".to_string(),
        done: false,
        success: false,
    });

    let installed = check_faster_whisper_installed(&python);
    if !installed {
        let _ = app.emit("stt-install-progress", InstallProgress {
            line: "安装验证失败".to_string(),
            done: true,
            success: false,
        });
        return Err("faster-whisper installation verification failed".to_string());
    }

    log::info!("[stt] faster-whisper installed, pre-downloading base model...");

    let _ = app.emit("stt-install-progress", InstallProgress {
        line: "正在下载语音识别模型（约 140MB）...".to_string(),
        done: false,
        success: false,
    });

    let model_download = command(&python)
        .args(["-c", r#"import os; from faster_whisper import WhisperModel; model_dir = os.path.join(os.path.expanduser("~"), ".hermes", "whisper-models", "base"); os.makedirs(model_dir, exist_ok=True); WhisperModel("base", device="cpu", compute_type="int8", download_root=model_dir); print("model_ready")"#])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match model_download {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if stdout.contains("model_ready") {
                log::info!("[stt] Base model pre-downloaded successfully");
                let _ = app.emit("stt-install-progress", InstallProgress {
                    line: "语音识别安装完成".to_string(),
                    done: true,
                    success: true,
                });
                Ok(serde_json::json!({ "success": true }))
            } else {
                log::warn!("[stt] Model download output unexpected: {}", stdout);
                let _ = app.emit("stt-install-progress", InstallProgress {
                    line: "语音识别安装完成（模型将在首次使用时下载）".to_string(),
                    done: true,
                    success: true,
                });
                Ok(serde_json::json!({ "success": true }))
            }
        }
        _ => {
            log::warn!("[stt] Model pre-download failed, will download on first use");
            let _ = app.emit("stt-install-progress", InstallProgress {
                line: "语音识别安装完成（模型将在首次使用时下载）".to_string(),
                done: true,
                success: true,
            });
            Ok(serde_json::json!({ "success": true }))
        }
    }
}

#[tauri::command]
pub async fn transcribe_audio(
    app: tauri::AppHandle,
    audio_path: String,
    lang: Option<String>,
    keep_audio: Option<bool>,
) -> Result<TranscribeResult, String> {
    let python = match find_python() {
        Some(p) => p,
        None => {
            return Ok(TranscribeResult {
                success: false,
                text: String::new(),
                error: Some("Python not found. Please install Hermes Agent first.".to_string()),
                audio_path: None,
                audio_duration: None,
            });
        }
    };

    if !check_faster_whisper_installed(&python) {
        return Ok(TranscribeResult {
            success: false,
            text: String::new(),
            error: Some("faster-whisper not installed. Please install it from Settings.".to_string()),
            audio_path: None,
            audio_duration: None,
        });
    }

    let audio_file = std::path::Path::new(&audio_path);
    if !audio_file.exists() {
        return Ok(TranscribeResult {
            success: false,
            text: String::new(),
            error: Some(format!("Audio file not found: {}", audio_path)),
            audio_path: None,
            audio_duration: None,
        });
    }

    let should_keep = keep_audio.unwrap_or(false);
    let mut saved_audio_path: Option<String> = None;

    if should_keep {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        let voice_dir = app_data_dir.join("voice_messages");
        std::fs::create_dir_all(&voice_dir)
            .map_err(|e| format!("Failed to create voice dir: {}", e))?;

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S_%3f").to_string();
        let ext = audio_file
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("wav");
        let dest = voice_dir.join(format!("voice_{}.{}", timestamp, ext));

        if let Err(e) = std::fs::copy(&audio_path, &dest) {
            log::warn!("[stt] Failed to copy audio to voice_messages: {}", e);
        } else {
            saved_audio_path = Some(dest.to_string_lossy().to_string());
        }
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let script_dir = app_data_dir.join("stt_scripts");
    std::fs::create_dir_all(&script_dir)
        .map_err(|e| format!("Failed to create script dir: {}", e))?;

    let script_path = script_dir.join("transcribe.py");
    std::fs::write(&script_path, WHISPER_SCRIPT)
        .map_err(|e| format!("Failed to write script: {}", e))?;

    log::info!(
        "[stt] Transcribing audio: {} (lang={:?}, keep={})",
        audio_path,
        lang,
        should_keep
    );

    let mut child = command(&python)
        .arg(&script_path)
        .arg(&audio_path)
        .arg(lang.unwrap_or_default())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run whisper: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    use std::io::{BufRead, BufReader};
    let app_clone = app.clone();
    let stdout_handle = std::thread::spawn(move || -> Vec<String> {
        let reader = BufReader::new(stdout);
        let mut lines = Vec::new();
        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let trimmed = l.trim().to_string();
                    if !trimmed.is_empty() {
                        lines.push(trimmed.clone());
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&trimmed) {
                            if let Some(progress) = json.get("progress").and_then(|v| v.as_str()) {
                                let label = match progress {
                                    "downloading_model" => "正在发送...",
                                    "loading_model" => "正在发送...",
                                    "transcribing" => "正在发送...",
                                    "done" => "",
                                    _ => progress,
                                };
                                let _ = app_clone.emit("stt-transcribe-progress", InstallProgress {
                                    line: label.to_string(),
                                    done: progress == "done",
                                    success: json.get("success").and_then(|v| v.as_bool()).unwrap_or(false),
                                });
                            }
                        }
                    }
                }
                Err(_) => break,
            }
        }
        lines
    });

    let status = child.wait().map_err(|e| format!("Failed to wait for whisper: {}", e))?;
    let all_lines = stdout_handle.join().unwrap_or_default();

    if saved_audio_path.is_some() {
        let _ = std::fs::remove_file(&audio_path);
    } else {
        log::warn!("[stt] Audio was not saved to voice_messages, keeping original: {}", audio_path);
    }

    let final_audio_path = saved_audio_path.clone().or_else(|| Some(audio_path.clone()));

    if !status.success() {
        let stderr_output = all_lines.join("\n");
        log::warn!("[stt] Whisper error: {}", stderr_output);
        return Ok(TranscribeResult {
            success: false,
            text: String::new(),
            error: Some(format!("Whisper failed: {}", stderr_output.trim())),
            audio_path: final_audio_path,
            audio_duration: None,
        });
    }

    let last_line = all_lines.last().cloned().unwrap_or_default();
    log::info!("[stt] Whisper last output: {}", last_line);

    let audio_duration = if final_audio_path.is_some() {
        get_audio_duration_secs(final_audio_path.as_ref().unwrap())
    } else {
        None
    };

    match serde_json::from_str::<serde_json::Value>(&last_line) {
        Ok(json) => {
            let success = json.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let text = json
                .get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let error = json
                .get("error")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());

            Ok(TranscribeResult {
                success,
                text,
                error,
                audio_path: final_audio_path,
                audio_duration,
            })
        }
        Err(_) => Ok(TranscribeResult {
            success: false,
            text: String::new(),
            error: Some(format!("Failed to parse whisper output: {}", last_line)),
            audio_path: final_audio_path,
            audio_duration,
        }),
    }
}

/// 获取音频文件时长（秒），优先使用 ffprobe，不可用时通过解析 WAV 文件头计算
fn get_audio_duration_secs(path: &str) -> Option<f64> {
    let output = command("ffprobe")
        .args([
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    if !output.status.success() {
        return get_audio_duration_from_wav_header(path);
    }

    let duration_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if duration_str.is_empty() {
        return get_audio_duration_from_wav_header(path);
    }
    duration_str.parse::<f64>().ok()
}

/// 通过解析 WAV 文件头计算精确时长（ffprobe 不可用时的 fallback）
fn get_audio_duration_from_wav_header(path: &str) -> Option<f64> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 44 {
        return None;
    }
    // 验证 RIFF/WAVE 标识
    if &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
        return None;
    }
    let num_channels = u16::from_le_bytes([data[22], data[23]]) as u32;
    let sample_rate = u32::from_le_bytes([data[24], data[25], data[26], data[27]]);
    let bits_per_sample = u16::from_le_bytes([data[34], data[35]]) as u32;
    if sample_rate == 0 || num_channels == 0 || bits_per_sample == 0 {
        return None;
    }

    // 查找 "data" chunk 以获取实际音频数据大小
    let mut data_size: u32 = 0;
    let mut i = 12usize;
    while i + 8 <= data.len() {
        let chunk_id = &data[i..i + 4];
        let chunk_size = u32::from_le_bytes([data[i + 4], data[i + 5], data[i + 6], data[i + 7]]);
        if chunk_id == b"data" {
            data_size = chunk_size;
            break;
        }
        // 防止 chunk_size 导致无限循环
        if chunk_size as usize > data.len() - i - 8 {
            break;
        }
        i += 8 + chunk_size as usize;
    }

    if data_size == 0 {
        return None;
    }

    let bytes_per_sample = bits_per_sample / 8;
    if bytes_per_sample == 0 {
        return None;
    }
    let total_samples = data_size / (num_channels * bytes_per_sample);
    Some(total_samples as f64 / sample_rate as f64)
}
