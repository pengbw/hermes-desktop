use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Deserialize;
use tauri::Manager;

use crate::commands::helpers::command;

#[cfg(not(target_os = "windows"))]
use crate::commands::helpers::home_dir;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsRequest {
    pub text: String,
    pub voice: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub success: bool,
    pub audio_data: String,
    pub error: Option<String>,
}

fn find_edge_tts() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let candidates = [
            format!("{}\\hermes\\hermes-agent\\venv\\Scripts\\edge-tts.exe", local_appdata),
            format!("{}\\hermes\\hermes-agent\\.venv\\Scripts\\edge-tts.exe", local_appdata),
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
            format!("{}/.hermes/hermes-agent/venv/bin/edge-tts", home),
            format!("{}/.hermes/hermes-agent/.venv/bin/edge-tts", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/venv/bin/edge-tts", home),
            format!("{}/Library/Application Support/hermes/hermes-agent/.venv/bin/edge-tts", home),
        ];
        for path in &candidates {
            if std::path::Path::new(path).exists() {
                return Some(path.clone());
            }
        }
        if let Ok(output) = command("which").arg("edge-tts").output() {
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

#[tauri::command]
pub async fn text_to_speech(app: tauri::AppHandle, req: TtsRequest) -> Result<TtsResult, String> {
    if req.text.trim().is_empty() {
        return Ok(TtsResult {
            success: false,
            audio_data: String::new(),
            error: Some("Text is required".to_string()),
        });
    }

    let edge_tts = find_edge_tts().ok_or_else(|| {
        "Edge TTS not found. Please install Hermes Agent first.".to_string()
    })?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let tts_dir = app_data_dir.join("tts_cache");
    std::fs::create_dir_all(&tts_dir)
        .map_err(|e| format!("Failed to create tts cache dir: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let output_path = tts_dir.join(format!("tts_{}.mp3", timestamp));

    let voice = req.voice.unwrap_or_else(|| "zh-CN-XiaoxiaoNeural".to_string());

    let output = command(&edge_tts)
        .args(&[
            "--text",
            &req.text,
            "--voice",
            &voice,
            "--write-media",
            output_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run edge-tts: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(TtsResult {
            success: false,
            audio_data: String::new(),
            error: Some(format!("Edge TTS failed: {}", stderr.trim())),
        });
    }

    if output_path.exists() {
        let audio_bytes = std::fs::read(&output_path)
            .map_err(|e| format!("Failed to read audio file: {}", e))?;
        let audio_data = BASE64.encode(&audio_bytes);

        let _ = std::fs::remove_file(&output_path);

        Ok(TtsResult {
            success: true,
            audio_data,
            error: None,
        })
    } else {
        Ok(TtsResult {
            success: false,
            audio_data: String::new(),
            error: Some("Audio file was not created".to_string()),
        })
    }
}

#[tauri::command]
pub async fn check_tts_available() -> Result<serde_json::Value, String> {
    match find_edge_tts() {
        Some(path) => Ok(serde_json::json!({
            "available": true,
            "path": path
        })),
        None => Ok(serde_json::json!({
            "available": false,
            "error": "Edge TTS not installed"
        })),
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsFileResult {
    pub success: bool,
    pub audio_path: Option<String>,
    pub audio_duration: Option<f64>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn text_to_speech_file(app: tauri::AppHandle, req: TtsRequest) -> Result<TtsFileResult, String> {
    if req.text.trim().is_empty() {
        return Ok(TtsFileResult {
            success: false,
            audio_path: None,
            audio_duration: None,
            error: Some("Text is required".to_string()),
        });
    }

    let edge_tts = find_edge_tts().ok_or_else(|| {
        "Edge TTS not found. Please install Hermes Agent first.".to_string()
    })?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let voice_dir = app_data_dir.join("voice_messages");
    std::fs::create_dir_all(&voice_dir)
        .map_err(|e| format!("Failed to create voice dir: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let output_path = voice_dir.join(format!("tts_{}.mp3", timestamp));

    let voice = req.voice.unwrap_or_else(|| "zh-CN-XiaoxiaoNeural".to_string());

    let output = command(&edge_tts)
        .args(&[
            "--text",
            &req.text,
            "--voice",
            &voice,
            "--write-media",
            output_path.to_str().unwrap_or(""),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run edge-tts: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        log::warn!("[tts_file] edge-tts failed: {}", stderr.trim());
        return Ok(TtsFileResult {
            success: false,
            audio_path: None,
            audio_duration: None,
            error: Some(format!("Edge TTS failed: {}", stderr.trim())),
        });
    }

    if output_path.exists() {
        let file_size = std::fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);
        log::info!("[tts_file] output exists, size={} bytes", file_size);
        let audio_path = output_path.to_string_lossy().to_string();
        let audio_duration = get_tts_duration_secs(&audio_path);
        log::info!("[tts_file] success, audio_path={}, duration={:?}", audio_path, audio_duration);
        Ok(TtsFileResult {
            success: true,
            audio_path: Some(audio_path),
            audio_duration,
            error: None,
        })
    } else {
        Ok(TtsFileResult {
            success: false,
            audio_path: None,
            audio_duration: None,
            error: Some("Audio file was not created".to_string()),
        })
    }
}

/// 获取MP3音频时长（秒），使用纯Rust crate，跨平台无需系统依赖
pub(crate) fn get_tts_duration_secs(path: &str) -> Option<f64> {
    if let Some(d) = try_mp3_duration(path) {
        log::info!("[tts] mp3-duration: {}s", d);
        return Some(d);
    }
    if let Some(d) = get_mp3_duration_estimate(path) {
        return Some(d);
    }
    Some(1.0)
}

fn try_mp3_duration(path: &str) -> Option<f64> {
    let dur = mp3_duration::from_path(path).ok()?;
    Some(dur.as_secs_f64())
}


/// 通过解析 MP3 帧头估算时长（ffprobe 不可用时的 fallback）
/// 原理：扫描前 N 个 MP3 帧获取平均比特率，然后用 文件大小 × 8 / 比特率 估算
fn get_mp3_duration_estimate(path: &str) -> Option<f64> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 4 {
        return None;
    }

    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // WAV 文件使用 header 解析
    if ext == "wav" {
        return get_wav_duration_from_header(&data);
    }

    // 仅支持 MP3 格式
    if ext != "mp3" {
        return None;
    }

    let mut bitrate: u32 = 128000; // 默认 128kbps
    let mut i = 0;
    let len = data.len();

    // 跳过 ID3v2 标签
    if len > 10 && &data[0..3] == b"ID3" {
        // ID3v2 标签大小使用 4 字节同步安全整数（每字节最高位不使用）
        let tag_size = ((data[6] as u32 & 0x7f) << 21)
            | ((data[7] as u32 & 0x7f) << 14)
            | ((data[8] as u32 & 0x7f) << 7)
            | (data[9] as u32 & 0x7f);
        i = 10 + tag_size as usize;
        // 防止 ID3 标签大小超出文件
        if i > len {
            i = 0;
        }
    }

    // 扫描前 10 个有效 MP3 帧以获取平均比特率
    let mut frames_checked = 0u32;
    let mut total_bitrate = 0u64;
    // 最大搜索字节数，防止在损坏文件中无限循环
    let max_search = std::cmp::min(len, 65536);

    while i + 4 <= max_search && frames_checked < 10 {
        // MP3 帧同步字：0xFF + 高 3 位为 1
        if data[i] != 0xff || (data[i + 1] & 0xe0) != 0xe0 {
            i += 1;
            continue;
        }

        let version_bits = (data[i + 1] >> 3) & 0x03;
        let layer_bits = (data[i + 1] >> 1) & 0x03;
        let bitrate_index = (data[i + 2] >> 4) & 0x0f;
        let samplerate_index = (data[i + 2] >> 2) & 0x03;

        // 无效帧：free format 或 bad index
        if bitrate_index == 0 || bitrate_index == 15 || samplerate_index == 3 {
            i += 1;
            continue;
        }

        let is_v1 = version_bits == 3; // MPEG1
        let is_l1 = layer_bits == 3;
        let is_l2 = layer_bits == 2;
        let is_l3 = layer_bits == 1;

        // MPEG 比特率表（kbps）
        let bitrate_table_v1_l1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
        let bitrate_table_v1_l2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0];
        let bitrate_table_v1_l3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
        let bitrate_table_v2_l1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
        let bitrate_table_v2_l23 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

        let frame_bitrate = if is_v1 {
            if is_l1 { bitrate_table_v1_l1[bitrate_index as usize] }
            else if is_l2 { bitrate_table_v1_l2[bitrate_index as usize] }
            else if is_l3 { bitrate_table_v1_l3[bitrate_index as usize] }
            else { 0 }
        } else {
            if is_l1 { bitrate_table_v2_l1[bitrate_index as usize] }
            else { bitrate_table_v2_l23[bitrate_index as usize] }
        };

        if frame_bitrate == 0 {
            i += 1;
            continue;
        }

        total_bitrate += frame_bitrate as u64;
        frames_checked += 1;
        bitrate = frame_bitrate as u32;

        // 采样率表
        let sample_rates_v1 = [44100, 48000, 32000];
        let sample_rates_v2 = [22050, 24000, 16000];
        let sample_rates_v25 = [11025, 12000, 8000];

        let sample_rate = if is_v1 {
            sample_rates_v1[samplerate_index as usize]
        } else if version_bits == 2 {
            sample_rates_v2[samplerate_index as usize]
        } else {
            sample_rates_v25[samplerate_index as usize]
        };

        if sample_rate == 0 {
            i += 1;
            continue;
        }

        let padding = (data[i + 2] >> 1) & 0x01;
        // 计算帧大小以跳到下一帧
        let frame_size = if is_l1 {
            (12 * frame_bitrate as u64 * 1000 / sample_rate as u64 + padding as u64 * 4) as usize
        } else {
            let samples_per_frame: u64 = if is_v1 && is_l3 { 1152 } else { 576 };
            ((samples_per_frame * frame_bitrate as u64 * 1000) / (sample_rate as u64 * 8) + padding as u64) as usize
        };

        if frame_size == 0 {
            i += 1;
            continue;
        }
        i += frame_size;
    }

    // 使用平均比特率以提高准确性
    if frames_checked > 0 {
        bitrate = (total_bitrate / frames_checked as u64) as u32;
    }

    if bitrate == 0 {
        bitrate = 128000; // fallback 默认值
    }

    let file_size = data.len() as f64;
    Some(file_size * 8.0 / bitrate as f64)
}

/// 通过解析 WAV 文件头计算精确时长
fn get_wav_duration_from_header(data: &[u8]) -> Option<f64> {
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
