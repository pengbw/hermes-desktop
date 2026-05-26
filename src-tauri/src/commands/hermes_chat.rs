use crate::commands::helpers::{
    command, hermes_api_base_from_pool, hermes_api_key_from_pool, hermes_bin, path_with_local_bin, tool_label,
    ChatStreamEvent, start_hermes_run, stop_hermes_run, RunHandleInner, AppState,
};
use crate::crypto::{file_storage, key_manager};
use std::sync::atomic::AtomicBool;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[tauri::command]
pub async fn chat_with_hermes_stream(
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
    log::info!("[chat_stream] executing command: {} chat -q ... -Q", bin);

    let new_path = path_with_local_bin();

    let mut cmd = tokio::process::Command::from(command(&bin));
    cmd.arg("chat")
        .arg("-q")
        .arg(&message)
        .arg("-Q")
        .env("PATH", &new_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(ref m) = model {
        cmd.arg("-m").arg(m);
    }
    if let Some(ref p) = provider {
        cmd.arg("--provider").arg(p);
    }
    if let Some(ref img) = image {
        cmd.arg("--image").arg(img);
    }

    let mut child = match cmd.spawn()
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

    use tokio::io::{AsyncBufReadExt, BufReader};

    let result = if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut total_content = String::new();

        loop {
            let line_result = tokio::time::timeout(
                tokio::time::Duration::from_secs(180),
                lines.next_line(),
            ).await;

            match line_result {
                Ok(Ok(Some(line))) => {
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

    let _ = child.wait().await;

    let stderr_output = stderr_task.await.unwrap_or_default();
    if !stderr_output.trim().is_empty() {
        log::warn!("[chat_stream] stderr: {}", stderr_output.trim());
    }

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

#[tauri::command]
pub async fn chat_with_hermes_api(
    app: AppHandle,
    message: String,
    session_id: Option<String>,
    model: Option<String>,
    provider: Option<String>,
    image: Option<String>,
    event_id: Option<String>,
    force_kb_retrieve: Option<bool>,
    conversation_id: Option<String>,
) -> Result<(), String> {
    use crate::commands::helpers::AppState;
    use crate::commands::knowledge;

    let event_id = event_id.unwrap_or_else(|| format!("chat-stream-{}", uuid::Uuid::new_v4()));
    log::info!("[chat_api] start event_id={}, message={}, session_id={:?}, model={:?}, provider={:?}, image={:?}, force_kb_retrieve={:?}, conversation_id={:?}", event_id, message, session_id, model, provider, image, force_kb_retrieve, conversation_id);

    let mut messages: Vec<serde_json::Value> = Vec::new();

    let mut kb_context_parts: Vec<String> = Vec::new();
    let api_base: String;
    let api_key: String;
    let history_messages: Vec<serde_json::Value>;
    let workspace_root: String;
    {
        let state = app.state::<AppState>();
        let pool = state.db_pool.clone();

        api_base = hermes_api_base_from_pool(&pool).await;
        api_key = hermes_api_key_from_pool(&pool).await;

        let kb_config: serde_json::Value = {
            let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);
            config_val.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or(serde_json::json!({}))
        };
        let global_max_chunks = kb_config["defaultMaxContextChunks"].as_i64().unwrap_or(8);

        let auto_retrieve = kb_config["globalAutoRetrieve"].as_bool().unwrap_or(false);
        let should_retrieve = force_kb_retrieve.unwrap_or(false) || auto_retrieve;
        log::info!("[chat_api] auto_retrieve={}, force_kb_retrieve={}, should_retrieve={}, conversation_id={:?}", auto_retrieve, force_kb_retrieve.unwrap_or(false), should_retrieve, conversation_id);

        if should_retrieve {
            let target_kbs: Vec<(String, String)> = if auto_retrieve {
                sqlx::query_as(
                    "SELECT id, name FROM knowledge_bases WHERE status = 'ready'"
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default()
            } else {
                let mut result: Vec<(String, String)> = Vec::new();
                let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

                let conv_kb_ids: Option<String> = if let Some(ref conv_id) = conversation_id {
                    sqlx::query_scalar("SELECT kb_ids FROM conversations WHERE id = ?")
                        .bind(conv_id)
                        .fetch_optional(&pool)
                        .await
                        .unwrap_or(None)
                        .flatten()
                } else {
                    None
                };

                if let Some(ids_json) = conv_kb_ids {
                    let ids: Vec<String> = serde_json::from_str(&ids_json).unwrap_or_default();
                    for kb_id in ids {
                        let kb: Option<(String, String)> = sqlx::query_as(
                            "SELECT id, name FROM knowledge_bases WHERE id = ? AND status = 'ready'"
                        )
                        .bind(&kb_id)
                        .fetch_optional(&pool)
                        .await
                        .unwrap_or(None);
                        if let Some(row) = kb {
                            seen.insert(row.0.clone());
                            result.push(row);
                        }
                    }
                }

                let auto_kbs: Vec<(String, String)> = sqlx::query_as(
                    "SELECT id, name FROM knowledge_bases WHERE status = 'ready' AND auto_retrieve = 1"
                )
                .fetch_all(&pool)
                .await
                .unwrap_or_default();
                for kb in auto_kbs {
                    if !seen.contains(&kb.0) {
                        result.push(kb);
                    }
                }

                result
            };

            log::info!("[chat_api] target_kbs count={}, kbs={:?}", target_kbs.len(), target_kbs.iter().map(|(_id, name)| name.clone()).collect::<Vec<_>>());

            let mut retrieve_futures = Vec::new();
            for (kb_id, kb_name) in &target_kbs {
                let app_clone = app.clone();
                let kb_id = kb_id.clone();
                let kb_name = kb_name.clone();
                let msg = message.clone();
                let max = global_max_chunks;
                retrieve_futures.push(async move {
                    let result = knowledge::retrieve_knowledge_internal(&app_clone, &kb_id, &msg, Some(max)).await;
                    (kb_name, result)
                });
            }
            let results = futures_util::future::join_all(retrieve_futures).await;
            let mut all_sources: Vec<knowledge::KnowledgeChunk> = Vec::new();
            for (kb_name, retrieve_result) in results {
                match &retrieve_result {
                    Ok(chunks) => log::info!("[chat_api] kb '{}' returned {} chunks", kb_name, chunks.len()),
                    Err(e) => log::warn!("[chat_api] kb '{}' retrieve failed: {}", kb_name, e),
                }
                if let Ok(mut chunks) = retrieve_result {
                    if !chunks.is_empty() {
                        let chunks_text: Vec<String> = chunks.iter().map(|c| c.content.clone()).collect();
                        kb_context_parts.push(format!("[知识库: {}]\n{}", kb_name, chunks_text.join("\n\n---\n\n")));
                        for chunk in &mut chunks {
                            chunk.kb_name = Some(kb_name.clone());
                        }
                        all_sources.extend(chunks);
                    }
                }
            }
            if !all_sources.is_empty() {
                let sources_json = serde_json::to_value(&all_sources).unwrap_or(serde_json::json!([]));
                let _ = app.emit(&format!("{}_knowledge_sources", event_id), sources_json);
            }
        }

        history_messages = if let Some(ref conv_id) = conversation_id {
            let sp: Option<String> = sqlx::query_scalar(
                "SELECT value FROM app_config WHERE key = 'conversation_storage_path'"
            )
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
            .filter(|v: &String| !v.is_empty());

            if key_manager::get_cached_key().is_none() {
                let _ = key_manager::init_or_load_key(sp.as_deref());
            }

            match file_storage::read_conversation_file(sp.as_deref(), conv_id) {
                Ok(msgs) => {
                    if msgs.len() > 1 {
                        msgs[..msgs.len() - 1]
                            .iter()
                            .map(|m| {
                                serde_json::json!({"role": m.role, "content": m.content})
                            })
                            .collect()
                    } else {
                        Vec::new()
                    }
                }
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };

        workspace_root = sqlx::query_scalar(
            "SELECT value FROM app_config WHERE key = 'workspace_root'"
        )
        .fetch_optional(&pool)
        .await
        .unwrap_or(None)
        .unwrap_or_default();
    }

    if !workspace_root.is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": format!("【重要 - 工作空间路径】\n当前工作空间根目录：{}\n如果用户要求读取、写入或操作文件，所有路径默认基于此目录。", workspace_root)
        }));
    }

    if !history_messages.is_empty() {
        log::info!("[chat_api] injected {} history messages (excluding current)", history_messages.len());
        messages.extend(history_messages);
    }

    if !kb_context_parts.is_empty() {
        let kb_context = kb_context_parts.join("\n\n===\n\n");
        messages.push(serde_json::json!({
            "role": "system",
            "content": format!("以下是从知识库中检索到的相关内容，请参考这些信息回答用户的问题。如果知识库内容与用户问题无关，请忽略。\n\n{}", kb_context)
        }));
        log::info!("[chat_api] injected {} knowledge base contexts", kb_context_parts.len());
    }

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

    log::info!("[chat_api] api_base={}, using /v1/runs API", api_base);

    let run_id = match start_hermes_run(&api_base, &api_key, "", request_body).await {
        Ok(id) => id,
        Err(e) => {
            log::error!("[chat_api] Failed to start run: {}", e);
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: Some("error".to_string()),
                tool_name: None,
                tool_label: None,
                chunk: format!("[Error] {}", e),
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

    let run_handle = Arc::new(RunHandleInner {
        run_id: run_id.clone(),
        cancelled: AtomicBool::new(false),
    });

    {
        let state = app.state::<AppState>();
        let mut map = state.cancel_map.lock().map_err(|e| e.to_string())?;
        map.insert(event_id.clone(), run_handle.clone());
    }

    let run_base = api_base.trim_end_matches("/v1");
    let events_url = format!("{}/v1/runs/{}/events", run_base, run_id);

    let client = reqwest::Client::new();
    let response = match client
        .get(&events_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            log::error!("[chat_api] Failed to connect to run events: {}", e);
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: Some("error".to_string()),
                tool_name: None,
                tool_label: None,
                chunk: format!("[Error] {}", e),
                done: false,
            });
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: None,
                tool_name: None,
                tool_label: None,
                chunk: "".to_string(),
                done: true,
            });
            drop_run_handle(&app, &event_id);
            return Ok(());
        }
    };

    use futures_util::StreamExt;

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut current_event: Option<String> = None;

    while let Some(chunk_result) = stream.next().await {
        if run_handle.cancelled.load(Ordering::Relaxed) {
            log::info!("[chat_api] cancelled for event_id={}", event_id);
            let _ = app.emit(&event_id, ChatStreamEvent {
                event_type: Some("cancelled".to_string()),
                tool_name: None,
                tool_label: None,
                chunk: "".to_string(),
                done: false,
            });
            break;
        }

        match chunk_result {
            Ok(chunk) => {
                let chunk_str = String::from_utf8_lossy(&chunk).to_string();
                buffer.push_str(&chunk_str);

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

                    if line.starts_with("data: ") || line.starts_with("data:") {
                        let data = if line.starts_with("data: ") {
                            &line[6..]
                        } else {
                            &line[5..]
                        };

                        if data.trim() == "[DONE]" {
                            continue;
                        }

                        let evt_type = current_event.take();

                        match serde_json::from_str::<serde_json::Value>(data) {
                            Ok(parsed) => {
                                let event_name = evt_type
                                    .as_deref()
                                    .or_else(|| parsed["event"].as_str())
                                    .unwrap_or("");

                                match event_name {
                                    "message.delta" => {
                                        if let Some(delta) = parsed["delta"].as_str() {
                                            let _ = app.emit(&event_id, ChatStreamEvent {
                                                event_type: Some("text".to_string()),
                                                tool_name: None,
                                                tool_label: None,
                                                chunk: delta.to_string(),
                                                done: false,
                                            });
                                        }
                                    }
                                    "tool.started" => {
                                        let t_name = parsed["tool"].as_str().unwrap_or("unknown");
                                        let label = tool_label(t_name);
                                        let _ = app.emit(&event_id, ChatStreamEvent {
                                            event_type: Some("tool_progress".to_string()),
                                            tool_name: Some(t_name.to_string()),
                                            tool_label: Some(label.to_string()),
                                            chunk: label.to_string(),
                                            done: false,
                                        });
                                    }
                                    "run.failed" => {
                                        let error = parsed["error"].as_str().unwrap_or("Unknown error");
                                        log::error!("[chat_api] run failed: {}", error);
                                        let _ = app.emit(&event_id, ChatStreamEvent {
                                            event_type: Some("error".to_string()),
                                            tool_name: None,
                                            tool_label: None,
                                            chunk: format!("[Error] {}", error),
                                            done: false,
                                        });
                                    }
                                    _ => {}
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

    drop_run_handle(&app, &event_id);

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

fn drop_run_handle(app: &AppHandle, event_id: &str) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut map) = state.cancel_map.lock() {
            map.remove(event_id);
        }
    }
}

#[tauri::command]
pub async fn stop_chat_stream(app: AppHandle, event_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let cancel_map = state.cancel_map.clone();

    let handle = {
        let map = cancel_map.lock().map_err(|e| e.to_string())?;
        map.get(&event_id).cloned()
    };

    if let Some(handle) = handle {
        handle.cancelled.store(true, Ordering::Relaxed);

        let pool = state.db_pool.clone();
        let api_base = hermes_api_base_from_pool(&pool).await;
        let api_key = hermes_api_key_from_pool(&pool).await;
        let _ = stop_hermes_run(&api_base, &api_key, &handle.run_id).await;

        log::info!("[stop_chat] stopped event_id={}, run_id={}", event_id, handle.run_id);
    } else {
        log::info!("[stop_chat] no running task found for event_id={}", event_id);
    }

    Ok(())
}
