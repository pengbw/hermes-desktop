use crate::commands::project::{get_pool, record_activity, mark_auto_delegate_failure, repair_legacy_software_dev_workflow, clean_context_tags};
use crate::commands::helpers::{self, build_role_constraint_rules, start_hermes_run, RunHandleInner, AppState, call_hermes_api_non_streaming};
use crate::crypto::{file_storage, key_manager};
use crate::database::models as db;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

use super::project_workflow::{get_project_role_context, trigger_workflow_execution};
use super::project::extract_and_save_memory;
#[tauri::command]
pub async fn chat_with_project_role(app: AppHandle, project_id: String, role_id: String, message: String, event_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let context = get_project_role_context(app.clone(), project_id.clone(), role_id.clone()).await?;
    let role = &context["role"];
    let project = &context["project"];

    let role_name = role["name"].as_str().unwrap_or("AI助手");
    let role_nickname = role["nickname"].as_str().unwrap_or("");
    let role_soul = role["soul"].as_str().unwrap_or("");
    let role_resp = role["responsibilities"].as_str().unwrap_or("");
    let role_energy = role["energy"].as_i64().unwrap_or(100);
    let role_mood = role["mood"].as_str().unwrap_or("neutral");
    let project_name = project["name"].as_str().unwrap_or("");
    let project_desc = project["description"].as_str().unwrap_or("");
    let mut project_workspace = project["workspace_path"].as_str().unwrap_or("").to_string();
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

    let active_task: Option<(String, String)> = sqlx::query_as(
        "SELECT id, title FROM project_tasks WHERE project_id = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Some((tid, ttitle)) = active_task {
        if !project_workspace.is_empty() {
            let safe_title = ttitle.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "_");
            let ws_path = std::path::PathBuf::from(project_workspace.trim_end_matches(|c| c == '/' || c == '\\'));
            project_workspace = ws_path.join(format!("{}_{}", safe_title, &tid[0..8])).to_string_lossy().to_string();
            let _ = std::fs::create_dir_all(&project_workspace);
        }
    }

    let display_name = if role_nickname.is_empty() { role_name.to_string() } else { role_nickname.to_string() };

    let mood_hint = match role_mood {
        "energetic" => "你当前精力充沛，充满热情和创造力。",
        "tired" => "你有些疲惫，回答可能稍显简短，但仍保持专业。",
        "exhausted" => "你非常疲惫，回答会比较简洁，建议休息恢复精力。",
        _ => "",
    };

    let mut system_prompt = format!(
        "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}",
        project_name, display_name, role_name, role_resp, role_soul, project_desc
    );

    if !project_workspace.is_empty() {
        system_prompt.push_str(&format!("\n\n【文件产出规则】\n项目工作空间路径：{}\n如果需要产出文件，请将产出物写入该目录下，文件路径以 {} 开头。如果无法产出正式文件，则将你的回复信息写入文件。忽略记忆中的旧路径，始终以上述工作空间路径为准。", project_workspace, project_workspace));
    }

    if !mood_hint.is_empty() {
        system_prompt.push_str(&format!("\n\n当前状态：精力{}%，{}{}", role_energy, mood_hint, if role_mood == "exhausted" { "（回复可能较简短）" } else { "" }));
    }

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }
    system_prompt.push_str(build_role_constraint_rules());

    let workflows = &context["workflows"];
    if let Some(wf_arr) = workflows.as_array() {
        let upstream: Vec<String> = wf_arr.iter()
            .filter(|w| w["toRoleId"].as_str() == Some(&role_id))
            .filter_map(|w| {
                let from = w["fromRoleId"].as_str().unwrap_or("");
                let artifact = w["artifactType"].as_str().unwrap_or("");
                if !from.is_empty() { Some(format!("{}（提供：{}）", from, if artifact.is_empty() { "产出物" } else { artifact })) } else { None }
            })
            .collect();
        let downstream: Vec<String> = wf_arr.iter()
            .filter(|w| w["fromRoleId"].as_str() == Some(&role_id))
            .filter_map(|w| {
                let to = w["toRoleId"].as_str().unwrap_or("");
                let artifact = w["artifactType"].as_str().unwrap_or("");
                if !to.is_empty() { Some(format!("{}（需交付：{}）", to, if artifact.is_empty() { "产出物" } else { artifact })) } else { None }
            })
            .collect();

        if !upstream.is_empty() || !downstream.is_empty() {
            system_prompt.push_str("\n\n工作流上下文：");
            if !upstream.is_empty() {
                system_prompt.push_str(&format!("\n你的上游角色：{}", upstream.join("、")));
            }
            if !downstream.is_empty() {
                system_prompt.push_str(&format!("\n你的下游角色：{}", downstream.join("、")));
            }
        }
    }

    system_prompt.push_str(&format!("\n\n请以「{}」的身份回答问题，保持角色一致性。回答要专业、有针对性。", display_name));

    let skills = get_merged_skills(&pool, &project_id, &role_id).await;

    if !skills.is_empty() {
        let skill_names = skills.join("、");
        let mut skill_detail = format!(
            "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
            skill_names
        );

        let template_vars = serde_json::json!({
            "project_name": project_name,
            "role_name": display_name,
            "role_id": role_id,
            "project_id": project_id,
        });

        for (key, val) in template_vars.as_object().unwrap_or(&serde_json::Map::new()) {
            let pattern = format!("{{{{{}}}}}", key);
            if let Some(s) = val.as_str() {
                skill_detail = skill_detail.replace(&pattern, s);
            }
        }

        system_prompt.push_str(&skill_detail);
    }

    let active_tasks: Vec<(String, String, String, i32)> = sqlx::query_as(
        "SELECT title, body, status, priority FROM project_tasks WHERE project_id = ? AND assignee = ? AND status IN ('ready', 'running') ORDER BY priority DESC"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !active_tasks.is_empty() {
        let task_lines: Vec<String> = active_tasks.iter()
            .map(|(title, body, status, priority)| {
                let p = match priority {
                    p if *p >= 3 => "高",
                    p if *p >= 2 => "中",
                    _ => "低",
                };
                let s = match status.as_str() {
                    "ready" => "就绪",
                    "running" => "进行中",
                    _ => status,
                };
                let mut line = format!("- [{}] {}（优先级：{}）", s, title, p);
                if !body.is_empty() {
                    let preview: String = body.chars().take(80).collect();
                    line.push_str(&format!("\n  描述：{}", preview));
                }
                line
            })
            .collect();
        system_prompt.push_str(&format!("\n\n你当前被分配的任务：\n{}", task_lines.join("\n")));
    }

    let memories: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT category, content, importance FROM project_memories WHERE project_id = ? AND (role_id = ? OR role_id = 'shared') ORDER BY importance DESC LIMIT 10"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if !memories.is_empty() {
        let memory_text: Vec<String> = memories.iter()
            .map(|(cat, content, _imp)| {
                if cat == "general" { content.clone() }
                else { format!("[{}] {}", cat, content) }
            })
            .collect();
        system_prompt.push_str(&format!("\n\n项目记忆（重要决策和结论）：\n{}", memory_text.join("\n")));
    }

    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let mut messages = vec![
        serde_json::json!({
            "role": "system",
            "content": system_prompt
        }),
        serde_json::json!({
            "role": "user",
            "content": message
        })
    ];

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

    let recent_msgs: Vec<(String, String, String)> = match file_storage::read_project_messages_file(sp.as_deref(), &project_id) {
        Ok(msgs) => {
            let role_ids: Vec<String> = msgs.iter().map(|m| m.role_id.clone()).collect();
            let role_names: std::collections::HashMap<String, String> = if !role_ids.is_empty() {
                let placeholders: Vec<String> = role_ids.iter().map(|_| "?".to_string()).collect();
                let query = format!(
                    "SELECT id, COALESCE(nickname, name, id) FROM ai_roles WHERE id IN ({})",
                    placeholders.join(",")
                );
                let mut q = sqlx::query_as::<_, (String, String)>(&query);
                for rid in &role_ids {
                    q = q.bind(rid);
                }
                q.fetch_all(&pool)
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .collect()
            } else {
                std::collections::HashMap::new()
            };
            msgs.into_iter()
                .rev()
                .take(40)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .map(|m| {
                    let name = role_names.get(&m.role_id).cloned().unwrap_or_else(|| m.role_id.clone());
                    (m.role_id, m.content, name)
                })
                .collect()
        }
        Err(_) => Vec::new(),
    };

    let mut context_messages: Vec<serde_json::Value> = Vec::new();

    if recent_msgs.len() > 20 {
        let old_msgs: Vec<(String, String, String)> = recent_msgs[..recent_msgs.len() - 10].to_vec();
        let recent_keep: Vec<(String, String, String)> = recent_msgs[recent_msgs.len() - 10..].to_vec();

        let old_text: Vec<String> = old_msgs.iter()
            .map(|(rid, content, name)| {
                if rid == "builtin_user" { format!("用户：{}", content) }
                else if rid == &role_id { format!("{}：{}", display_name, content) }
                else { format!("{}：{}", name, content) }
            })
            .collect();
        let old_summary_input = old_text.join("\n");

        let summary_prompt = format!("请用简洁的中文总结以下对话的关键信息、决策和结论，不超过200字：\n\n{}", old_summary_input);
        let summary_body = serde_json::json!({
            "model": "default",
            "messages": [{"role": "user", "content": summary_prompt}],
        });

        let summary_response = call_hermes_api_non_streaming(&api_base, &api_key, &project_id, summary_body).await;

        if let Ok(resp) = summary_response {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(summary) = json["choices"][0]["message"]["content"].as_str() {
                        context_messages.push(serde_json::json!({
                            "role": "system",
                            "content": format!("历史对话摘要：{}", summary)
                        }));
                    }
                }
            }
        }

        for (msg_role_id, msg_content, msg_role_name) in &recent_keep {
            if *msg_role_id == role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }
    } else {
        for (msg_role_id, msg_content, msg_role_name) in &recent_msgs {
            if *msg_role_id == role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }
    }

    if !context_messages.is_empty() {
        messages.splice(1..1, context_messages);
    }

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
    });

    log::info!("[chat_with_project_role] project={}, role={}, api_base={}", project_id, role_id, api_base);

    let run_id = match start_hermes_run(&api_base, &api_key, &project_id, body).await {
        Ok(id) => id,
        Err(e) => {
            let err_msg = format!("Failed to start run: {}", e);
            let _ = mark_auto_delegate_failure(&app, &project_id, &role_id, Some(&event_id), &err_msg, None);
            return Err(err_msg);
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

    let app_handle = app.clone();
    let event_id_clone = event_id.clone();
    let project_id_clone = project_id.clone();
    let role_id_clone = role_id.clone();
    let run_id_clone = run_id.clone();
    let handle_clone = run_handle.clone();
    tauri::async_runtime::spawn(async move {
        let run_base = api_base.trim_end_matches("/v1");
        let events_url = format!("{}/v1/runs/{}/events", run_base, run_id_clone);

        let client = reqwest::Client::new();
        let response = match client
            .get(&events_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .send()
            .await
        {
            Ok(r) => r,
            Err(e) => {
                let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                    "chunk": format!("[Error: {}]", e),
                    "done": true,
                }));
                let _ = mark_auto_delegate_failure(&app_handle, &project_id_clone, &role_id_clone, Some(&event_id_clone), &format!("Failed to connect to run events: {}", e), None);
                drop_run_handle_for_project(&app_handle, &event_id_clone);
                return;
            }
        };

        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut buffer = String::new();
        let mut current_event: Option<String> = None;

        while let Some(chunk_result) = stream.next().await {
            if handle_clone.cancelled.load(Ordering::Relaxed) {
                let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                    "chunk": "",
                    "done": true,
                    "cancelled": true,
                }));
                break;
            }

            match chunk_result {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(pos) = buffer.find("\n") {
                        let line = buffer[..pos].trim().to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if line.is_empty() {
                            continue;
                        }

                        if line.starts_with("event: ") {
                            current_event = Some(line[7..].trim().to_string());
                            continue;
                        }

                        if line.starts_with("data: ") {
                            let data = &line[6..];
                            if data.trim() == "[DONE]" {
                                continue;
                            }

                            let evt_type = current_event.take();

                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                let event_name = evt_type
                                    .as_deref()
                                    .or_else(|| parsed["event"].as_str())
                                    .unwrap_or("");

                                match event_name {
                                    "message.delta" => {
                                        if let Some(delta) = parsed["delta"].as_str() {
                                            full_content.push_str(delta);
                                            let cleaned = clean_context_tags(delta);
                                            if !cleaned.is_empty() {
                                                let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                                    "chunk": cleaned,
                                                    "done": false,
                                                }));
                                            }
                                        }
                                    }
                                    "run.completed" => {
                                        let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                            "chunk": "",
                                            "done": true,
                                            "fullContent": full_content,
                                        }));

                                        let energy_pool = get_pool(&app_handle);
                                        if let Ok(pool) = energy_pool {
                                            let _ = sqlx::query("UPDATE ai_roles SET energy = MAX(0, energy - 8), updated_at = ? WHERE id = ?")
                                                .bind(chrono::Utc::now().timestamp_millis())
                                                .bind(&role_id)
                                                .execute(&pool)
                                                .await;
                                            let _ = sqlx::query("UPDATE ai_roles SET mood = CASE WHEN energy >= 70 THEN 'energetic' WHEN energy >= 40 THEN 'neutral' WHEN energy >= 20 THEN 'tired' ELSE 'exhausted' END WHERE id = ?")
                                                .bind(&role_id)
                                                .execute(&pool)
                                                .await;
                                        }

                                        {
                                            let rec_app = app_handle.clone();
                                            let rec_project = project_id.clone();
                                            let rec_role = role_id.clone();
                                            let rec_message = message.clone();
                                            let rec_content = full_content.clone();
                                            tauri::async_runtime::spawn(async move {
                                                let _ = record_chat_files(rec_app.clone(), rec_project.clone(), rec_role.clone(), String::new()).await;
                                                let _ = extract_and_save_memory(rec_app, rec_project, rec_role, rec_message, rec_content).await;
                                            });
                                        }
                                    }
                                    "run.failed" => {
                                        let error = parsed["error"].as_str().unwrap_or("Unknown error");
                                        let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                            "chunk": format!("[Error: {}]", error),
                                            "done": true,
                                        }));
                                        let _ = mark_auto_delegate_failure(&app_handle, &project_id_clone, &role_id_clone, Some(&event_id_clone), &format!("Run failed: {}", error), None);
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                        "chunk": format!("\n\n[Error: {}]", e),
                        "done": true,
                    }));
                    let _ = mark_auto_delegate_failure(&app_handle, &project_id_clone, &role_id_clone, Some(&event_id_clone), &format!("SSE stream error: {}", e), None);
                    break;
                }
            }
        }

        drop_run_handle_for_project(&app_handle, &event_id_clone);

        if !handle_clone.cancelled.load(Ordering::Relaxed) {
            let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                "chunk": "",
                "done": true,
            }));
        }
    });

    Ok(())
}

fn drop_run_handle_for_project(app: &AppHandle, event_id: &str) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut map) = state.cancel_map.lock() {
            map.remove(event_id);
        }
    }
}

#[tauri::command]
pub async fn chat_with_project_roles(app: AppHandle, project_id: String, role_ids: Vec<String>, message: String, event_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let mut all_replies: Vec<(String, String, String)> = Vec::new();

    for (i, role_id) in role_ids.iter().enumerate() {
        let context = get_project_role_context(app.clone(), project_id.clone(), role_id.clone()).await?;
        let role = &context["role"];
        let project = &context["project"];

        let role_name = role["name"].as_str().unwrap_or("AI助手");
        let role_nickname = role["nickname"].as_str().unwrap_or("");
        let role_soul = role["soul"].as_str().unwrap_or("");
        let role_resp = role["responsibilities"].as_str().unwrap_or("");
        let project_name = project["name"].as_str().unwrap_or("");
        let project_desc = project["description"].as_str().unwrap_or("");
        let mut project_workspace = project["workspace_path"].as_str().unwrap_or("").to_string();
        let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

        let active_task: Option<(String, String)> = sqlx::query_as(
            "SELECT id, title FROM project_tasks WHERE project_id = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1"
        )
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some((tid, ttitle)) = active_task {
            if !project_workspace.is_empty() {
                let safe_title = ttitle.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "_");
                let ws_path = std::path::PathBuf::from(project_workspace.trim_end_matches(|c| c == '/' || c == '\\'));
                project_workspace = ws_path.join(format!("{}_{}", safe_title, &tid[0..8])).to_string_lossy().to_string();
                let _ = std::fs::create_dir_all(&project_workspace);
            }
        }

        let display_name = if role_nickname.is_empty() { role_name.to_string() } else { role_nickname.to_string() };

        let mut other_role_contexts: Vec<(String, serde_json::Value)> = Vec::new();
        for other_id in role_ids.iter() {
            if other_id == role_id { continue; }
            if let Ok(ctx) = get_project_role_context(app.clone(), project_id.clone(), other_id.clone()).await {
                other_role_contexts.push((other_id.clone(), ctx));
            }
        }

        let other_mentioned: Vec<String> = other_role_contexts.iter()
            .filter_map(|(_, c)| {
                let n = c["role"]["nickname"].as_str().unwrap_or("");
                let rn = c["role"]["name"].as_str().unwrap_or("");
                Some(if n.is_empty() { rn.to_string() } else { n.to_string() })
            })
            .collect();

        let mut system_prompt = format!(
            "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}",
            project_name, display_name, role_name, role_resp, role_soul, project_desc
        );

        if !project_workspace.is_empty() {
            system_prompt.push_str(&format!("\n\n【文件产出规则】\n项目工作空间路径：{}\n如果需要产出文件，请将产出物写入该目录下，文件路径以 {} 开头。如果无法产出正式文件，则将你的回复信息写入文件。忽略记忆中的旧路径，始终以上述工作空间路径为准。", project_workspace, project_workspace));
        }

        if !project_guidelines.is_empty() {
            system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
        }
        system_prompt.push_str(build_role_constraint_rules());

        if !other_mentioned.is_empty() {
            system_prompt.push_str(&format!("\n\n当前正在与 {} 进行讨论。", other_mentioned.join("、")));
        }

        if !all_replies.is_empty() {
            let prev: Vec<String> = all_replies.iter()
                .map(|(name, reply, _)| format!("{}：{}", name, reply))
                .collect();
            system_prompt.push_str(&format!("\n\n其他角色的讨论：\n{}", prev.join("\n")));
            system_prompt.push_str("\n\n请基于以上讨论内容，从你的专业角度给出观点和建议。");
        }

        system_prompt.push_str(&format!("\n\n请以「{}」的身份回答问题，保持角色一致性。回答要专业、有针对性。", display_name));

        let skills = get_merged_skills(&pool, &project_id, role_id).await;

        if !skills.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
                skills.join("、")
            ));
        }

        let active_tasks: Vec<(String, String, String, i32)> = sqlx::query_as(
            "SELECT title, body, status, priority FROM project_tasks WHERE project_id = ? AND assignee = ? AND status IN ('ready', 'running') ORDER BY priority DESC"
        )
        .bind(&project_id)
        .bind(role_id)
        .fetch_all(&pool)
        .await
        .unwrap_or_default();

        if !active_tasks.is_empty() {
            let task_lines: Vec<String> = active_tasks.iter()
                .map(|(title, body, status, priority)| {
                    let p = match priority {
                        p if *p >= 3 => "高",
                        p if *p >= 2 => "中",
                        _ => "低",
                    };
                    let s = match status.as_str() {
                        "ready" => "就绪",
                        "running" => "进行中",
                        _ => status,
                    };
                    let mut line = format!("- [{}] {}（优先级：{}）", s, title, p);
                    if !body.is_empty() {
                        let preview: String = body.chars().take(80).collect();
                        line.push_str(&format!("\n  描述：{}", preview));
                    }
                    line
                })
                .collect();
            system_prompt.push_str(&format!("\n\n你当前被分配的任务：\n{}", task_lines.join("\n")));
        }

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

        let mut messages = vec![
            serde_json::json!({
                "role": "system",
                "content": system_prompt
            }),
            serde_json::json!({
                "role": "user",
                "content": message
            })
        ];

        let recent_msgs: Vec<(String, String, String)> = match file_storage::read_project_messages_file(sp.as_deref(), &project_id) {
            Ok(msgs) => {
                let role_ids: Vec<String> = msgs.iter().map(|m| m.role_id.clone()).collect();
                let role_names: std::collections::HashMap<String, String> = if !role_ids.is_empty() {
                    let placeholders: Vec<String> = role_ids.iter().map(|_| "?".to_string()).collect();
                    let query = format!(
                        "SELECT id, COALESCE(nickname, name, id) FROM ai_roles WHERE id IN ({})",
                        placeholders.join(",")
                    );
                    let mut q = sqlx::query_as::<_, (String, String)>(&query);
                    for rid in &role_ids {
                        q = q.bind(rid);
                    }
                    q.fetch_all(&pool)
                        .await
                        .unwrap_or_default()
                        .into_iter()
                        .collect()
                } else {
                    std::collections::HashMap::new()
                };
                msgs.into_iter()
                    .rev()
                    .take(20)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .map(|m| {
                        let name = role_names.get(&m.role_id).cloned().unwrap_or_else(|| m.role_id.clone());
                        (m.role_id, m.content, name)
                    })
                    .collect()
            }
            Err(_) => Vec::new(),
        };

        let mut context_messages: Vec<serde_json::Value> = Vec::new();
        for (msg_role_id, msg_content, msg_role_name) in &recent_msgs {
            if *msg_role_id == *role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else if *msg_role_id == "builtin_user" {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[{}]: {}", msg_role_name, msg_content)
                }));
            }
        }

        if !context_messages.is_empty() {
            messages.splice(1..1, context_messages);
        }

        let body = serde_json::json!({
            "model": "default",
            "messages": messages,
            "stream": false,
        });

        log::info!("[chat_with_project_roles] project={}, role={}, api_base={}", project_id, role_id, api_base);
        log::info!("[chat_with_project_roles] request body: {}", serde_json::to_string_pretty(&body).unwrap_or_default());

        let response = call_hermes_api_non_streaming(&api_base, &api_key, &project_id, body)
            .await
            .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("AI service error for role {}: {} - {}", display_name, status, text));
        }

        let resp_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        let cleaned_reply = clean_context_tags(&reply);

        let _ = app.emit(&event_id, serde_json::json!({
            "roleIndex": i,
            "roleId": role_id,
            "roleName": display_name,
            "chunk": cleaned_reply,
            "done": false,
        }));

        all_replies.push((display_name.clone(), reply.clone(), role_id.clone()));
    }

    let _ = app.emit(&event_id, serde_json::json!({
        "done": true,
        "replies": all_replies.iter().map(|(name, reply, rid)| serde_json::json!({
            "roleName": name,
            "roleId": rid,
            "content": reply,
        })).collect::<Vec<_>>(),
    }));

    {
        let rec_app = app.clone();
        let rec_project = project_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = record_chat_files(rec_app, rec_project, String::new(), String::new()).await;
        });
    }

    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoDelegateResult {
    pub from_role_id: String,
    pub from_role_name: String,
    pub to_role_id: String,
    pub to_role_name: String,
    pub message_sent: String,
    pub reply: String,
    pub artifact_id: Option<String>,
}

#[tauri::command]
pub async fn auto_delegate_chat(app: AppHandle, project_id: String, from_role_id: String, to_role_id: String, context_message: String, event_id: String, task_id: Option<String>) -> Result<AutoDelegateResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    if let Some(ref tid) = task_id {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ? AND status = 'ready'"
        )
        .bind(now)
        .bind(now)
        .bind(tid)
        .execute(&pool)
        .await;
    } else {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ? WHERE project_id = ? AND assignee = ? AND status = 'ready'"
        )
        .bind(now)
        .bind(now)
        .bind(&project_id)
        .bind(&to_role_id)
        .execute(&pool)
        .await;
    }

    // When from_role_id is empty (start node trigger), use "builtin_user" as the sender
    let effective_from_role_id = if from_role_id == "start" { "builtin_user".to_string() } else { from_role_id.clone() };

    let from_context = get_project_role_context(app.clone(), project_id.clone(), effective_from_role_id.clone()).await?;
    let to_context = get_project_role_context(app.clone(), project_id.clone(), to_role_id.clone()).await?;

    let from_role = &from_context["role"];
    let to_role = &to_context["role"];

    let from_name = from_role["nickname"].as_str().unwrap_or("").to_string();
    let from_name = if from_name.is_empty() { from_role["name"].as_str().unwrap_or("角色A").to_string() } else { from_name };
    let to_name = to_role["nickname"].as_str().unwrap_or("").to_string();
    let to_name = if to_name.is_empty() { to_role["name"].as_str().unwrap_or("角色B").to_string() } else { to_name };

    let from_resp = from_role["responsibilities"].as_str().unwrap_or("");
    let to_resp = to_role["responsibilities"].as_str().unwrap_or("");

    // 查询当前角色需要产出的产物类型（来自工作流定义）
    let expected_artifact_types: Vec<(String, String)> = sqlx::query_as(
        "SELECT DISTINCT artifact_type, transition_type FROM project_workflows WHERE project_id = ? AND to_role_id = ? AND artifact_type != ''"
    )
    .bind(&project_id)
    .bind(&to_role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let recent_artifacts: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT title, artifact_type, status, content FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY updated_at DESC LIMIT 3"
    )
    .bind(&project_id)
    .bind(&effective_from_role_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut delegate_message = format!("来自「{}」的委派消息：\n{}", from_name, context_message);

    if !recent_artifacts.is_empty() {
        delegate_message.push_str("\n\n相关产物：");
        for (title, atype, status, content) in &recent_artifacts {
            delegate_message.push_str(&format!("\n- {}（{}，状态：{}）", title, atype, status));
            if !content.is_empty() {
                let preview = if content.len() > 200 { content.chars().take(200).collect::<String>() } else { content.clone() };
                delegate_message.push_str(&format!("：{}...", preview));
            }
        }
    }

    delegate_message.push_str(&format!("\n\n请基于「{}」的产出，从你「{}」的职责角度（{}）进行分析和执行。", from_name, to_name, to_resp));

    let msg_id = uuid::Uuid::new_v4().to_string();
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

    let _ = file_storage::append_message_to_project(sp.as_deref(), &project_id, file_storage::EncryptedProjectMessage {
        id: msg_id.clone(),
        role_id: effective_from_role_id.clone(),
        content: delegate_message.clone(),
        message_type: "auto_delegate".to_string(),
        prompt_tokens: 0,
        completion_tokens: 0,
        created_at: now,
    });

    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let project = &to_context["project"];
    let project_name = project["name"].as_str().unwrap_or("");
    let project_desc = project["description"].as_str().unwrap_or("");
    let mut project_workspace = project["workspace_path"].as_str().unwrap_or("").to_string();
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");
    let to_soul = to_role["soul"].as_str().unwrap_or("");

    let active_task: Option<(String, String)> = sqlx::query_as(
        "SELECT id, title FROM project_tasks WHERE project_id = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Some((tid, ttitle)) = active_task {
        if !project_workspace.is_empty() {
            let safe_title = ttitle.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "_");
            let ws_path = std::path::PathBuf::from(project_workspace.trim_end_matches(|c| c == '/' || c == '\\'));
            project_workspace = ws_path.join(format!("{}_{}", safe_title, &tid[0..8])).to_string_lossy().to_string();
            let _ = std::fs::create_dir_all(&project_workspace);
        }
    }

    let mut system_prompt = format!(
        "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}\n\n你刚刚收到了来自「{}」的委派任务。{}是你的上游角色，负责{}。请基于上游的产出完成你的工作。",
        project_name, to_name, to_role["name"].as_str().unwrap_or(""), to_resp, to_soul, project_desc, from_name, from_name, from_resp
    );

    // 明确告知角色需要产出的产物类型
    if !expected_artifact_types.is_empty() {
        let artifact_desc: Vec<String> = expected_artifact_types.iter()
            .map(|(atype, ttype)| {
                let t = match ttype.as_str() {
                    "need_confirm" => "（需审批后流转）",
                    "auto_push" => "（自动流转）",
                    _ => "",
                };
                format!("- {}{}", atype, t)
            })
            .collect();
        system_prompt.push_str(&format!("\n\n【你需要产出的产物】\n你需要完成以下产物：\n{}\n请将产物文件写入工作空间目录。", artifact_desc.join("\n")));
    }

    if !project_workspace.is_empty() {
        system_prompt.push_str(&format!("\n\n【文件产出规则】\n项目工作空间路径：{}\n如果需要产出文件，请将产出物写入该目录下，文件路径以 {} 开头。如果无法产出正式文件，则将你的回复信息写入文件。忽略记忆中的旧路径，始终以上述工作空间路径为准。", project_workspace, project_workspace));
    }

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }
    system_prompt.push_str(build_role_constraint_rules());

    system_prompt.push_str(&format!("\n\n请以「{}」的身份回答，保持角色一致性。完成工作后请说明你产出了哪些文件以及文件路径。", to_name));

    let skills = get_merged_skills(&pool, &project_id, &to_role_id).await;

    if !skills.is_empty() {
        system_prompt.push_str(&format!(
            "\n\n你可使用的技能：{}\n当需要使用技能时，请在回复中说明要调用的技能和参数，格式如：[技能:技能名] 参数内容。",
            skills.join("、")
        ));
    }

    // 快照当前工作空间文件列表，用于 Agent 完成后检测新文件
    let pre_existing_files: std::collections::HashSet<String> = if !project_workspace.is_empty() {
        let ws_path = std::path::Path::new(&project_workspace);
        if ws_path.exists() {
            scan_dir_recursive_set(ws_path, ws_path)
        } else {
            std::collections::HashSet::new()
        }
    } else {
        std::collections::HashSet::new()
    };

    let messages = vec![
        serde_json::json!({ "role": "system", "content": system_prompt }),
        serde_json::json!({ "role": "user", "content": delegate_message }),
    ];

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
    });

    let _ = app.emit(&event_id, serde_json::json!({
        "fromRoleId": from_role_id,
        "fromRoleName": from_name,
        "toRoleId": to_role_id,
        "toRoleName": to_name,
        "message": delegate_message,
        "done": false,
    }));

    log::info!("[auto_delegate_chat] project={}, from={}, to={}, api_base={}", project_id, from_role_id, to_role_id, api_base);
    log::info!("[auto_delegate_chat] request body: {}", serde_json::to_string_pretty(&body).unwrap_or_default());

    let response = match call_hermes_api_non_streaming(&api_base, &api_key, &project_id, body).await {
        Ok(resp) => resp,
        Err(e) => {
            let error_message = format!("角色节点调用 AI 服务失败或超时: {}", e);
            let _ = mark_auto_delegate_failure(&app, &project_id, &to_role_id, Some(&event_id), &error_message, task_id.as_deref()).await;
            return Err(error_message);
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error_message = format!("角色节点 AI 服务返回错误: {} - {}", status, text);
        let _ = mark_auto_delegate_failure(&app, &project_id, &to_role_id, Some(&event_id), &error_message, task_id.as_deref()).await;
        return Err(error_message);
    }

    let resp_json: serde_json::Value = match response.json().await {
        Ok(json) => json,
        Err(e) => {
            let error_message = format!("角色节点解析 AI 响应失败: {}", e);
            let _ = mark_auto_delegate_failure(&app, &project_id, &to_role_id, Some(&event_id), &error_message, task_id.as_deref()).await;
            return Err(error_message);
        }
    };
    let raw_reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
    let reply = clean_context_tags(&raw_reply);

    log::info!("[auto_delegate_chat] AI reply ({} chars): {}", reply.len(), if reply.len() > 500 { reply.chars().take(500).collect::<String>() } else { reply.clone() });

    let reply_msg_id = uuid::Uuid::new_v4().to_string();
    let now2 = chrono::Utc::now().timestamp_millis();
    let sp2: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'conversation_storage_path'"
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .filter(|v: &String| !v.is_empty());

    if key_manager::get_cached_key().is_none() {
        let _ = key_manager::init_or_load_key(sp2.as_deref());
    }

    let _ = file_storage::append_message_to_project(sp2.as_deref(), &project_id, file_storage::EncryptedProjectMessage {
        id: reply_msg_id.clone(),
        role_id: to_role_id.clone(),
        content: reply.clone(),
        message_type: "auto_reply".to_string(),
        prompt_tokens: 0,
        completion_tokens: 0,
        created_at: now2,
    });

    let _ = app.emit(&event_id, serde_json::json!({
        "fromRoleId": from_role_id,
        "fromRoleName": from_name,
        "toRoleId": to_role_id,
        "toRoleName": to_name,
        "message": delegate_message,
        "reply": reply,
        "done": true,
    }));

    {
        let rec_app = app.clone();
        let rec_project = project_id.clone();
        let rec_role = to_role_id.clone();
        let _rec_from_role = effective_from_role_id.clone();
        let rec_reply = reply.clone();
        let rec_pre_existing = pre_existing_files.clone();
        let rec_workspace = project_workspace.to_string();
        let rec_task_id = task_id.clone().unwrap_or_default();
        tauri::async_runtime::spawn(async move {
            let pool = match get_pool(&rec_app) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("auto_delegate_chat: failed to get pool: {}", e);
                    return;
                }
            };

            let _ = record_chat_files(rec_app.clone(), rec_project.clone(), rec_role.clone(), rec_task_id.clone()).await;

            // 检测 Agent 写入的新文件，更新 artifact 的 file_path
            // 延迟 2 秒再扫描，给 Agent 异步写文件留出时间
            if !rec_workspace.is_empty() {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                let ws_path = std::path::Path::new(&rec_workspace);
                if ws_path.exists() {
                    let post_files = scan_dir_recursive_set(ws_path, ws_path);
                    let new_files: Vec<String> = post_files.difference(&rec_pre_existing).cloned().collect();

                    log::info!("auto_delegate_chat: pre_existing={} files, post={} files, new={} files", rec_pre_existing.len(), post_files.len(), new_files.len());

                    if !new_files.is_empty() {
                        log::info!("auto_delegate_chat: detected new files in workspace: {:?}", new_files);

                        let role_artifacts: Vec<(String, String)> = sqlx::query_as(
                            "SELECT id, artifact_type FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'in_progress'"
                        )
                        .bind(&rec_project)
                        .bind(&rec_role)
                        .fetch_all(&pool)
                        .await
                        .unwrap_or_default();

                        for (art_id, art_type) in &role_artifacts {
                            // 尝试匹配产物类型与文件名
                            let default_file = new_files.first().map(|s| s.as_str()).unwrap_or("");
                            let matched_file = new_files.iter().find(|f| {
                                let file_lower = f.to_lowercase();
                                let type_lower = art_type.to_lowercase();
                                file_lower.contains(&type_lower) || type_lower.contains(&file_lower.split('/').last().unwrap_or("").split('.').next().unwrap_or(""))
                            }).map(|s| s.as_str()).unwrap_or(default_file);

                            if !matched_file.is_empty() {
                                let ws_base = std::path::PathBuf::from(rec_workspace.trim_end_matches(|c| c == '/' || c == '\\'));
                                let file_rel = matched_file.trim_start_matches(|c| c == '/' || c == '\\');
                                let full_path = ws_base.join(file_rel).to_string_lossy().to_string();
                                let now_fp = chrono::Utc::now().timestamp_millis();
                                let result = sqlx::query(
                                    "UPDATE project_artifacts SET file_path = ?, updated_at = ? WHERE id = ?"
                                )
                                .bind(&full_path)
                                .bind(now_fp)
                                .bind(art_id)
                                .execute(&pool)
                                .await;

                                match result {
                                    Ok(_) => log::info!("auto_delegate_chat: updated artifact {} file_path to {}", art_id, full_path),
                                    Err(e) => log::error!("auto_delegate_chat: failed to update artifact file_path: {}", e),
                                }
                            }
                        }
                    }
                }
            }

            // After role finishes work, handle workflow-associated artifacts
            let now = chrono::Utc::now().timestamp_millis();

            // 判断当前任务是否走流程模式：依据任务自身的 workflow_group_id
            // （而非角色是否出现在 project_workflows 表中，否则自由分配模式会被误判为流程中）
            // 空字符串视为无流程（前端未选流程时会传空串而非 null）
            let (task_workflow_group_id, fallback_task_id): (Option<String>, Option<String>) = if !rec_task_id.is_empty() {
                let r = sqlx::query_scalar("SELECT workflow_group_id FROM project_tasks WHERE id = ?")
                    .bind(&rec_task_id)
                    .fetch_optional(&pool)
                    .await
                    .ok()
                    .flatten();
                (r, Some(rec_task_id.clone()))
            } else {
                // rec_task_id 为空时，回退查询：找当前项目+该角色+running 状态的最新任务
                let row: Option<(Option<String>, String)> = sqlx::query_as(
                    "SELECT workflow_group_id, id FROM project_tasks WHERE project_id = ? AND assignee = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1"
                )
                .bind(&rec_project)
                .bind(&rec_role)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten();
                match row {
                    Some((gid, tid)) => (gid, Some(tid)),
                    None => (None, None),
                }
            };
            let is_in_workflow = task_workflow_group_id
                .as_deref()
                .map(|s| !s.is_empty())
                .unwrap_or(false);
            log::info!("auto_delegate_chat: is_in_workflow={}, task_id={:?}", is_in_workflow, fallback_task_id);

            if !is_in_workflow {
                let mut marked_task_id: Option<String> = None;
                if let Some(ref tid) = fallback_task_id {
                    let task_result = sqlx::query(
                        "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ? AND status = 'running'"
                    )
                    .bind(now)
                    .bind(now)
                    .bind(tid)
                    .execute(&pool)
                    .await;

                    match task_result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: role {} not in workflow, marked task {} as done", rec_role, tid);
                            marked_task_id = Some(tid.clone());
                        }
                        _ => {
                            log::warn!("auto_delegate_chat: task update rows_affected=0, task_id={}", tid);
                        }
                    }
                } else {
                    log::warn!("auto_delegate_chat: no running task found for project {} role {}", rec_project, rec_role);
                }

                // 通知前端：任务状态已变为 done，让前端刷新任务列表
                if let Some(ref tid) = marked_task_id {
                    let _ = rec_app.emit("task_status_changed", serde_json::json!({
                        "projectId": rec_project,
                        "taskId": tid,
                        "newStatus": "done",
                    }));
                }
                // debounced emit 让 ProjectDetail 的 onProjectDataChanged 监听器刷新 tasks 列表
                crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "tasks");
                crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "artifacts");
            }

            // Determine how the current role's artifacts should be handled.
            // Workflow-mode steps use the current step action as the source of truth:
            // - need_confirm: submit for review and wait for approval on the current step
            // - auto_push/start: auto-approve and continue to the next step
            // Legacy fallback keeps the old behavior for records not bound to workflow steps.
            let running_steps: Vec<(String, i64, String)> = sqlx::query_as(
                "SELECT wr.id, wrs.step_index, wrs.action FROM workflow_runs wr \
                 JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                 WHERE wr.project_id = ? AND wr.status = 'running' \
                 AND wrs.role_id = ? AND wrs.status = 'running'"
            )
            .bind(&rec_project)
            .bind(&rec_role)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            let has_running_need_confirm_step = running_steps
                .iter()
                .any(|(_, _, action)| action == "need_confirm");
            let has_running_steps = !running_steps.is_empty();

            let run_group_id: Option<String> = if let Some((run_id, _, _)) = running_steps.first() {
                sqlx::query_scalar("SELECT group_id FROM workflow_runs WHERE id = ?")
                    .bind(run_id)
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None)
                    .flatten()
            } else {
                None
            };

            let has_need_confirm_outgoing: bool = if let Some(ref gid) = run_group_id {
                sqlx::query_scalar(
                    "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'need_confirm' AND (group_id = ? OR group_id IS NULL)"
                )
                .bind(&rec_project)
                .bind(&rec_role)
                .bind(gid)
                .fetch_one(&pool)
                .await
                .unwrap_or(0) > 0
            } else {
                sqlx::query_scalar(
                    "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'need_confirm'"
                )
                .bind(&rec_project)
                .bind(&rec_role)
                .fetch_one(&pool)
                .await
                .unwrap_or(0) > 0
            };
            let requires_confirmation =
                has_running_need_confirm_step || (!has_running_steps && has_need_confirm_outgoing);

            // Find all in_progress artifacts for this role
            let role_artifacts: Vec<(String, String)> = sqlx::query_as(
                "SELECT id, artifact_type FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'in_progress'"
            )
            .bind(&rec_project)
            .bind(&rec_role)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();

            let mut has_need_confirm_submitted = false;
            let mut should_trigger_next = false;

            // 将 AI 回复内容写入该角色的所有 in_progress 产物
            if !rec_reply.is_empty() {
                for (art_id, _) in &role_artifacts {
                    let result = sqlx::query(
                        "UPDATE project_artifacts SET content = ?, updated_at = ? WHERE id = ? AND status = 'in_progress'"
                    )
                    .bind(&rec_reply)
                    .bind(now)
                    .bind(art_id)
                    .execute(&pool)
                    .await;

                    match result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: updated artifact {} content ({} chars)", art_id, rec_reply.len());
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to update artifact content {}: {}", art_id, e);
                        }
                    }
                }
            }

            for (art_id, _art_type) in &role_artifacts {
                if requires_confirmation {
                    // This step requires review before the workflow can continue.
                    let result = sqlx::query("UPDATE project_artifacts SET status = 'submitted', updated_at = ? WHERE id = ? AND status = 'in_progress'")
                        .bind(now)
                        .bind(art_id)
                        .execute(&pool)
                        .await;

                    match result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: artifact {} marked as submitted for review", art_id);
                            has_need_confirm_submitted = true;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to update artifact {}: {}", art_id, e);
                        }
                    }
                } else {
                    // Auto-push steps can continue immediately after the role finishes work.
                    let result = sqlx::query("UPDATE project_artifacts SET status = 'approved', updated_at = ? WHERE id = ? AND status = 'in_progress'")
                        .bind(now)
                        .bind(art_id)
                        .execute(&pool)
                        .await;

                    match result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: artifact {} auto-approved", art_id);
                            should_trigger_next = true;
                        }
                        Ok(_) => {}
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to update artifact {}: {}", art_id, e);
                        }
                    }
                }
            }

            // Current need_confirm steps pause in-place and wait for review approval.
            if has_need_confirm_submitted {
                log::info!("auto_delegate_chat: role {} completed need_confirm work, current step waits for approval", rec_role);

                for (run_id, step_index, action) in &running_steps {
                    if action != "need_confirm" {
                        continue;
                    }
                    let _ = sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'pending_approval' WHERE run_id = ? AND step_index = ? AND status = 'running'"
                    )
                    .bind(run_id)
                    .bind(step_index)
                    .execute(&pool)
                    .await;

                    let _ = sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                        .bind(step_index)
                        .bind(run_id)
                        .execute(&pool)
                        .await;
                }

                if running_steps.is_empty() {
                    let pending_steps: Vec<(String, i64)> = sqlx::query_as(
                        "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                         JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                         WHERE wr.project_id = ? AND wr.status = 'running' \
                         AND wrs.role_id = ? AND wrs.status = 'pending' \
                         AND wrs.action = 'need_confirm' \
                         ORDER BY wrs.step_index ASC"
                    )
                    .bind(&rec_project)
                    .bind(&rec_role)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default();

                    for (run_id, step_index) in &pending_steps {
                        let _ = sqlx::query(
                            "UPDATE workflow_run_steps SET status = 'pending_approval' WHERE run_id = ? AND step_index = ?"
                        )
                        .bind(run_id)
                        .bind(step_index)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                            .bind(step_index)
                            .bind(run_id)
                            .execute(&pool)
                            .await;
                    }
                    log::info!("auto_delegate_chat: role {} completed need_confirm work, revived {} pending steps to pending_approval", rec_role, pending_steps.len());
                }

                let _ = rec_app.emit("need_confirm_submitted", serde_json::json!({
                    "projectId": rec_project,
                    "roleId": rec_role,
                }));

                // 为每个 submitted 产物发出 artifact_status_changed 事件，前端据此弹出审批窗口
                for (art_id, _) in &role_artifacts {
                    let _ = rec_app.emit("artifact_status_changed", serde_json::json!({
                        "projectId": rec_project,
                        "artifactId": art_id,
                        "newStatus": "submitted",
                    }));
                }
            }

            // Trigger next workflow step for auto_push artifacts via event
            if should_trigger_next {
                log::info!("auto_delegate_chat: role {} completed auto_push work, advancing workflow steps", rec_role);

                // Advance workflow_run_steps for all running runs where this role is the current step
                let auto_runs: Vec<(String, i64)> = if has_running_steps {
                    running_steps
                        .iter()
                        .filter(|(_, _, action)| action != "need_confirm")
                        .map(|(run_id, step_index, _)| (run_id.clone(), *step_index))
                        .collect()
                } else {
                    sqlx::query_as(
                        "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                         JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                         WHERE wr.project_id = ? AND wr.status = 'running' \
                         AND wrs.role_id = ? AND wrs.status = 'running'"
                    )
                    .bind(&rec_project)
                    .bind(&rec_role)
                    .fetch_all(&pool)
                    .await
                    .unwrap_or_default()
                };

                let mut auto_push_events: Vec<(String, i64)> = Vec::new();

                for (run_id, completed_step) in &auto_runs {
                    let step_result = sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND step_index = ? AND status = 'running'"
                    )
                    .bind(now)
                    .bind(run_id)
                    .bind(completed_step)
                    .execute(&pool)
                    .await;

                    match step_result {
                        Ok(r) if r.rows_affected() > 0 => {
                            log::info!("auto_delegate_chat: step {}/{} of run {} completed", completed_step, run_id, run_id);
                        }
                        Ok(_) => {
                            log::warn!("auto_delegate_chat: step {}/{} of run {} already processed, skipping", completed_step, run_id, run_id);
                            continue;
                        }
                        Err(e) => {
                            log::error!("auto_delegate_chat: failed to complete step {}/{} of run {}: {}", completed_step, run_id, run_id, e);
                            continue;
                        }
                    }

                    let next_step = completed_step + 1;
                    let max_step: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?"
                    )
                    .bind(run_id)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(0);

                    if next_step >= max_step {
                        // Workflow completed
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET status = 'completed', current_step = ?, completed_at = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(now)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let task_id: Option<String> = sqlx::query_scalar("SELECT task_id FROM workflow_runs WHERE id = ?")
                            .bind(run_id)
                            .fetch_optional(&pool)
                            .await
                            .unwrap_or(None);

                        let effective_tid = task_id.as_deref().filter(|t| !t.is_empty()).map(|t| t.to_string());

                        let resolved_tid = if let Some(tid) = effective_tid {
                            Some(tid)
                        } else {
                            let fallback: Option<String> = sqlx::query_scalar(
                                "SELECT id FROM project_tasks WHERE project_id = ? AND status IN ('running', 'ready') ORDER BY updated_at DESC LIMIT 1"
                            )
                            .bind(&rec_project)
                            .fetch_optional(&pool)
                            .await
                            .unwrap_or(None);

                            if let Some(ref ftid) = fallback {
                                let _ = sqlx::query("UPDATE workflow_runs SET task_id = ? WHERE id = ?")
                                    .bind(ftid)
                                    .bind(run_id)
                                    .execute(&pool)
                                    .await;
                                log::info!("auto_delegate_chat: backfilled task_id={} for workflow_run={}", ftid, run_id);
                            }

                            fallback
                        };

                        if let Some(tid) = resolved_tid {
                            let _ = sqlx::query(
                                "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ? AND status != 'done'"
                            )
                            .bind(now)
                            .bind(now)
                            .bind(&tid)
                            .execute(&pool)
                            .await;
                            log::info!("auto_delegate_chat: marked task {} as done", tid);

                            let _ = rec_app.emit("task_status_changed", serde_json::json!({
                                "projectId": rec_project,
                                "taskId": tid,
                                "newStatus": "done",
                            }));
                        }
                        log::info!("auto_delegate_chat: workflow completed (auto_push), marked tasks as done for project {}", rec_project);
                    } else {
                        // Advance to next step
                        let _ = sqlx::query(
                            "UPDATE workflow_runs SET current_step = ? WHERE id = ?"
                        )
                        .bind(next_step)
                        .bind(run_id)
                        .execute(&pool)
                        .await;

                        let _ = sqlx::query(
                            "UPDATE workflow_run_steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE run_id = ? AND step_index = ? AND status = 'pending'"
                        )
                        .bind(now)
                        .bind(run_id)
                        .bind(next_step)
                        .execute(&pool)
                        .await;

                        let next_role_id: Option<String> = sqlx::query_scalar(
                            "SELECT role_id FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
                        )
                        .bind(run_id)
                        .bind(next_step)
                        .fetch_optional(&pool)
                        .await
                        .unwrap_or(None);

                        if let Some(ref nrid)  = &next_role_id  {
                            if !rec_task_id.is_empty() && !nrid.is_empty() && nrid != "start" && nrid != "end" {
                                let _ = sqlx::query(
                                    "UPDATE project_tasks SET assignee = ?, updated_at = ? WHERE id = ?"
                                )
                                .bind(nrid)
                                .bind(now)
                                .bind(&rec_task_id)
                                .execute(&pool)
                                .await;
                                log::info!("auto_delegate_chat: auto_push updated task {} assignee to {}", rec_task_id, nrid);
                            }
                        }
                        
                        auto_push_events.push((run_id.clone(), next_step));
                    }
                }

                // Emit event to trigger next workflow execution
                for (run_id, step_index) in auto_push_events {
                    let _ = rec_app.emit("workflow_auto_push_completed", serde_json::json!({
                        "projectId": rec_project,
                        "roleId": rec_role,
                        "workflowRunId": run_id,
                        "stepIndex": step_index,
                    }));
                }
            }

            // Emit artifact status change events
            let _ = rec_app.emit("artifacts_updated", serde_json::json!({
                "projectId": rec_project,
                "roleId": rec_role,
            }));

            // Debounced data push for auto_delegate_chat completion
            crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "tasks");
            crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "artifacts");
            crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "members");
            crate::commands::helpers::debounced_emit(&rec_app, &rec_project, "messages");
        });
    }

    Ok(AutoDelegateResult {
        from_role_id,
        from_role_name: from_name,
        to_role_id,
        to_role_name: to_name,
        message_sent: delegate_message,
        reply,
        artifact_id: None,
    })
}

pub(crate) async fn evaluate_condition_with_ai(
    app: &AppHandle,
    project_id: &str,
    role_id: &str,
    condition_expr: &str,
    artifact_content: &str,
) -> Result<String, String> {
    let pool = get_pool(app)?;
    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let truncated_content = if artifact_content.len() > 4000 {
        let mut end = 4000;
        while end > 0 && !artifact_content.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}...(内容过长已截断)", &artifact_content[..end])
    } else {
        artifact_content.to_string()
    };

    let judge_prompt = format!(
        "你是一个流程判断助手。请严格根据以下「判断条件」，评估「上游产出物内容」是否满足要求。\n\
         只回复一个词：「是」或「否」。不要回复任何其他内容。\n\n\
         【判断条件】\n{}\n\n\
         【上游产出物内容】\n{}",
        condition_expr, truncated_content
    );

    let body = serde_json::json!({
        "model": "default",
        "messages": [
            {"role": "system", "content": "你是一个流程判断助手。你的唯一任务是阅读判断条件和上游产出物，然后只回复一个词：「是」或「否」。不要添加任何解释。"},
            {"role": "user", "content": judge_prompt}
        ],
        "stream": false,
    });

    log::info!("[evaluate_condition] project={}, role={}, condition={}", project_id, role_id, condition_expr);

    let response = call_hermes_api_non_streaming(&api_base, &api_key, project_id, body)
        .await
        .map_err(|e| format!("条件判断 AI 调用失败: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("条件判断 AI 返回错误: {} - {}", status, text));
    }

    let resp_json: serde_json::Value = response.json().await
        .map_err(|e| format!("条件判断 AI 响应解析失败: {}", e))?;

    let ai_response = resp_json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    log::info!("[evaluate_condition] AI response: '{}'", ai_response);

    let result = if ai_response.contains("是") || ai_response.to_lowercase().contains("yes") {
        "yes"
    } else if ai_response.contains("否") || ai_response.to_lowercase().contains("no") {
        "no"
    } else {
        log::warn!("[evaluate_condition] unexpected AI response '{}', defaulting to 'yes'", ai_response);
        "yes"
    };

    log::info!("[evaluate_condition] result: {}", result);
    Ok(result.to_string())
}

#[tauri::command]
pub async fn run_workflow_auto_chat(app: AppHandle, project_id: String, start_role_id: String, initial_message: String, event_id: String) -> Result<Vec<AutoDelegateResult>, String> {
    let pool = get_pool(&app)?;

    let mut results: Vec<AutoDelegateResult> = Vec::new();
    let mut current_role_id = start_role_id.clone();
    let mut current_message = initial_message.clone();
    let mut visited = std::collections::HashSet::new();
    visited.insert(start_role_id.clone());

    let mut step = 0;
    loop {
        let workflows: Vec<(String, String, String, String)> = sqlx::query_as(
            "SELECT id, from_role_id, to_role_id, transition_type FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'auto_push' ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(&current_role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if workflows.is_empty() {
            break;
        }

        for (_wf_id, _from_id, to_role_id, _transition_type) in &workflows {
            if visited.contains(to_role_id) {
                continue;
            }
            visited.insert(to_role_id.clone());

            let _ = app.emit(&event_id, serde_json::json!({
                "step": step,
                "stepIndex": results.len(),
                "fromRoleId": current_role_id,
                "toRoleId": to_role_id,
                "done": false,
            }));

            let step_event_id = format!("{}-{}", event_id, results.len());
            let result = auto_delegate_chat(
                app.clone(),
                project_id.clone(),
                current_role_id.clone(),
                to_role_id.clone(),
                current_message.clone(),
                step_event_id,
                None,
            )
            .await?;

            current_message = result.reply.clone();

            let _ = app.emit(&event_id, serde_json::json!({
                "step": step,
                "stepIndex": results.len(),
                "fromRoleId": result.from_role_id,
                "fromRoleName": result.from_role_name,
                "toRoleId": result.to_role_id,
                "toRoleName": result.to_role_name,
                "reply": result.reply,
                "stepDone": true,
                "done": false,
            }));

            results.push(result);
            current_role_id = to_role_id.clone();
        }
        step += 1;
    }

    let _ = app.emit(&event_id, serde_json::json!({
        "done": true,
        "totalSteps": results.len(),
    }));

    Ok(results)
}

#[tauri::command]
pub async fn add_task_comment(app: AppHandle, req: db::CreateTaskCommentRequest) -> Result<db::TaskComment, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO task_comments (id, task_id, role_id, content, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.task_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO task_events (id, task_id, event_type, role_id, detail, created_at) VALUES (?, ?, 'commented', ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&req.task_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::TaskComment {
        id,
        task_id: req.task_id,
        role_id: req.role_id,
        content: req.content,
        created_at: now,
    })
}

#[tauri::command]
pub async fn list_task_comments(app: AppHandle, task_id: String) -> Result<Vec<db::TaskComment>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT id, task_id, role_id, content, created_at FROM task_comments WHERE task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, task_id, role_id, content, created_at)| db::TaskComment {
        id, task_id, role_id, content, created_at,
    }).collect())
}

#[tauri::command]
pub async fn link_tasks(app: AppHandle, from_task_id: String, to_task_id: String, link_type: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO task_links (id, from_task_id, to_task_id, link_type, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&from_task_id)
        .bind(&to_task_id)
        .bind(&link_type)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unlink_tasks(app: AppHandle, link_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM task_links WHERE id = ?")
        .bind(&link_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_task_links(app: AppHandle, task_id: String) -> Result<Vec<db::TaskLink>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64)>(
        "SELECT id, from_task_id, to_task_id, link_type, created_at FROM task_links WHERE from_task_id = ? OR to_task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, from_task_id, to_task_id, link_type, created_at)| db::TaskLink {
        id, from_task_id, to_task_id, link_type, created_at,
    }).collect())
}

#[tauri::command]
pub async fn list_task_events(app: AppHandle, task_id: String) -> Result<Vec<db::TaskEvent>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, String, i64)>(
        "SELECT id, task_id, event_type, role_id, detail, created_at FROM task_events WHERE task_id = ? ORDER BY created_at ASC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, task_id, event_type, role_id, detail, created_at)| db::TaskEvent {
        id, task_id, event_type, role_id, detail, created_at,
    }).collect())
}

#[tauri::command]
pub async fn start_workflow_run(app: AppHandle, project_id: String, initial_message: String, group_id: Option<String>, task_id: Option<String>) -> Result<db::WorkflowRun, String> {
    let pool = get_pool(&app)?;
    repair_legacy_software_dev_workflow(&pool, Some(&project_id)).await?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let effective_task_id = task_id.unwrap_or_default();

    // 按流程组过滤工作流，如果未指定则查询主流程组
    let workflows: Vec<(String, Option<String>, String, String, String, i64)> = if let Some(ref gid) = group_id {
        sqlx::query_as(
            "SELECT id, from_role_id, to_role_id, transition_type, branch_label, sort_order FROM project_workflows WHERE project_id = ? AND group_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(gid)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        let primary_group_id: Option<String> = sqlx::query_scalar(
            "SELECT id FROM project_workflow_groups WHERE project_id = ? AND is_primary = 1 LIMIT 1"
        )
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(pgid) = primary_group_id {
            sqlx::query_as(
                "SELECT id, from_role_id, to_role_id, transition_type, branch_label, sort_order FROM project_workflows WHERE project_id = ? AND group_id = ? ORDER BY sort_order ASC"
            )
            .bind(&project_id)
            .bind(&pgid)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?
        } else {
            sqlx::query_as(
                "SELECT id, from_role_id, to_role_id, transition_type, branch_label, sort_order FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
            )
            .bind(&project_id)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?
        }
    };

    if workflows.is_empty() {
        return Err("No workflows defined for this project".to_string());
    }

    sqlx::query("INSERT INTO workflow_runs (id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at) VALUES (?, ?, NULL, ?, 0, 'running', '{}', ?, ?)")
        .bind(&id)
        .bind(&project_id)
        .bind(&group_id)
        .bind(&effective_task_id)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Insert "开始" step as step 0
    let start_step_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, 0, NULL, 'start', 'completed', ?, '')")
        .bind(&start_step_id)
        .bind(&id)
        .bind(&initial_message)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut next_action_by_role: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for (_wf_id, from_role_id, _to_role_id, transition_type, _branch_label, _sort_order) in &workflows {
        let Some(from_role_id) = from_role_id.as_ref().filter(|value| !value.is_empty() && **value != "start" && **value != "end") else {
            continue;
        };
        let entry = next_action_by_role
            .entry(from_role_id.clone())
            .or_insert_with(|| transition_type.clone());
        if *entry == "auto_push" && transition_type != "auto_push" {
            *entry = transition_type.clone();
        }
    }

    let mut step_index = 1;
    for (_i, (_wf_id, _from_role_id, to_role_id, transition_type, branch_label, _sort_order)) in workflows.iter().enumerate() {
        if to_role_id == "end" {
            continue;
        }
        if transition_type == "condition" && branch_label == "no" {
            continue;
        }
        let step_id = uuid::Uuid::new_v4().to_string();
        let role_id = Some(to_role_id.clone());
        let step_action = next_action_by_role
            .get(to_role_id)
            .cloned()
            .unwrap_or_else(|| "auto_push".to_string());
        sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, ?, ?, ?, 'pending', ?, '')")
            .bind(&step_id)
            .bind(&id)
            .bind(step_index)
            .bind(&role_id)
            .bind(step_action)
            .bind(&initial_message)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        step_index += 1;
    }

    // Set step 1 to "running" and trigger the first real role
    sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = 1")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // Trigger the start node transition (from_role_id = "" represents the start node)
    {
        let app_trigger = app.clone();
        let project_id_trigger = project_id.clone();
        let run_id_for_trigger = id.clone();
        tauri::async_runtime::spawn(async move {
            log::info!("start_workflow_run: triggering start node transition for project_id={}", project_id_trigger);
            match trigger_workflow_execution(app_trigger, project_id_trigger, "start".to_string(), None, None, Some(true), Some(run_id_for_trigger), Some(1)).await {
                Ok(result) => log::info!("start_workflow_run: triggered={}, pending={}", result.triggered_workflows.len(), result.pending_approvals.len()),
                Err(e) => log::error!("start_workflow_run: trigger error={}", e),
            }
        });
    }

    let _ = app.emit("workflow_run_started", serde_json::json!({
        "runId": id,
        "projectId": project_id,
    }));

    Ok(db::WorkflowRun {
        id,
        project_id,
        workflow_id: None,
        group_id,
        current_step: 0,
        status: "running".to_string(),
        context: "{}".to_string(),
        task_id: effective_task_id,
        started_at: now,
        completed_at: None,
    })
}

#[tauri::command]
pub async fn pause_workflow_run(app: AppHandle, run_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE workflow_runs SET status = 'paused' WHERE id = ? AND status = 'running'")
        .bind(&run_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("workflow_run_paused", serde_json::json!({ "runId": run_id, "timestamp": now }));

    Ok(())
}

#[tauri::command]
pub async fn resume_workflow_run(app: AppHandle, run_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE workflow_runs SET status = 'running' WHERE id = ? AND status = 'paused'")
        .bind(&run_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("workflow_run_resumed", serde_json::json!({ "runId": run_id, "timestamp": now }));

    Ok(())
}

#[tauri::command]
pub async fn confirm_workflow_step(app: AppHandle, run_id: String, approved: bool, comment: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let current_step: i64 = sqlx::query_scalar("SELECT current_step FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let project_id: String = sqlx::query_scalar("SELECT project_id FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let run_group_id: Option<String> = sqlx::query_scalar("SELECT group_id FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();

    let wf_task_id: Option<String> = sqlx::query_scalar("SELECT task_id FROM workflow_runs WHERE id = ?")
        .bind(&run_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

    if approved {
        sqlx::query("UPDATE workflow_run_steps SET status = 'completed', completed_at = ? WHERE run_id = ? AND step_index = ?")
            .bind(now)
            .bind(&run_id)
            .bind(current_step)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // Update submitted artifacts to approved for the current step's role
        let step_role_id: Option<String> = sqlx::query_scalar(
            "SELECT role_id FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
        )
        .bind(&run_id)
        .bind(current_step)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some(ref rid) = step_role_id {
            if !rid.is_empty() && rid != "start" && rid != "end" {
                let updated = sqlx::query(
                    "UPDATE project_artifacts SET status = 'approved', updated_at = ? WHERE project_id = ? AND role_id = ? AND status = 'submitted'"
                )
                .bind(now)
                .bind(&project_id)
                .bind(rid)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
                log::info!("confirm_workflow_step(approved): updated {} submitted artifacts to approved for role_id={}", updated.rows_affected(), rid);
            }
        }

        let _ = record_activity(&app, &project_id, None, "workflow_step_completed", Some("workflow"), Some(&run_id), &format!("工作流步骤 {} 已确认通过", current_step)).await;

        // Get the current step's role_id (the role that just completed) for triggering downstream
        let current_role_id: Option<String> = sqlx::query_scalar(
            "SELECT role_id FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
        )
        .bind(&run_id)
        .bind(current_step)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut next_step = current_step + 1;
        let max_step: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?")
            .bind(&run_id)
            .fetch_one(&pool)
            .await
            .map_err(|e| e.to_string())?;

        // Check if completing this step should end the workflow:
        // the current role has a need_confirm edge to "end", meaning approval terminates the flow.
        let should_complete_now = if let Some(ref rid) = current_role_id {
            if !rid.is_empty() && rid != "start" && rid != "end" {
                let mut end_edge_query = String::from(
                    "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND to_role_id = 'end' AND transition_type = 'need_confirm'"
                );
                if run_group_id.is_some() {
                    end_edge_query.push_str(" AND (group_id = ? OR group_id IS NULL)");
                }
                let mut eq = sqlx::query_scalar::<_, i64>(&end_edge_query)
                    .bind(&project_id)
                    .bind(rid);
                if let Some(ref gid) = run_group_id {
                    eq = eq.bind(gid);
                }
                eq.fetch_one(&pool).await.unwrap_or(0) > 0
            } else {
                false
            }
        } else {
            false
        };

        if should_complete_now {
            log::info!("confirm_workflow_step: role {} has need_confirm→end edge, completing workflow immediately", current_role_id.as_deref().unwrap_or(""));
        }

        if next_step >= max_step || should_complete_now {
            sqlx::query("UPDATE workflow_runs SET status = 'completed', current_step = ?, completed_at = ? WHERE id = ?")
                .bind(next_step)
                .bind(now)
                .bind(&run_id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            let task_id: Option<String> = sqlx::query_scalar("SELECT task_id FROM workflow_runs WHERE id = ?")
                .bind(&run_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

            let effective_tid = if let Some(ref tid) = task_id {
                if !tid.is_empty() {
                    Some(tid.clone())
                } else {
                    None
                }
            } else {
                None
            };

            let resolved_tid = if let Some(tid) = effective_tid {
                Some(tid)
            } else {
                let fallback: Option<String> = sqlx::query_scalar(
                    "SELECT id FROM project_tasks WHERE project_id = ? AND status IN ('running', 'ready') ORDER BY updated_at DESC LIMIT 1"
                )
                .bind(&project_id)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);

                if let Some(ref ftid) = fallback {
                    let _ = sqlx::query("UPDATE workflow_runs SET task_id = ? WHERE id = ?")
                        .bind(ftid)
                        .bind(&run_id)
                        .execute(&pool)
                        .await;
                    log::info!("confirm_workflow_step: backfilled task_id={} for workflow_run={}", ftid, run_id);
                }

                fallback
            };

            if let Some(tid) = resolved_tid {
                let _ = sqlx::query(
                    "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ? AND status != 'done'"
                )
                .bind(now)
                .bind(now)
                .bind(&tid)
                .execute(&pool)
                .await;
                log::info!("confirm_workflow_step: marked task {} as done", tid);

                let _ = app.emit("task_status_changed", serde_json::json!({
                    "projectId": project_id,
                    "taskId": tid,
                    "newStatus": "done",
                }));
            }
            log::info!("confirm_workflow_step: workflow completed, marked tasks as done for project {}", project_id);

            let _ = record_activity(&app, &project_id, None, "workflow_completed", Some("workflow"), Some(&run_id), "工作流运行完成").await;
        } else {
            sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                .bind(next_step)
                .bind(&run_id)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = ?")
                .bind(now)
                .bind(&run_id)
                .bind(next_step)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

            let next_role_id: Option<String> = sqlx::query_scalar(
                "SELECT role_id FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
            )
            .bind(&run_id)
            .bind(next_step)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);

            if let (Some(ref tid), Some(ref nrid)) = (&wf_task_id, &next_role_id) {
                if !tid.is_empty() && !nrid.is_empty() && nrid != "start" && nrid != "end" {
                    let _ = sqlx::query(
                        "UPDATE project_tasks SET assignee = ?, updated_at = ? WHERE id = ?"
                    )
                    .bind(nrid)
                    .bind(now)
                    .bind(tid)
                    .execute(&pool)
                    .await;
                    log::info!("confirm_workflow_step: updated task {} assignee to {}", tid, nrid);
                }
            }

            // Trigger workflow execution using the CURRENT step's role_id as from_role_id
            // This will find workflows from the current role to downstream roles and delegate work
            let current_role_id_for_branch = current_role_id.clone();
            let mut condition_branch_result: Option<String> = None;
            if let Some(from_role_id) = current_role_id {
                if !from_role_id.is_empty() && from_role_id != "start" && from_role_id != "end" {
                    let mut condition_query = String::from(
                        "SELECT condition_expr FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'condition' AND condition_expr IS NOT NULL AND condition_expr != ''"
                    );
                    if run_group_id.is_some() {
                        condition_query.push_str(" AND (group_id = ? OR group_id IS NULL)");
                    }
                    condition_query.push_str(" LIMIT 1");

                    let mut query = sqlx::query_scalar::<_, String>(&condition_query)
                        .bind(&project_id)
                        .bind(&from_role_id);
                    if let Some(ref gid) = run_group_id {
                        query = query.bind(gid);
                    }

                    let condition_expr: Option<String> = query
                        .fetch_optional(&pool)
                        .await
                        .map_err(|e| e.to_string())?;

                    let condition_result = if let Some(ref expr) = condition_expr {
                        if !expr.is_empty() {
                            let artifact_content: Option<String> = sqlx::query_scalar(
                                "SELECT content FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'approved' ORDER BY updated_at DESC LIMIT 1"
                            )
                            .bind(&project_id)
                            .bind(&from_role_id)
                            .fetch_optional(&pool)
                            .await
                            .map_err(|e| e.to_string())?
                            .flatten();

                            if let Some(content) = artifact_content {
                                match evaluate_condition_with_ai(&app, &project_id, &from_role_id, expr, &content).await {
                                    Ok(result) => {
                                        log::info!("confirm_workflow_step: condition evaluated as '{}' for role {}", result, from_role_id);
                                        Some(result)
                                    }
                                    Err(e) => {
                                        log::error!("confirm_workflow_step: condition evaluation failed: {}, defaulting to 'yes'", e);
                                        Some("yes".to_string())
                                    }
                                }
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    };

                    condition_branch_result = condition_result.clone();

                    let _ = trigger_workflow_execution(
                        app.clone(),
                        project_id.clone(),
                        from_role_id.clone(),
                        None,
                        condition_result,
                        None,
                        Some(run_id.clone()),
                        Some(next_step as i32),
                    ).await;
                }
            }

            // Determine next_step based on condition branch result
            if let Some(ref branch) = condition_branch_result {
                if let Some(ref from_role_id) = current_role_id_for_branch {
                    let mut target_query = String::from(
                        "SELECT to_role_id FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'condition' AND branch_label = ?"
                    );
                    if run_group_id.is_some() {
                        target_query.push_str(" AND (group_id = ? OR group_id IS NULL)");
                    }
                    target_query.push_str(" LIMIT 1");

                    let mut tq = sqlx::query_scalar::<_, String>(&target_query)
                        .bind(&project_id)
                        .bind(from_role_id)
                        .bind(branch);
                    if let Some(ref gid) = run_group_id {
                        tq = tq.bind(gid);
                    }

                    let target_role: Option<String> = tq
                        .fetch_optional(&pool)
                        .await
                        .map_err(|e| e.to_string())?;

                    if let Some(ref target_role) = target_role {
                        let condition_target_step: Option<i64> = sqlx::query_scalar(
                            "SELECT step_index FROM workflow_run_steps WHERE run_id = ? AND role_id = ? ORDER BY step_index ASC LIMIT 1"
                        )
                        .bind(&run_id)
                        .bind(target_role)
                        .fetch_optional(&pool)
                        .await
                        .map_err(|e| e.to_string())?
                        .flatten();

                        if let Some(ts) = condition_target_step {
                            if ts > current_step + 1 {
                                for skip_idx in (current_step + 1)..ts {
                                    let _ = sqlx::query(
                                        "UPDATE workflow_run_steps SET status = 'skipped' WHERE run_id = ? AND step_index = ?"
                                    )
                                    .bind(&run_id)
                                    .bind(skip_idx)
                                    .execute(&pool)
                                    .await;
                                }
                                log::info!("confirm_workflow_step: skipped {} intermediate condition branch steps", ts - (current_step + 1));
                            }
                            next_step = ts;
                            log::info!("confirm_workflow_step: condition branch '{}' → step {} ({})", branch, next_step, target_role);
                        }
                    }
                }
            }
        }
    } else {
        // Rejected: mark step as rejected but do NOT terminate the entire run
        sqlx::query("UPDATE workflow_run_steps SET status = 'rejected', completed_at = ?, output = ? WHERE run_id = ? AND step_index = ?")
            .bind(now)
            .bind(comment.clone().unwrap_or_default())
            .bind(&run_id)
            .bind(current_step)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let _ = record_activity(&app, &project_id, None, "workflow_step_rejected", Some("workflow"), Some(&run_id), &format!("工作流步骤 {} 被拒绝", current_step)).await;

        // Get the rejected step's role info
        let step_info: Option<(String, String)> = sqlx::query_as(
            "SELECT role_id, action FROM workflow_run_steps WHERE run_id = ? AND step_index = ?"
        )
        .bind(&run_id)
        .bind(current_step)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((step_role_id, step_action)) = step_info {
            if !step_role_id.is_empty() {
                let step_artifact_type: Option<String> = sqlx::query_scalar(
                    "SELECT artifact_type FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'submitted' ORDER BY updated_at DESC LIMIT 1"
                )
                .bind(&project_id)
                .bind(&step_role_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?
                .flatten();

                let reject_target: Option<String> = {
                    let mut rq = String::from(
                        "SELECT reject_to_role_id FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'need_confirm' AND reject_to_role_id IS NOT NULL AND reject_to_role_id != '' AND (artifact_type = ? OR artifact_type = '')"
                    );
                    if run_group_id.is_some() {
                        rq.push_str(" AND (group_id = ? OR group_id IS NULL)");
                    }
                    rq.push_str(" ORDER BY CASE WHEN artifact_type = ? THEN 0 ELSE 1 END LIMIT 1");

                    let mut query = sqlx::query_scalar::<_, String>(&rq)
                        .bind(&project_id)
                        .bind(&step_role_id)
                        .bind(step_artifact_type.as_deref().unwrap_or(""));
                    if let Some(ref gid) = run_group_id {
                        query = query.bind(gid);
                    }
                    query = query.bind(step_artifact_type.as_deref().unwrap_or(""));

                    query.fetch_optional(&pool).await.map_err(|e| e.to_string())?
                };

                let reject_target = if reject_target.is_none() {
                    let mut fallback_query = String::from(
                        "SELECT reject_to_role_id FROM project_workflows WHERE project_id = ? AND from_role_id = ? AND transition_type = 'need_confirm' AND reject_to_role_id IS NOT NULL AND reject_to_role_id != ''"
                    );
                    if run_group_id.is_some() {
                        fallback_query.push_str(" AND (group_id = ? OR group_id IS NULL)");
                    }
                    fallback_query.push_str(" LIMIT 1");

                    let mut fq = sqlx::query_scalar::<_, String>(&fallback_query)
                        .bind(&project_id)
                        .bind(&step_role_id);
                    if let Some(ref gid) = run_group_id {
                        fq = fq.bind(gid);
                    }

                    fq.fetch_optional(&pool).await.map_err(|e| e.to_string())?
                } else {
                    reject_target
                };

                if let Some(target_role_id) = reject_target {
                    let target_step: Option<i64> = sqlx::query_scalar(
                        "SELECT step_index FROM workflow_run_steps WHERE run_id = ? AND role_id = ? ORDER BY step_index ASC LIMIT 1"
                    )
                    .bind(&run_id)
                    .bind(&target_role_id)
                    .fetch_optional(&pool)
                    .await
                    .map_err(|e| e.to_string())?
                    .flatten();

                    if let Some(target_idx) = target_step {
                        sqlx::query("UPDATE workflow_run_steps SET status = 'pending', output = ? WHERE run_id = ? AND step_index = ?")
                            .bind(comment.clone().unwrap_or_default())
                            .bind(&run_id)
                            .bind(target_idx)
                            .execute(&pool)
                            .await
                            .map_err(|e| e.to_string())?;

                        sqlx::query("UPDATE workflow_run_steps SET status = 'skipped' WHERE run_id = ? AND step_index > ? AND step_index < ?")
                            .bind(&run_id)
                            .bind(target_idx)
                            .bind(current_step)
                            .execute(&pool)
                            .await
                            .map_err(|e| e.to_string())?;

                        sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                            .bind(target_idx)
                            .bind(&run_id)
                            .execute(&pool)
                            .await
                            .map_err(|e| e.to_string())?;

                        sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = ?")
                            .bind(now)
                            .bind(&run_id)
                            .bind(target_idx)
                            .execute(&pool)
                            .await
                            .map_err(|e| e.to_string())?;

                        let _ = sqlx::query(
                            "UPDATE project_artifacts SET status = 'rejected', updated_at = ? WHERE project_id = ? AND role_id = ? AND status = 'submitted'"
                        )
                        .bind(now)
                        .bind(&project_id)
                        .bind(&step_role_id)
                        .execute(&pool)
                        .await;

                        log::info!("confirm_workflow_step(rejected): rolled back to role {} at step {}", target_role_id, target_idx);

                        let target_task_id = wf_task_id.clone();
                        let target_project_id = project_id.clone();
                        let target_step_role = target_role_id.clone();
                        let target_comment = comment.clone().unwrap_or_default();
                        let app_rollback = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if !target_step_role.is_empty() && target_step_role != "start" && target_step_role != "end" {
                                let pool_r = match get_pool(&app_rollback) {
                                    Ok(p) => p,
                                    Err(e) => {
                                        log::error!("confirm_workflow_step(rollback): get_pool failed: {}", e);
                                        return;
                                    }
                                };
                                if let (Some(ref tid), _) = (&target_task_id, &target_step_role) {
                                    if !tid.is_empty() {
                                        let _ = sqlx::query(
                                            "UPDATE project_tasks SET assignee = ?, status = 'running', updated_at = ? WHERE id = ?"
                                        )
                                        .bind(&target_step_role)
                                        .bind(now)
                                        .bind(tid)
                                        .execute(&pool_r)
                                        .await;
                                    }
                                }

                                let context_msg = format!(
                                    "你的上游产出物被驳回，请根据以下意见重新工作：\n{}",
                                    target_comment
                                );
                                let event_id = format!("wf_rollback_{}_{}", target_project_id, uuid::Uuid::new_v4());
                                let _ = crate::commands::project_execution::auto_delegate_chat(
                                    app_rollback.clone(),
                                    target_project_id.clone(),
                                    "builtin_user".to_string(),
                                    target_step_role.clone(),
                                    context_msg,
                                    event_id,
                                    target_task_id.clone(),
                                ).await;
                            }
                        });
                    }
                } else {
                // Create a new retry step at current_step position with status "pending"
                // First, shift all later steps' index by 1
                let max_step: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_run_steps WHERE run_id = ?")
                    .bind(&run_id)
                    .fetch_one(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                for shift_idx in (current_step + 1..max_step).rev() {
                    sqlx::query("UPDATE workflow_run_steps SET step_index = step_index + 1 WHERE run_id = ? AND step_index = ?")
                        .bind(&run_id)
                        .bind(shift_idx)
                        .execute(&pool)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                // Insert retry step
                let retry_step_id = uuid::Uuid::new_v4().to_string();
                let retry_comment = comment.clone().unwrap_or_default();
                sqlx::query("INSERT INTO workflow_run_steps (id, run_id, step_index, role_id, action, status, input, output) VALUES (?, ?, ?, ?, 'need_confirm', 'pending', ?, '')")
                    .bind(&retry_step_id)
                    .bind(&run_id)
                    .bind(current_step + 1)
                    .bind(&step_role_id)
                    .bind(&format!("驳回重试：{}", retry_comment))
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Set current_step to the retry step
                sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                    .bind(current_step + 1)
                    .bind(&run_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Set retry step to running
                sqlx::query("UPDATE workflow_run_steps SET status = 'running', started_at = ? WHERE run_id = ? AND step_index = ?")
                    .bind(now)
                    .bind(&run_id)
                    .bind(current_step + 1)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                // Update task assignee back to the rejected role
                let task_id_for_wf: Option<String> = sqlx::query_scalar(
                    "SELECT task_id FROM workflow_runs WHERE id = ?"
                )
                .bind(&run_id)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);

                if let (Some(ref tid), Some(ref sid)) = (&task_id_for_wf, Some(&step_role_id)) {
                    if !tid.is_empty() && !sid.is_empty() && *sid != "start" && *sid != "end" {
                        let _ = sqlx::query(
                            "UPDATE project_tasks SET assignee = ?, status = 'running', updated_at = ? WHERE id = ?"
                        )
                        .bind(sid)
                        .bind(now)
                        .bind(tid)
                        .execute(&pool)
                        .await;
                        log::info!("confirm_workflow_step(rejected): updated task {} assignee back to {}", tid, sid);
                    }
                }

                // Trigger AI to rework based on rejection comment
                let app_retry = app.clone();
                let project_id_retry = project_id.clone();
                let retry_comment_for_chat = comment.clone().unwrap_or_default();
                let retry_run_id = run_id.clone();
                let retry_step_index = current_step + 1;
                tauri::async_runtime::spawn(async move {
                    log::info!("confirm_workflow_step(rejected): triggering AI rework for role_id={}", step_role_id);

                    // Find the latest artifact for this role to update
                    let pool_retry = match get_pool(&app_retry) {
                        Ok(p) => p,
                        Err(e) => {
                            log::error!("confirm_workflow_step: get_pool failed: {}", e);
                            return;
                        }
                    };

                    // Update existing submitted artifact to rejected
                    let now_retry = chrono::Utc::now().timestamp_millis();
                    let _ = sqlx::query(
                        "UPDATE project_artifacts SET status = 'rejected', updated_at = ? WHERE project_id = ? AND role_id = ? AND status = 'submitted'"
                    )
                    .bind(now_retry)
                    .bind(&project_id_retry)
                    .bind(&step_role_id)
                    .execute(&pool_retry)
                    .await;
                    log::info!("confirm_workflow_step(rejected): updated submitted artifacts to rejected for role_id={}", step_role_id);

                    // Then create a new in_progress artifact for the role
                    let new_artifact_id = uuid::Uuid::new_v4().to_string();
                    let effective_task_id = wf_task_id.clone().unwrap_or_default();
                    let _ = sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, content, status, run_step_id, workflow_run_id, step_index, created_at, updated_at) \
                         SELECT ?, project_id, role_id, ?, artifact_type, ? || ' - 修改稿', '', 'in_progress', ?, ?, ?, ?, ? \
                         FROM project_artifacts WHERE project_id = ? AND role_id = ? AND status = 'rejected' \
                         ORDER BY updated_at DESC LIMIT 1"
                    )
                    .bind(&new_artifact_id)
                    .bind(&effective_task_id)
                    .bind(if step_action == "need_confirm" { "审批产物" } else { "自动产物" })
                    .bind(&retry_step_id)
                    .bind(&retry_run_id)
                    .bind(retry_step_index)
                    .bind(now_retry)
                    .bind(now_retry)
                    .bind(&project_id_retry)
                    .bind(&step_role_id)
                    .execute(&pool_retry)
                    .await;

                    // Notify the role to rework
                    let context_msg = format!(
                        "你的产物被驳回，请根据以下意见修改后重新提交：\n{}",
                        retry_comment_for_chat
                    );
                    let event_id = format!("wf_retry_{}_{}", project_id_retry, retry_step_id);
                    let _ = crate::commands::project_execution::auto_delegate_chat(
                        app_retry,
                        project_id_retry,
                        "builtin_user".to_string(),
                        step_role_id,
                        context_msg,
                        event_id,
                        wf_task_id.clone(),
                    ).await;
                });
                }
            }
        }
    }

    let _ = app.emit("workflow_step_confirmed", serde_json::json!({
        "runId": run_id,
        "stepIndex": current_step,
        "approved": approved,
    }));

    crate::commands::helpers::debounced_emit(&app, &project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(&app, &project_id, "artifacts");
    crate::commands::helpers::debounced_emit(&app, &project_id, "tasks");
    crate::commands::helpers::debounced_emit(&app, &project_id, "members");

    Ok(())
}

#[tauri::command]
pub async fn list_workflow_runs(app: AppHandle, project_id: String) -> Result<Vec<db::WorkflowRun>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i64, String, String, String, i64, Option<i64>)>(
        "SELECT id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at FROM workflow_runs WHERE project_id = ? ORDER BY started_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at)| db::WorkflowRun {
        id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at,
    }).collect())
}

#[tauri::command]
pub async fn get_workflow_run_status(app: AppHandle, run_id: String) -> Result<db::WorkflowRunStatus, String> {
    let pool = get_pool(&app)?;

    let run_row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i64, String, String, String, i64, Option<i64>)>(
        "SELECT id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at FROM workflow_runs WHERE id = ?"
    )
    .bind(&run_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Run not found")?;

    let run = db::WorkflowRun {
        id: run_row.0,
        project_id: run_row.1,
        workflow_id: run_row.2,
        group_id: run_row.3,
        current_step: run_row.4,
        status: run_row.5,
        context: run_row.6,
        task_id: run_row.7,
        started_at: run_row.8,
        completed_at: run_row.9,
    };

    let step_rows = sqlx::query_as::<_, (String, String, i64, Option<String>, String, String, String, String, Option<i64>, Option<i64>)>(
        "SELECT id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at FROM workflow_run_steps WHERE run_id = ? ORDER BY step_index ASC"
    )
    .bind(&run_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let steps = step_rows.into_iter().map(|(id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at)| db::WorkflowRunStep {
        id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at,
    }).collect();

    Ok(db::WorkflowRunStatus { run, steps })
}

#[tauri::command]
pub async fn create_artifact_version(app: AppHandle, artifact_id: String) -> Result<db::ArtifactVersion, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let (content, file_path): (String, String) = sqlx::query_as(
        "SELECT content, file_path FROM project_artifacts WHERE id = ?"
    )
    .bind(&artifact_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let max_version: Option<i64> = sqlx::query_scalar(
        "SELECT MAX(version) FROM artifact_versions WHERE artifact_id = ?"
    )
    .bind(&artifact_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let version = max_version.unwrap_or(0) + 1;

    sqlx::query("INSERT INTO artifact_versions (id, artifact_id, version, content, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&artifact_id)
        .bind(version)
        .bind(&content)
        .bind(&file_path)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ArtifactVersion {
        id,
        artifact_id,
        version,
        content,
        file_path,
        created_at: now,
    })
}

#[tauri::command]
pub async fn list_artifact_versions(app: AppHandle, artifact_id: String) -> Result<Vec<db::ArtifactVersion>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, i64, String, String, i64)>(
        "SELECT id, artifact_id, version, content, file_path, created_at FROM artifact_versions WHERE artifact_id = ? ORDER BY version DESC"
    )
    .bind(&artifact_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, artifact_id, version, content, file_path, created_at)| db::ArtifactVersion {
        id, artifact_id, version, content, file_path, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_artifact_version(app: AppHandle, id: String) -> Result<db::ArtifactVersion, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (String, String, i64, String, String, i64)>(
        "SELECT id, artifact_id, version, content, file_path, created_at FROM artifact_versions WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Version not found")?;

    Ok(db::ArtifactVersion {
        id: row.0,
        artifact_id: row.1,
        version: row.2,
        content: row.3,
        file_path: row.4,
        created_at: row.5,
    })
}

#[tauri::command]
pub async fn diff_artifact_versions(app: AppHandle, from_id: String, to_id: String) -> Result<db::ArtifactDiff, String> {
    let from_version = get_artifact_version(app.clone(), from_id).await?;
    let to_version = get_artifact_version(app, to_id).await?;

    let from_lines: Vec<&str> = from_version.content.lines().collect();
    let to_lines: Vec<&str> = to_version.content.lines().collect();

    let mut additions = 0i64;
    let mut deletions = 0i64;
    let mut diff_text = String::new();

    let max_len = from_lines.len().max(to_lines.len());
    for i in 0..max_len {
        let from_line = from_lines.get(i);
        let to_line = to_lines.get(i);
        match (from_line, to_line) {
            (Some(_), None) => { deletions += 1; }
            (None, Some(_)) => { additions += 1; }
            (Some(f), Some(t)) if f != t => { additions += 1; deletions += 1; }
            _ => {}
        }
    }

    if from_version.content != to_version.content {
        diff_text = format!("--- v{}\n+++ v{}\n", from_version.version, to_version.version);
    }

    Ok(db::ArtifactDiff {
        from_version,
        to_version,
        additions,
        deletions,
        diff_text,
    })
}

#[tauri::command]
pub async fn bind_role_skill(app: AppHandle, role_id: String, skill_name: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT OR IGNORE INTO role_skills (id, role_id, skill_name, enabled, created_at) VALUES (?, ?, ?, 1, ?)")
        .bind(&id)
        .bind(&role_id)
        .bind(&skill_name)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unbind_role_skill(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM role_skills WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_role_skills(app: AppHandle, role_id: String) -> Result<Vec<db::RoleSkill>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, bool, i64)>(
        "SELECT id, role_id, skill_name, enabled, created_at FROM role_skills WHERE role_id = ? ORDER BY created_at ASC"
    )
    .bind(&role_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, role_id, skill_name, enabled, created_at)| db::RoleSkill {
        id, role_id, skill_name, enabled, created_at,
    }).collect())
}

// ========== 项目成员技能管理 ==========

#[tauri::command]
pub async fn bind_member_skill(app: AppHandle, project_id: String, member_id: String, skill_name: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT OR IGNORE INTO project_member_skills (id, project_id, member_id, skill_name, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)")
        .bind(&id)
        .bind(&project_id)
        .bind(&member_id)
        .bind(&skill_name)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unbind_member_skill(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_member_skills WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_member_skills(app: AppHandle, project_id: String, member_id: String) -> Result<Vec<db::ProjectMemberSkill>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, bool, i64)>(
        "SELECT id, project_id, member_id, skill_name, enabled, created_at FROM project_member_skills WHERE project_id = ? AND member_id = ? ORDER BY created_at ASC"
    )
    .bind(&project_id)
    .bind(&member_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, member_id, skill_name, enabled, created_at)| db::ProjectMemberSkill {
        id, project_id, member_id, skill_name, enabled, created_at,
    }).collect())
}

// ========== 任务进度查询 ==========

#[tauri::command]
pub async fn get_task_progress(app: AppHandle, task_id: String) -> Result<db::TaskProgress, String> {
    let pool = get_pool(&app)?;

    // 查询任务信息
    let task_row = sqlx::query(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at FROM project_tasks WHERE id = ?"
    )
    .bind(&task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let task = {
        let row = task_row.ok_or("Task not found")?;
        let id: String = row.try_get("id").map_err(|e| e.to_string())?;
        let project_id: String = row.try_get("project_id").map_err(|e| e.to_string())?;
        let title: String = row.try_get("title").map_err(|e| e.to_string())?;
        let body: String = row.try_get("body").map_err(|e| e.to_string())?;
        let assignee: String = row.try_get("assignee").map_err(|e| e.to_string())?;
        let status: String = row.try_get("status").map_err(|e| e.to_string())?;
        let priority: i32 = row.try_get("priority").map_err(|e| e.to_string())?;
        let parent_task_id: Option<String> = row.try_get("parent_task_id").map_err(|e| e.to_string())?;
        let artifact_id: Option<String> = row.try_get("artifact_id").map_err(|e| e.to_string())?;
        let result: String = row.try_get("result").map_err(|e| e.to_string())?;
        let claim_lock: String = row.try_get("claim_lock").map_err(|e| e.to_string())?;
        let claim_expire_at: i64 = row.try_get("claim_expire_at").map_err(|e| e.to_string())?;
        let started_at: Option<i64> = row.try_get("started_at").map_err(|e| e.to_string())?;
        let completed_at: Option<i64> = row.try_get("completed_at").map_err(|e| e.to_string())?;
        let skills: String = row.try_get("skills").map_err(|e| e.to_string())?;
        let max_retries: i32 = row.try_get("max_retries").map_err(|e| e.to_string())?;
        let retry_count: i32 = row.try_get("retry_count").map_err(|e| e.to_string())?;
        let workspace_kind: String = row.try_get("workspace_kind").map_err(|e| e.to_string())?;
        let workspace_path: String = row.try_get("workspace_path").map_err(|e| e.to_string())?;
        let board_id: String = row.try_get("board_id").map_err(|e| e.to_string())?;
        let workflow_group_id: Option<String> = row.try_get("workflow_group_id").map_err(|e| e.to_string())?;
        let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;
        let updated_at: i64 = row.try_get("updated_at").map_err(|e| e.to_string())?;
        db::ProjectTask {
            id, project_id, title, body, assignee, status, priority,
            parent_task_id: parent_task_id.unwrap_or_default(),
            artifact_id: artifact_id.unwrap_or_default(),
            result, claim_lock, claim_expire_at, started_at, completed_at,
            skills, max_retries, retry_count, workspace_kind, workspace_path,
            board_id, workflow_group_id, created_at, updated_at,
        }
    };

    // 查询关联的工作流运行
    let workflow_run = if !task.workflow_group_id.as_ref().map_or(true, |s| s.is_empty()) {
        let run_row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, i64, String, String, String, i64, Option<i64>)>(
            "SELECT id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at FROM workflow_runs WHERE task_id = ? ORDER BY started_at DESC LIMIT 1"
        )
        .bind(&task_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at)) = run_row {
            // 查询工作流步骤
            let step_rows = sqlx::query_as::<_, (String, String, i64, Option<String>, String, String, String, String, Option<i64>, Option<i64>)>(
                "SELECT id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at FROM workflow_run_steps WHERE run_id = ? ORDER BY step_index ASC"
            )
            .bind(&id)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

            let steps = step_rows.into_iter().map(|(id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at)| db::WorkflowRunStep {
                id, run_id, step_index, role_id, action, status, input, output, started_at, completed_at,
            }).collect();

            Some(db::WorkflowRunStatus {
                run: db::WorkflowRun {
                    id, project_id, workflow_id, group_id, current_step, status, context, task_id, started_at, completed_at,
                },
                steps,
            })
        } else {
            None
        }
    } else {
        None
    };

    // 查询任务相关的产物
    let artifact_rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, Option<String>, Option<i32>, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at FROM project_artifacts WHERE task_id = ? ORDER BY created_at DESC"
    )
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let artifacts = artifact_rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at)| db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at,
    }).collect();

    // 查询任务相关的最近活动
    let activity_rows = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, String, i64)>(
        "SELECT id, project_id, role_id, action, target_type, target_id, detail, created_at FROM project_activities WHERE project_id = ? AND target_id = ? ORDER BY created_at DESC LIMIT 10"
    )
    .bind(&task.project_id)
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let activities = activity_rows.into_iter().map(|(id, project_id, role_id, action, target_type, target_id, detail, created_at)| db::ProjectActivity {
        id, project_id, role_id, action, target_type, target_id, detail, created_at,
    }).collect();

    Ok(db::TaskProgress {
        task,
        workflow_run,
        artifacts,
        activities,
    })
}

// ========== 待审核任务列表 ==========

#[tauri::command]
pub async fn list_pending_review_tasks(app: AppHandle, project_id: String) -> Result<Vec<db::PendingReviewTask>, String> {
    let pool = get_pool(&app)?;

    // 查询所有 submitted 状态的产物（包括无 task_id 的）
    let artifact_rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, Option<String>, Option<i32>, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at FROM project_artifacts WHERE project_id = ? AND status = 'submitted' ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // 按 task_id 分组
    let mut grouped: std::collections::HashMap<String, Vec<db::ProjectArtifact>> = std::collections::HashMap::new();
    for row in artifact_rows {
        let (id, pid, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) = row;
        let artifact = db::ProjectArtifact {
            id, project_id: pid, role_id, task_id: task_id.clone(), artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at,
        };
        grouped.entry(task_id.clone()).or_default().push(artifact);
    }

    let mut result = Vec::new();
    for (tid, pending_artifacts) in grouped {
        if tid.is_empty() {
            // 无关联任务的产物，构造虚拟任务
            let first_artifact = &pending_artifacts[0];
            let virtual_task = db::ProjectTask {
                id: format!("__virtual_{}", first_artifact.id),
                project_id: project_id.clone(),
                title: first_artifact.title.clone(),
                body: String::new(),
                assignee: first_artifact.role_id.clone(),
                status: "running".to_string(),
                priority: 0,
                parent_task_id: String::new(),
                artifact_id: String::new(),
                result: String::new(),
                claim_lock: String::new(),
                claim_expire_at: 0,
                started_at: None,
                completed_at: None,
                skills: String::new(),
                max_retries: 0,
                retry_count: 0,
                workspace_kind: String::new(),
                workspace_path: String::new(),
                board_id: String::new(),
                workflow_group_id: None,
                created_at: first_artifact.created_at,
                updated_at: first_artifact.updated_at,
            };
            result.push(db::PendingReviewTask {
                task: virtual_task,
                pending_artifacts,
            });
        } else {
            // 有关联任务的产物
            let task_row = sqlx::query(
                "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at FROM project_tasks WHERE id = ?"
            )
            .bind(&tid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(row) = task_row {
                let task = {
                    let id: String = row.try_get("id").map_err(|e| e.to_string())?;
                    let project_id: String = row.try_get("project_id").map_err(|e| e.to_string())?;
                    let title: String = row.try_get("title").map_err(|e| e.to_string())?;
                    let body: String = row.try_get("body").map_err(|e| e.to_string())?;
                    let assignee: String = row.try_get("assignee").map_err(|e| e.to_string())?;
                    let status: String = row.try_get("status").map_err(|e| e.to_string())?;
                    let priority: i32 = row.try_get("priority").map_err(|e| e.to_string())?;
                    let parent_task_id: Option<String> = row.try_get("parent_task_id").map_err(|e| e.to_string())?;
                    let artifact_id: Option<String> = row.try_get("artifact_id").map_err(|e| e.to_string())?;
                    let result: String = row.try_get("result").map_err(|e| e.to_string())?;
                    let claim_lock: String = row.try_get("claim_lock").map_err(|e| e.to_string())?;
                    let claim_expire_at: i64 = row.try_get("claim_expire_at").map_err(|e| e.to_string())?;
                    let started_at: Option<i64> = row.try_get("started_at").map_err(|e| e.to_string())?;
                    let completed_at: Option<i64> = row.try_get("completed_at").map_err(|e| e.to_string())?;
                    let skills: String = row.try_get("skills").map_err(|e| e.to_string())?;
                    let max_retries: i32 = row.try_get("max_retries").map_err(|e| e.to_string())?;
                    let retry_count: i32 = row.try_get("retry_count").map_err(|e| e.to_string())?;
                    let workspace_kind: String = row.try_get("workspace_kind").map_err(|e| e.to_string())?;
                    let workspace_path: String = row.try_get("workspace_path").map_err(|e| e.to_string())?;
                    let board_id: String = row.try_get("board_id").map_err(|e| e.to_string())?;
                    let workflow_group_id: Option<String> = row.try_get("workflow_group_id").map_err(|e| e.to_string())?;
                    let created_at: i64 = row.try_get("created_at").map_err(|e| e.to_string())?;
                    let updated_at: i64 = row.try_get("updated_at").map_err(|e| e.to_string())?;
                    db::ProjectTask {
                        id, project_id, title, body, assignee, status, priority,
                        parent_task_id: parent_task_id.unwrap_or_default(),
                        artifact_id: artifact_id.unwrap_or_default(),
                        result, claim_lock, claim_expire_at, started_at, completed_at,
                        skills, max_retries, retry_count, workspace_kind, workspace_path,
                        board_id, workflow_group_id, created_at, updated_at,
                    }
                };
                result.push(db::PendingReviewTask {
                    task,
                    pending_artifacts,
                });
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn list_project_activities(app: AppHandle, project_id: String, limit: Option<i64>) -> Result<Vec<db::ProjectActivity>, String> {
    let pool = get_pool(&app)?;
    let limit = limit.unwrap_or(50);

    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, String, i64)>(
        "SELECT id, project_id, role_id, action, target_type, target_id, detail, created_at FROM project_activities WHERE project_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .bind(&project_id)
    .bind(limit)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, action, target_type, target_id, detail, created_at)| db::ProjectActivity {
        id, project_id, role_id, action, target_type, target_id, detail, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_stats(app: AppHandle, project_id: String) -> Result<db::ProjectStats, String> {
    let pool = get_pool(&app)?;

    let task_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM project_tasks WHERE project_id = ? GROUP BY status"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut by_status = std::collections::HashMap::new();
    let mut total: i64 = 0;
    let mut done_count: i64 = 0;
    for (status, count) in &task_rows {
        by_status.insert(status.clone(), *count);
        total += count;
        if status == "done" {
            done_count = *count;
        }
    }
    let completion_rate = if total > 0 { done_count as f64 / total as f64 } else { 0.0 };

    let artifact_rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT status, COUNT(*) FROM project_artifacts WHERE project_id = ? GROUP BY status"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut artifact_by_status = std::collections::HashMap::new();
    let mut artifact_total: i64 = 0;
    let mut approved_count: i64 = 0;
    for (status, count) in &artifact_rows {
        artifact_by_status.insert(status.clone(), *count);
        artifact_total += count;
        if status == "approved" {
            approved_count = *count;
        }
    }
    let approval_rate = if artifact_total > 0 { approved_count as f64 / artifact_total as f64 } else { 0.0 };

    let workload_rows: Vec<(String, String, i64, i64)> = sqlx::query_as(
        "SELECT t.assignee, r.name, COUNT(*), SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) FROM project_tasks t LEFT JOIN ai_roles r ON t.assignee = r.id WHERE t.project_id = ? AND t.assignee != '' GROUP BY t.assignee"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let role_workload: Vec<db::RoleWorkload> = workload_rows.into_iter().map(|(role_id, name, task_count, completed_count)| db::RoleWorkload {
        role_id,
        name,
        task_count,
        completed_count,
        avg_duration: 0,
    }).collect();

    let health_score = if total > 0 {
        ((completion_rate * 60.0) + (approval_rate * 40.0)) as i64
    } else {
        100
    };

    Ok(db::ProjectStats {
        task_stats: db::TaskStats {
            total,
            by_status,
            completion_rate,
        },
        artifact_stats: db::ArtifactStats {
            total: artifact_total,
            by_status: artifact_by_status,
            approval_rate,
        },
        role_workload,
        health_score,
    })
}

#[tauri::command]
pub async fn create_project_memory(app: AppHandle, req: db::CreateProjectMemoryRequest) -> Result<db::ProjectMemory, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let category = req.category.unwrap_or_else(|| "general".to_string());
    let importance = req.importance.unwrap_or(0);

    sqlx::query("INSERT INTO project_memories (id, project_id, role_id, category, content, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&category)
        .bind(&req.content)
        .bind(importance)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectMemory {
        id,
        project_id: req.project_id,
        role_id: req.role_id,
        category,
        content: req.content,
        importance,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_project_memories(app: AppHandle, project_id: String, role_id: Option<String>, category: Option<String>) -> Result<Vec<db::ProjectMemory>, String> {
    let pool = get_pool(&app)?;

    let rows = match (&role_id, &category) {
        (Some(rid), Some(cat)) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND role_id = ? AND category = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(rid).bind(cat)
            .fetch_all(&pool).await
        }
        (Some(rid), None) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND role_id = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(rid)
            .fetch_all(&pool).await
        }
        (None, Some(cat)) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? AND category = ? ORDER BY importance DESC, updated_at DESC"
            )
            .bind(&project_id).bind(cat)
            .fetch_all(&pool).await
        }
        (None, None) => {
            sqlx::query_as::<_, (String, String, String, String, String, i64, i64, i64)>(
                "SELECT id, project_id, role_id, category, content, importance, created_at, updated_at FROM project_memories WHERE project_id = ? ORDER BY importance DESC, updated_at DESC LIMIT 50"
            )
            .bind(&project_id)
            .fetch_all(&pool).await
        }
    }.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, category, content, importance, created_at, updated_at)| db::ProjectMemory {
        id, project_id, role_id, category, content, importance, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn delete_project_memory(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_memories WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_file_records(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectFileRecord>, String> {
    let pool = get_pool(&app)?;
    let rows: Vec<(String, String, String, String, String, String, String, i64, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at FROM project_file_records WHERE project_id = ? AND status = 'active' ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at)| db::ProjectFileRecord {
        id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_file_record(app: AppHandle, req: db::CreateFileRecordRequest) -> Result<db::ProjectFileRecord, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let id = uuid::Uuid::new_v4().to_string();
    let file_ext = req.file_ext.unwrap_or_else(|| {
        req.file_name.rsplit('.').next().unwrap_or("").to_string()
    });
    let file_size = req.file_size.unwrap_or(0);
    let description = req.description.unwrap_or_default();
    let task_id = req.task_id.unwrap_or_default();

    sqlx::query(
        "INSERT INTO project_file_records (id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)"
    )
    .bind(&id)
    .bind(&req.project_id)
    .bind(&req.role_id)
    .bind(&task_id)
    .bind(&req.file_path)
    .bind(&req.file_name)
    .bind(&file_ext)
    .bind(file_size)
    .bind(&description)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(db::ProjectFileRecord {
        id, project_id: req.project_id, role_id: req.role_id, task_id, file_path: req.file_path, file_name: req.file_name, file_ext, file_size, description, status: "active".to_string(), created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn delete_project_file_record(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("UPDATE project_file_records SET status = 'deleted', updated_at = ? WHERE id = ?")
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn cleanup_invalid_file_records(app: AppHandle, project_id: String) -> Result<u64, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let excluded_patterns = ["node_modules", ".git\\", ".git/", "\\dist\\", "/dist/", "\\build\\", "/build/", "\\target\\", "/target/", "\\__pycache__\\", "/__pycache__/"];

    let all_records: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, file_path FROM project_file_records WHERE project_id = ? AND status = 'active'"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut deleted_count = 0u64;
    for (id, file_path) in &all_records {
        let should_delete = excluded_patterns.iter().any(|p| file_path.contains(p));
        if should_delete {
            let _ = sqlx::query(
                "UPDATE project_file_records SET status = 'deleted', updated_at = ? WHERE id = ?"
            )
            .bind(now)
            .bind(id)
            .execute(&pool)
            .await;
            deleted_count += 1;
        }
    }

    if deleted_count > 0 {
        log::info!("cleanup_invalid_file_records: project={}, deleted {} invalid file records", project_id, deleted_count);
    }

    Ok(deleted_count)
}

#[tauri::command]
pub async fn scan_project_files(app: AppHandle, project_id: String, role_id: Option<String>) -> Result<Vec<db::ProjectFileRecord>, String> {
    let pool = get_pool(&app)?;

    let workspace_path: (String,) = sqlx::query_as(
        "SELECT workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace = workspace_path.0;
    if workspace.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let workspace_dir = std::path::Path::new(&workspace);
    if !workspace_dir.exists() {
        return Ok(vec![]);
    }

    let existing_paths: Vec<String> = sqlx::query_scalar(
        "SELECT file_path FROM project_file_records WHERE project_id = ? AND status = 'active'"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_set: std::collections::HashSet<String> = existing_paths.into_iter().collect();
    let mut new_records: Vec<db::ProjectFileRecord> = Vec::new();
    let default_role = role_id.clone().unwrap_or_default();

    if let Ok(entries) = scan_dir_recursive(workspace_dir, workspace_dir, 0) {
        for (relative_path, file_name, file_size) in entries {
            if existing_set.contains(&relative_path) {
                continue;
            }
            if file_name.starts_with('.') {
                continue;
            }
            let file_ext = file_name.rsplit('.').next().unwrap_or("").to_string();
            let now = chrono::Utc::now().timestamp_millis();
            let id = uuid::Uuid::new_v4().to_string();

            sqlx::query(
                "INSERT INTO project_file_records (id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, ?, ?, '', 'active', ?, ?)"
            )
            .bind(&id)
            .bind(&project_id)
            .bind(&default_role)
            .bind(&relative_path)
            .bind(&file_name)
            .bind(&file_ext)
            .bind(file_size as i64)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            new_records.push(db::ProjectFileRecord {
                id, project_id: project_id.clone(), role_id: default_role.clone(), task_id: String::new(), file_path: relative_path, file_name, file_ext, file_size: file_size as i64, description: String::new(), status: "active".to_string(), created_at: now, updated_at: now,
            });
        }
    }

    Ok(new_records)
}

fn scan_dir_recursive(base: &std::path::Path, dir: &std::path::Path, depth: u32) -> Result<Vec<(String, String, u64)>, String> {
    if depth > 20 {
        return Ok(Vec::new());
    }
    let mut results = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    let excluded_dirs = ["node_modules", ".git", "dist", "build", "target", "__pycache__", ".next", ".nuxt", "vendor", "Pods"];

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        if file_name.starts_with('.') || excluded_dirs.contains(&file_name.as_str()) {
            continue;
        }

        if path.is_dir() {
            let is_symlink = std::fs::symlink_metadata(&path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
            if is_symlink {
                continue;
            }
            let sub_results = scan_dir_recursive(base, &path, depth + 1)?;
            results.extend(sub_results);
        } else {
            let full_path = path.to_string_lossy().to_string();
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            results.push((full_path, file_name, size));
        }
    }

    Ok(results)
}

// 合并查询全局角色技能和项目成员技能，去重后返回
async fn get_merged_skills(pool: &sqlx::SqlitePool, project_id: &str, role_id: &str) -> Vec<String> {
    let mut skill_set = std::collections::HashSet::new();

    // 全局角色技能
    let role_skills: Vec<String> = sqlx::query_scalar(
        "SELECT skill_name FROM role_skills WHERE role_id = ? AND enabled = 1"
    )
    .bind(role_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for s in &role_skills {
        skill_set.insert(s.clone());
    }

    // 项目成员技能（通过 project_members 关联 member_id）
    let member_skills: Vec<String> = sqlx::query_scalar(
        "SELECT pms.skill_name FROM project_member_skills pms \
         INNER JOIN project_members pm ON pms.member_id = pm.id \
         WHERE pm.project_id = ? AND pm.role_id = ? AND pms.enabled = 1"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    for s in &member_skills {
        skill_set.insert(s.clone());
    }

    let mut result: Vec<String> = skill_set.into_iter().collect();
    result.sort();
    result
}

// 递归扫描目录，返回相对路径的 HashSet（用于对比 Agent 前后文件变化）
fn scan_dir_recursive_set(base: &std::path::Path, dir: &std::path::Path) -> std::collections::HashSet<String> {
    let mut results = std::collections::HashSet::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return results,
    };
    let excluded_dirs = ["node_modules", ".git", "dist", "build", "target", "__pycache__", ".next", ".nuxt", "vendor", "Pods"];

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

        if file_name.starts_with('.') || excluded_dirs.contains(&file_name.as_str()) {
            continue;
        }

        if path.is_dir() {
            results.extend(scan_dir_recursive_set(base, &path));
        } else if let Ok(relative) = path.strip_prefix(base) {
            results.insert(relative.to_string_lossy().to_string());
        }
    }

    results
}

#[tauri::command]
pub async fn record_chat_files(app: AppHandle, project_id: String, role_id: String, task_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let effective_task_id = if task_id.is_empty() {
        sqlx::query_scalar(
            "SELECT id FROM project_tasks WHERE project_id = ? AND status IN ('running', 'ready') ORDER BY updated_at DESC LIMIT 1"
        )
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None)
        .unwrap_or_default()
    } else {
        task_id
    };

    let workspace_path: (String,) = sqlx::query_as(
        "SELECT workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace = workspace_path.0;
    if workspace.is_empty() {
        return Ok(());
    }

    let workspace_dir = std::path::Path::new(&workspace);
    if !workspace_dir.exists() {
        return Ok(());
    }

    let existing_records: Vec<(String, String)> = sqlx::query_as(
        "SELECT file_path, role_id FROM project_file_records WHERE project_id = ? AND status = 'active'"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let existing_set: std::collections::HashSet<String> = existing_records.iter().map(|(p, _)| p.clone()).collect();

    if !role_id.is_empty() {
        for (path, rid) in &existing_records {
            if rid.is_empty() {
                let _ = sqlx::query(
                    "UPDATE project_file_records SET role_id = ? WHERE project_id = ? AND file_path = ? AND status = 'active' AND (role_id IS NULL OR role_id = '')"
                )
                .bind(&role_id)
                .bind(&project_id)
                .bind(path)
                .execute(&pool)
                .await;
            }
        }
    }

    if let Ok(entries) = scan_dir_recursive(workspace_dir, workspace_dir, 0) {
        let now = chrono::Utc::now().timestamp_millis();
        for (relative_path, file_name, file_size) in entries {
            if existing_set.contains(&relative_path) {
                continue;
            }
            if file_name.starts_with('.') {
                continue;
            }
            let file_ext = file_name.rsplit('.').next().unwrap_or("").to_string();
            let id = uuid::Uuid::new_v4().to_string();

            let _ = sqlx::query(
                "INSERT INTO project_file_records (id, project_id, role_id, task_id, file_path, file_name, file_ext, file_size, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 'active', ?, ?)"
            )
            .bind(&id)
            .bind(&project_id)
            .bind(&role_id)
            .bind(&effective_task_id)
            .bind(&relative_path)
            .bind(&file_name)
            .bind(&file_ext)
            .bind(file_size as i64)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await;
        }
    }

    Ok(())
}
