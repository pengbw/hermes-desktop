use crate::commands::project::{get_pool, record_activity, repair_legacy_software_dev_workflow};
use crate::crypto::file_storage;
use crate::crypto::key_manager;
use crate::database::models as db;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::{AppHandle, Emitter};

use super::project_execution::{auto_delegate_chat, start_workflow_run, confirm_workflow_step};

async fn get_conversation_storage_path_from_pool(pool: &sqlx::SqlitePool) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'conversation_storage_path'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

async fn ensure_key_initialized_from_pool(pool: &sqlx::SqlitePool) -> Result<(), String> {
    if key_manager::get_cached_key().is_some() {
        return Ok(());
    }
    let storage_path = get_conversation_storage_path_from_pool(pool).await;
    key_manager::init_or_load_key(storage_path.as_deref())?;
    Ok(())
}
#[tauri::command]
pub async fn list_project_workflows(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;
    repair_legacy_software_dev_workflow(&pool, Some(&project_id)).await?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at,
    }).collect())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowExecutionResult {
    pub triggered_workflows: Vec<TriggeredWorkflow>,
    pub pending_approvals: Vec<PendingApproval>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TriggeredWorkflow {
    pub to_role_id: String,
    pub to_role_name: String,
    pub artifact_type: String,
    pub transition_type: String,
    pub artifact_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub artifact_id: String,
    pub from_role_id: String,
    pub to_role_id: String,
    pub artifact_type: String,
}

#[tauri::command]
pub async fn trigger_workflow_execution(app: AppHandle, project_id: String, from_role_id: String, artifact_type: Option<String>, condition_result: Option<String>, skip_need_confirm: Option<bool>, workflow_run_id: Option<String>, step_index: Option<i32>) -> Result<WorkflowExecutionResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let should_skip_need_confirm = skip_need_confirm.unwrap_or(false);
    // When from_role_id is empty, it represents the start node (initial trigger)
    let is_start_trigger = from_role_id == "start";
    log::info!("trigger_workflow_execution: project_id={}, from_role_id={}, is_start_trigger={}, artifact_type={:?}, skip_need_confirm={}", project_id, from_role_id, is_start_trigger, artifact_type, should_skip_need_confirm);

    let mut found_task_id: Option<String> = None;
    if let Some(ref run_id) = workflow_run_id {
        found_task_id = sqlx::query_scalar("SELECT task_id FROM workflow_runs WHERE id = ?")
            .bind(run_id)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
    }
    
    if found_task_id.is_none() || found_task_id.as_deref() == Some("") {
        found_task_id = sqlx::query_scalar("SELECT task_id FROM workflow_runs WHERE status = 'running' AND project_id = ? ORDER BY started_at DESC LIMIT 1")
            .bind(&project_id)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
    }

    if found_task_id.is_none() || found_task_id.as_deref() == Some("") {
        found_task_id = sqlx::query_scalar(
            "SELECT id FROM project_tasks WHERE project_id = ? AND status IN ('running', 'ready') ORDER BY updated_at DESC LIMIT 1"
        )
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if let Some(ref ftid) = found_task_id {
            if let Some(ref run_id) = workflow_run_id {
                let _ = sqlx::query("UPDATE workflow_runs SET task_id = ? WHERE id = ? AND (task_id IS NULL OR task_id = '')")
                    .bind(ftid)
                    .bind(run_id)
                    .execute(&pool)
                    .await;
                log::info!("trigger_workflow_execution: backfilled task_id={} for workflow_run={}", ftid, run_id);
            }
        }
    }

    let effective_task_id = found_task_id.clone().unwrap_or_default();

    // Build query based on the trigger type:
    // - Start trigger (from_role_id == "start"): only match workflows where from_role_id is "start"
    // - Normal role trigger: only match workflows from this role (do NOT re-match start transitions)
    let mut query_str = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, sort_order, created_at FROM project_workflows WHERE project_id = ?");
    if is_start_trigger {
        query_str.push_str(" AND from_role_id = 'start'");
    } else {
        query_str.push_str(" AND from_role_id = ?");
    }
    let mut bind_artifact: Option<String> = None;
    if artifact_type.is_some() {
        query_str.push_str(" AND artifact_type = ?");
        bind_artifact = artifact_type.clone();
    }
    query_str.push_str(" ORDER BY sort_order ASC");
    log::info!("trigger_workflow_execution: query={}", query_str);

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, i64, i64)>(&query_str)
        .bind(&project_id);
    if !is_start_trigger {
        q = q.bind(&from_role_id);
    }
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let workflows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut triggered = Vec::new();
    let mut pending = Vec::new();

    let condition_workflows: Vec<_> = workflows.iter()
        .filter(|(_, _, _, _, _, transition_type, _, condition_expr, _, _, _, _)| {
            transition_type == "condition" && !condition_expr.is_empty()
        })
        .collect();

    let parallel_workflows: Vec<_> = workflows.iter()
        .filter(|(_, _, _, _, _, transition_type, _, _, _, parallel_group, _, _)| {
            transition_type == "parallel" && !parallel_group.is_empty()
        })
        .collect();

    let condition_or_parallel_ids: std::collections::HashSet<String> = condition_workflows.iter()
        .chain(parallel_workflows.iter())
        .map(|(id, _, _, _, _, _, _, _, _, _, _, _)| id.clone())
        .collect();

    for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, transition_type, task_id, _condition_expr, _branch_label, _parallel_group, _sort_order, _created_at) in &workflows {
        if condition_or_parallel_ids.contains(_id) {
            continue;
        }

        if to_role_id == "end" {
            continue;
        }

        let to_role: Option<(String, String)> = sqlx::query_as(
            "SELECT name, nickname FROM ai_roles WHERE id = ?"
        )
        .bind(to_role_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let to_role_name = to_role.as_ref()
            .map(|(name, nickname)| {
                if nickname.is_empty() { name.clone() } else { nickname.clone() }
            })
            .unwrap_or_else(|| to_role_id.clone());

        if !task_id.is_empty() {
            let task_title: Option<String> = sqlx::query_scalar(
                "SELECT title FROM project_tasks WHERE id = ?"
            )
            .bind(task_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(title) = task_title {
                let existing_dispatch: Option<(String,)> = sqlx::query_as(
                    "SELECT id FROM task_dispatches WHERE task_id = ? AND role_id = ? AND status = 'sent'"
                )
                .bind(task_id)
                .bind(to_role_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                if existing_dispatch.is_none() {
                    let dispatch_id = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                    )
                    .bind(&dispatch_id)
                    .bind(task_id)
                    .bind(to_role_id)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    sqlx::query(
                        "UPDATE project_tasks SET assignee = ?, status = 'ready', started_at = COALESCE(started_at, ?), claim_lock = ?, claim_expire_at = ?, updated_at = ? WHERE id = ?"
                    )
                    .bind(to_role_id)
                    .bind(now)
                    .bind(to_role_id)
                    .bind(now + 30 * 60 * 1000)
                    .bind(now)
                    .bind(task_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    let _ = record_activity(&app, &project_id, Some(to_role_id), "task_workflow_dispatched", Some("task"), Some(task_id), &format!("工作流驱动派发任务：{}", title)).await;
                }
            }
        }

        // Check for existing artifact to avoid duplicates
        // Look for both in_progress and pending artifacts
        let existing_artifact: Option<(String, String)> = sqlx::query_as(
            "SELECT id, status FROM project_artifacts WHERE project_id = ? AND task_id = ? AND role_id = ? AND artifact_type = ? AND status IN ('in_progress', 'pending')"
        )
        .bind(&project_id)
        .bind(&effective_task_id)
        .bind(to_role_id)
        .bind(wf_artifact_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((existing_id, existing_status)) = existing_artifact {
            if existing_status == "pending" && !should_skip_need_confirm && transition_type == "need_confirm" {
                // Pending artifact exists and this is an approval trigger - activate it
                sqlx::query("UPDATE project_artifacts SET status = 'in_progress', updated_at = ? WHERE id = ?")
                    .bind(now)
                    .bind(&existing_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                log::info!("trigger_workflow_execution: activated pending artifact {} for role={}, artifact_type={}", existing_id, to_role_id, wf_artifact_type);

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: transition_type.clone(),
                    artifact_id: existing_id,
                });
            } else {
                log::info!("trigger_workflow_execution: skipping artifact creation for role={}, artifact_type={} (already exists, status={})", to_role_id, wf_artifact_type, existing_status);
                if existing_status == "in_progress" {
                    triggered.push(TriggeredWorkflow {
                        to_role_id: to_role_id.clone(),
                        to_role_name,
                        artifact_type: wf_artifact_type.clone(),
                        transition_type: transition_type.clone(),
                        artifact_id: existing_id,
                    });
                }
            }
            continue;
        }

        let new_artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

        match transition_type.as_str() {
            "auto_push" => {
                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'in_progress', '', ?, ?, ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(&effective_task_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
                .bind(&workflow_run_id)
                .bind(&step_index)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: transition_type.clone(),
                    artifact_id: new_artifact_id,
                });
            }
            "need_confirm" => {
                if should_skip_need_confirm {
                    sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'pending', '', ?, ?, ?, ?)"
                    )
                    .bind(&new_artifact_id)
                    .bind(&project_id)
                    .bind(to_role_id)
                    .bind(&effective_task_id)
                    .bind(wf_artifact_type)
                    .bind(&artifact_title)
                    .bind(&workflow_run_id)
                    .bind(&step_index)
                    .bind(now)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    pending.push(PendingApproval {
                        artifact_id: new_artifact_id,
                        from_role_id: from_role_id.clone(),
                        to_role_id: to_role_id.clone(),
                        artifact_type: wf_artifact_type.clone(),
                    });
                } else {
                    sqlx::query(
                        "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'in_progress', '', ?, ?, ?, ?)"
                    )
                    .bind(&new_artifact_id)
                    .bind(&project_id)
                    .bind(to_role_id)
                    .bind(&effective_task_id)
                    .bind(wf_artifact_type)
                    .bind(&artifact_title)
                    .bind(&workflow_run_id)
                    .bind(&step_index)
                    .bind(now)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    triggered.push(TriggeredWorkflow {
                        to_role_id: to_role_id.clone(),
                        to_role_name: to_role_name.clone(),
                        artifact_type: wf_artifact_type.clone(),
                        transition_type: "need_confirm".to_string(),
                        artifact_id: new_artifact_id.clone(),
                    });
                }
            }
            _ => {}
        }
    }

    if !condition_workflows.is_empty() {
        let chosen_branch = condition_result.as_deref().unwrap_or("yes");
        for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, _transition_type, task_id, _condition_expr, branch_label, _parallel_group, _sort_order, _created_at) in &condition_workflows {
            if branch_label != chosen_branch {
                continue;
            }

            if to_role_id == "end" {
                continue;
            }

            let to_role: Option<(String, String)> = sqlx::query_as(
                "SELECT name, nickname FROM ai_roles WHERE id = ?"
            )
            .bind(to_role_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            let to_role_name = to_role.as_ref()
                .map(|(name, nickname)| if nickname.is_empty() { name.clone() } else { nickname.clone() })
                .unwrap_or_else(|| to_role_id.clone());

            if !task_id.is_empty() {
                let dispatch_id = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                )
                .bind(&dispatch_id)
                .bind(task_id)
                .bind(to_role_id)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                let _ = record_activity(&app, &project_id, Some(to_role_id), "condition_branch_taken", Some("workflow"), None, &format!("条件分支 [{}] → {}", branch_label, to_role_name)).await;
            }

            let new_artifact_id = uuid::Uuid::new_v4().to_string();
            let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

            sqlx::query(
                "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'in_progress', '', ?, ?, ?, ?)"
            )
            .bind(&new_artifact_id)
            .bind(&project_id)
            .bind(to_role_id)
            .bind(&effective_task_id)
            .bind(wf_artifact_type)
            .bind(&artifact_title)
            .bind(&workflow_run_id)
            .bind(&step_index)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            triggered.push(TriggeredWorkflow {
                to_role_id: to_role_id.clone(),
                to_role_name,
                artifact_type: wf_artifact_type.clone(),
                transition_type: "condition".to_string(),
                artifact_id: new_artifact_id,
            });
        }
    }

    if !parallel_workflows.is_empty() {
        let mut parallel_groups: std::collections::HashMap<String, Vec<_>> = std::collections::HashMap::new();
        for wf in &parallel_workflows {
            let (_, _, _, _, _, _, _, _, _, parallel_group, _, _) = wf;
            parallel_groups.entry(parallel_group.clone()).or_default().push(wf);
        }

        for (_group_key, group_workflows) in parallel_groups {
            for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, _transition_type, task_id, _condition_expr, _branch_label, _parallel_group, _sort_order, _created_at) in group_workflows {
                if to_role_id == "end" {
                    continue;
                }
                
                let to_role: Option<(String, String)> = sqlx::query_as(
                    "SELECT name, nickname FROM ai_roles WHERE id = ?"
                )
                .bind(to_role_id)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                let to_role_name = to_role.as_ref()
                    .map(|(name, nickname)| if nickname.is_empty() { name.clone() } else { nickname.clone() })
                    .unwrap_or_else(|| to_role_id.clone());

                if !task_id.is_empty() {
                    let dispatch_id = uuid::Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, 'workflow', '', 'sent', ?)"
                    )
                    .bind(&dispatch_id)
                    .bind(task_id)
                    .bind(to_role_id)
                    .bind(now)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                    let _ = record_activity(&app, &project_id, Some(to_role_id), "parallel_branch_triggered", Some("workflow"), None, &format!("并行分支触发 → {}", to_role_name)).await;
                }

                let new_artifact_id = uuid::Uuid::new_v4().to_string();
                let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'in_progress', '', ?, ?, ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(&effective_task_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
                .bind(&workflow_run_id)
                .bind(&step_index)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                triggered.push(TriggeredWorkflow {
                    to_role_id: to_role_id.clone(),
                    to_role_name,
                    artifact_type: wf_artifact_type.clone(),
                    transition_type: "parallel".to_string(),
                    artifact_id: new_artifact_id,
                });
            }
        }
    }

    let mut run_task_info: Option<(String, String)> = None;
    
    if let Some(ref tid) = found_task_id {
        if !tid.is_empty() {
            run_task_info = sqlx::query_as("SELECT title, body FROM project_tasks WHERE id = ?")
                .bind(tid)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);
        }
    }

    if !triggered.is_empty() {
        let app_notify = app.clone();
        let project_id_notify = project_id.clone();
        let from_role_id_notify = from_role_id.clone();
        let triggered_clone = triggered.clone();
        let start_trigger = is_start_trigger;
        let run_task_info_notify = run_task_info.clone();
        tauri::async_runtime::spawn(async move {
            for tw in triggered_clone {
                let mut context_msg = if start_trigger {
                    format!(
                        "你被分配了一个新任务，请完成「{}」产物。",
                        tw.artifact_type
                    )
                } else if tw.transition_type == "need_confirm" {
                    format!(
                        "工作流审批节点：你需要完成「{}」产物，完成后将提交审批。请基于上游产出开始你的工作。",
                        tw.artifact_type
                    )
                } else {
                    format!(
                        "工作流自动流转：产物「{}」已从上游交付，请基于上游产出开始你的工作。",
                        tw.artifact_type
                    )
                };

                if let Some((title, body)) = &run_task_info_notify {
                    context_msg.push_str(&format!("\n\n【原始任务名称】\n{}\n\n【原始任务说明】\n{}", title, body));
                }

                let event_id = format!("wf_notify_{}_{}", project_id_notify, tw.artifact_id);
                let result = crate::commands::project_execution::auto_delegate_chat(
                    app_notify.clone(),
                    project_id_notify.clone(),
                    from_role_id_notify.clone(),
                    tw.to_role_id.clone(),
                    context_msg,
                    event_id,
                    found_task_id.clone(),
                ).await;
                if let Err(e) = result {
                    log::error!("auto_delegate_chat failed: {}", e);
                }
            }
        });
    }

    // Debounced data push for workflow execution
    crate::commands::helpers::debounced_emit(&app, &project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(&app, &project_id, "artifacts");
    crate::commands::helpers::debounced_emit(&app, &project_id, "tasks");
    crate::commands::helpers::debounced_emit(&app, &project_id, "members");

    // Instant event for workflow step change
    let _ = app.emit("workflow_step_changed", serde_json::json!({
        "projectId": project_id,
        "fromRoleId": from_role_id,
    }));

    Ok(WorkflowExecutionResult {
        triggered_workflows: triggered,
        pending_approvals: pending,
    })
}

#[tauri::command]
pub async fn add_project_workflow(app: AppHandle, req: db::CreateProjectWorkflowRequest) -> Result<db::ProjectWorkflow, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_workflows WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let artifact_type = req.artifact_type.unwrap_or_default();
    let transition_type = req.transition_type.unwrap_or("auto_push".to_string());
    let reject_to_role_id = req.reject_to_role_id.unwrap_or_default();
    let task_id = req.task_id.unwrap_or_default();
    let condition_expr = req.condition_expr.unwrap_or_default();
    let branch_label = req.branch_label.unwrap_or_default();
    let parallel_group = req.parallel_group.unwrap_or_default();

    // 如果未指定流程组，使用主流程组
    let effective_group_id = if let Some(ref gid) = req.group_id {
        Some(gid.clone())
    } else {
        sqlx::query_scalar(
            "SELECT id FROM project_workflow_groups WHERE project_id = ? AND is_primary = 1 LIMIT 1"
        )
        .bind(&req.project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
    };

    sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.from_role_id)
        .bind(&req.to_role_id)
        .bind(&artifact_type)
        .bind(&transition_type)
        .bind(&reject_to_role_id)
        .bind(&task_id)
        .bind(&condition_expr)
        .bind(&branch_label)
        .bind(&parallel_group)
        .bind(&effective_group_id)
        .bind(sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectWorkflow {
        id, project_id: req.project_id, from_role_id: req.from_role_id, to_role_id: req.to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary: false, group_id: effective_group_id, sort_order, created_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_workflow(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let is_primary: bool = sqlx::query_scalar("SELECT is_primary FROM project_workflows WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(false);

    if is_primary {
        return Err("主流程不可删除".to_string());
    }

    sqlx::query("DELETE FROM project_workflows WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ========== 流程组 CRUD ==========

#[tauri::command]
pub async fn list_workflow_groups(app: AppHandle, project_id: String) -> Result<Vec<db::WorkflowGroup>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, bool, bool, Option<String>, i64, i64, i64)>(
        "SELECT id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at FROM project_workflow_groups WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at)| db::WorkflowGroup {
        id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_workflow_group(app: AppHandle, req: db::CreateWorkflowGroupRequest) -> Result<db::WorkflowGroup, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let name = req.name.unwrap_or_else(|| "新流程".to_string());

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_workflow_groups WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    sqlx::query(
        "INSERT INTO project_workflow_groups (id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.project_id)
    .bind(&name)
    .bind(&req.parent_group_id)
    .bind(sort_order)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(db::WorkflowGroup {
        id,
        project_id: req.project_id,
        name,
        is_primary: false,
        is_valid: false,
        parent_group_id: req.parent_group_id,
        sort_order,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn update_workflow_group(app: AppHandle, id: String, name: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE project_workflow_groups SET name = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn set_workflow_group_valid(app: AppHandle, id: String, is_valid: bool) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    if is_valid {
        validate_group_workflows(&pool, &id).await?;
    }

    sqlx::query("UPDATE project_workflow_groups SET is_valid = ?, updated_at = ? WHERE id = ?")
        .bind(is_valid)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn validate_group_workflows(pool: &sqlx::SqlitePool, group_id: &str) -> Result<(), String> {
    let rows: Vec<(Option<String>, String, String, String, String)> = sqlx::query_as(
        "SELECT from_role_id, to_role_id, transition_type, branch_label, parallel_group FROM project_workflows WHERE group_id = ? ORDER BY sort_order ASC"
    )
    .bind(group_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if rows.is_empty() {
        return Err("流程组内没有工作流连线".to_string());
    }

    // ① 必须有且仅有一个开始节点
    let start_count = rows.iter().filter(|(f, _, _, _, _)| f.as_deref() == Some("start")).count();
    if start_count == 0 {
        return Err("流程缺少从「开始」出发的连线".to_string());
    }
    if start_count > 1 {
        return Err("流程只能有一个从「开始」出发的连线".to_string());
    }

    // ② 必须有结束节点
    let has_end = rows.iter().any(|(_, to, _, _, _)| to == "end");
    if !has_end {
        return Err("流程缺少连接到「结束」的连线".to_string());
    }

    // ③ 连线两端节点必须存在：检查引用完整性
    let role_ids: std::collections::HashSet<String> = {
        let project_id: String = sqlx::query_scalar(
            "SELECT project_id FROM project_workflow_groups WHERE id = ?"
        )
        .bind(group_id)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query_as::<_, (String,)>(
            "SELECT id FROM ai_roles WHERE id IN (SELECT role_id FROM project_members WHERE project_id = ?)"
        )
        .bind(&project_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(id,)| id)
        .collect()
    };

    for (from, to, _, _, _) in &rows {
        let from_key = from.as_deref().unwrap_or("");
        if from_key != "" && from_key != "start" && !role_ids.contains(from_key) {
            return Err(format!("连线源角色 \"{}\" 不存在于项目中", from_key));
        }
        if to != "end" && !role_ids.contains(to.as_str()) {
            return Err(format!("连线目标角色 \"{}\" 不存在于项目中", to));
        }
    }

    // ④ 条件节点(transition_type='condition')必须有"是"和"否"两条分支
    for (from, _, trans, _branch, _) in &rows {
        if trans == "condition" {
            let from_key = from.as_deref().unwrap_or("");
            let branches: Vec<&str> = rows.iter()
                .filter(|(f, _, t, _, _)| f.as_deref() == Some(from_key) && t == "condition")
                .map(|(_, _, _, b, _)| b.as_str())
                .collect();
            let has_yes = branches.iter().any(|b| *b == "yes" || b.is_empty());
            let has_no = branches.iter().any(|b| *b == "no");
            if !has_yes || !has_no {
                if !branches.is_empty() {
                    return Err(format!("条件节点 \"{}\" 需要\"是\"和\"否\"两条分支连线", from_key));
                }
            }
        }
    }

    // ⑤ 并行节点(transition_type='parallel')必须连接合并节点
    let has_parallel = rows.iter().any(|(_, _, t, _, _)| t == "parallel");
    let has_merge = rows.iter().any(|(_, _, t, _, _)| t == "merge");
    if has_parallel && !has_merge {
        return Err("流程包含并行节点但缺少合并节点".to_string());
    }

    // ⑥ 连通性：从 start 出发，所有节点必须能到达 end
    let mut graph: std::collections::HashMap<&str, Vec<&str>> = std::collections::HashMap::new();
    for (from, to, _, _, _) in &rows {
        let from_key = from.as_deref().unwrap_or("");
        graph.entry(from_key).or_default().push(to.as_str());
    }

    fn can_reach(graph: &std::collections::HashMap<&str, Vec<&str>>, from: &str, target: &str) -> bool {
        let mut visited = std::collections::HashSet::new();
        let mut stack = vec![from];
        while let Some(curr) = stack.pop() {
            if curr == target {
                return true;
            }
            if !visited.insert(curr) {
                continue;
            }
            if let Some(neighbors) = graph.get(curr) {
                for &next in neighbors {
                    stack.push(next);
                }
            }
        }
        false
    }

    let mut visited = std::collections::HashSet::new();
    let mut stack = vec!["start"];
    while let Some(curr) = stack.pop() {
        if !visited.insert(curr) {
            continue;
        }
        if let Some(neighbors) = graph.get(curr) {
            for &next in neighbors {
                stack.push(next);
            }
        }
    }

    for (from, to, _, _, _) in &rows {
        let from_key = from.as_deref().unwrap_or("");
        if !visited.contains(from_key) && from_key != "start" {
            return Err(format!("角色 \"{}\" 无法从开始节点到达", from_key));
        }
        if !visited.contains(to.as_str()) && to != "end" {
            return Err(format!("角色 \"{}\" 无法从开始节点到达", to));
        }
    }

    // ⑦ 条件分支独立连通性：每个分支必须能独立到达结束节点
    for (from, _, trans, _, _) in &rows {
        if trans != "condition" {
            continue;
        }
        let from_key = from.as_deref().unwrap_or("");
        let yes_target = rows.iter()
            .find(|(f, _, t, b, _)| {
                f.as_deref() == Some(from_key) && *t == "condition" && (*b == "yes" || b.is_empty())
            })
            .map(|(_, to, _, _, _)| to.as_str());
        let no_target = rows.iter()
            .find(|(f, _, t, b, _)| {
                f.as_deref() == Some(from_key) && *t == "condition" && *b == "no"
            })
            .map(|(_, to, _, _, _)| to.as_str());

        if let Some(yes_to) = yes_target {
            if yes_to != "end" && !can_reach(&graph, yes_to, "end") {
                return Err(format!("条件节点 \"{}\" 的「是」分支无法连通到结束节点", from_key));
            }
        }
        if let Some(no_to) = no_target {
            if no_to != "end" && !can_reach(&graph, no_to, "end") {
                return Err(format!("条件节点 \"{}\" 的「否」分支无法连通到结束节点", from_key));
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_workflow_group(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    // 主流程组不可删除
    let is_primary: bool = sqlx::query_scalar("SELECT is_primary FROM project_workflow_groups WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(false);

    if is_primary {
        return Err("主流程组不可删除".to_string());
    }

    // 被任务绑定的流程组不可删除
    let bound_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_tasks WHERE workflow_group_id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if bound_count > 0 {
        return Err("该流程组已被任务绑定，不可删除".to_string());
    }

    // 删除流程组下的工作流
    sqlx::query("DELETE FROM project_workflows WHERE group_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    // 删除流程组
    sqlx::query("DELETE FROM project_workflow_groups WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_workflow_start_role(app: AppHandle, group_id: String) -> Result<Option<serde_json::Value>, String> {
    let pool = get_pool(&app)?;

    // 查找流程组中起始步骤（from_role_id 为空）的第一个工作流的 to_role_id
    let start_role_id: Option<String> = sqlx::query_scalar(
        "SELECT to_role_id FROM project_workflows WHERE group_id = ? AND from_role_id = 'start' ORDER BY sort_order ASC LIMIT 1"
    )
    .bind(&group_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    match start_role_id {
        Some(role_id) => {
            let role: Option<(String, String, String)> = sqlx::query_as(
                "SELECT id, name, icon FROM ai_roles WHERE id = ?"
            )
            .bind(&role_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

            Ok(role.map(|(id, name, icon)| serde_json::json!({
                "roleId": id,
                "roleName": name,
                "roleIcon": icon,
            })))
        }
        None => Ok(None),
    }
}

// ========== 任务分配 ==========

#[tauri::command]
pub async fn assign_task(
    app: AppHandle,
    task_id: String,
    assignee: String,
    workflow_group_id: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    // 更新任务状态为 running，设置受理人和流程组
    sqlx::query(
        "UPDATE project_tasks SET assignee = ?, status = 'running', workflow_group_id = ?, started_at = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&assignee)
    .bind(&workflow_group_id)
    .bind(now)
    .bind(now)
    .bind(&task_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // 获取项目 ID
    let project_id: String = sqlx::query_scalar("SELECT project_id FROM project_tasks WHERE id = ?")
        .bind(&task_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &project_id, Some(&assignee), "task_assigned", Some("task"), Some(&task_id), &format!("任务已分配给角色")).await;

    if let Some(ref gid) = workflow_group_id {
        // 有流程模式：启动工作流
        let initial_message = message.unwrap_or_else(|| "请开始你的工作".to_string());
        let _ = start_workflow_run(app.clone(), project_id.clone(), initial_message, Some(gid.clone()), Some(task_id.clone())).await;
    } else {
        // 无流程模式：直接调用 auto_delegate_chat
        let task_info: Option<(String, String)> = sqlx::query_as(
            "SELECT title, body FROM project_tasks WHERE id = ?"
        )
        .bind(&task_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((title, _body)) = task_info {
            let context_msg = message.unwrap_or_else(|| format!("请完成以下任务：{}", title));
            let event_id = format!("assign_task_{}_{}", project_id, task_id);
            let _ = auto_delegate_chat(
                app.clone(),
                project_id.clone(),
                "builtin_user".to_string(),
                assignee.clone(),
                context_msg,
                event_id,
                Some(task_id.clone()),
            ).await;
        }
    }

    // Debounced data push
    crate::commands::helpers::debounced_emit(&app, &project_id, "tasks");
    crate::commands::helpers::debounced_emit(&app, &project_id, "members");

    // Instant event
    let _ = app.emit("task_status_changed", serde_json::json!({
        "projectId": project_id,
        "taskId": task_id,
        "newStatus": "running",
    }));

    Ok(())
}

#[tauri::command]
pub async fn sync_workflow_to_file(app: AppHandle, project_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let workflows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_dir = std::path::PathBuf::from(&workspace_path).join(".hermes");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;

    let config_path = config_dir.join("workflow.json");
    let workflow_data: Vec<serde_json::Value> = workflows.iter().map(|(id, pid, from, to, artifact, trans, task_id, cond_expr, br_label, par_group, is_primary, group_id, sort, created)| {
        serde_json::json!({
            "id": id,
            "projectId": pid,
            "fromRoleId": from,
            "toRoleId": to,
            "artifactType": artifact,
            "transitionType": trans,
            "taskId": task_id,
            "conditionExpr": cond_expr,
            "branchLabel": br_label,
            "parallelGroup": par_group,
            "isPrimary": is_primary,
            "groupId": group_id,
            "sortOrder": sort,
            "createdAt": created,
        })
    }).collect();

    let config = serde_json::json!({
        "version": "1.0",
        "projectId": project_id,
        "workflows": workflow_data,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    });

    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn load_workflow_from_file(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let project: Option<(String, String, String, String)> = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT id, name, description, workspace_path FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let workspace_path = project.map(|p| p.3).unwrap_or_default();
    if workspace_path.is_empty() {
        return Err("Project workspace path not set".to_string());
    }

    let config_path = std::path::PathBuf::from(&workspace_path).join(".hermes").join("workflow.json");
    if !config_path.exists() {
        return Ok(serde_json::json!({ "workflows": [] }));
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(value)
}

#[tauri::command]
pub async fn list_project_artifacts(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectArtifact>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, Option<String>, Option<i32>, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at FROM project_artifacts WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at)| db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_artifact(app: AppHandle, id: String) -> Result<db::ProjectArtifact, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, Option<String>, Option<i32>, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Artifact not found".to_string())?;

    let (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) = row;
    Ok(db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at,
    })
}

#[tauri::command]
pub async fn create_project_artifact(app: AppHandle, req: db::CreateProjectArtifactRequest) -> Result<db::ProjectArtifact, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let task_id = req.task_id.unwrap_or_default();
    let artifact_type = req.artifact_type.unwrap_or_default();
    let title = req.title.unwrap_or_default();
    let file_path = req.file_path.unwrap_or_default();
    let content = req.content.unwrap_or_default();
    let status = req.status.unwrap_or("draft".to_string());

    sqlx::query("INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, NULL, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&task_id)
        .bind(&artifact_type)
        .bind(&title)
        .bind(&file_path)
        .bind(&content)
        .bind(&status)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "artifact_submitted", Some("artifact"), Some(&id), &format!("提交了产物：{}", if title.is_empty() { artifact_type.clone() } else { title.clone() })).await;

    Ok(db::ProjectArtifact {
        id, project_id: req.project_id, role_id: req.role_id, task_id, artifact_type, title, file_path, content, status, review_comment: String::new(), workflow_run_id: None, step_index: None, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_artifact_status(app: AppHandle, id: String, status: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_artifacts SET status = ?, updated_at = ? WHERE id = ?")
        .bind(&status)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn approve_project_artifact(app: AppHandle, id: String, comment: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let review_comment = comment.unwrap_or_default();
    sqlx::query("UPDATE project_artifacts SET status = 'approved', review_comment = ?, updated_at = ? WHERE id = ?")
        .bind(&review_comment)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let (project_id, title, role_id, _artifact_type, workflow_run_id, step_index): (
        String,
        String,
        String,
        String,
        Option<String>,
        Option<i32>,
    ) = sqlx::query_as(
        "SELECT project_id, title, role_id, artifact_type, workflow_run_id, step_index FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or((String::new(), String::new(), String::new(), String::new(), None, None));
    let _ = record_activity(&app, &project_id, Some(&role_id), "artifact_approved", Some("artifact"), Some(&id), &format!("审批通过了产物：{}", title)).await;

    let workflow_run_id = workflow_run_id.filter(|value| !value.is_empty());
    if let Some(run_id) = workflow_run_id.clone() {
        let current_step: Option<i64> = sqlx::query_scalar("SELECT current_step FROM workflow_runs WHERE id = ?")
            .bind(&run_id)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let artifact_step = step_index.map(i64::from);
        let mut resolved_step: Option<i64> = None;

        if let Some(step) = artifact_step.filter(|step| *step > 0) {
            let valid_artifact_step: Option<i64> = sqlx::query_scalar(
                "SELECT step_index FROM workflow_run_steps \
                 WHERE run_id = ? AND step_index = ? AND role_id = ? \
                 AND status IN ('running', 'pending_approval') \
                 LIMIT 1"
            )
            .bind(&run_id)
            .bind(step)
            .bind(&role_id)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);

            if valid_artifact_step.is_some() {
                resolved_step = Some(step);
            } else {
                log::warn!(
                    "approve_project_artifact: artifact step {} is stale for role {} in run {}, falling back to active step lookup",
                    step, role_id, run_id
                );
            }
        }

        if resolved_step.is_none() {
            resolved_step = sqlx::query_scalar(
                "SELECT step_index FROM workflow_run_steps \
                 WHERE run_id = ? AND role_id = ? AND status IN ('running', 'pending_approval') \
                 ORDER BY step_index ASC LIMIT 1"
            )
            .bind(&run_id)
            .bind(&role_id)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        }

        if let Some(step) = resolved_step {
            log::info!(
                "approve_project_artifact: resolved approval step {} for role {} in run {}",
                step, role_id, run_id
            );
            if current_step != Some(step) {
                log::info!("approve_project_artifact: current_step {:?} != resolved step {}, syncing", current_step, step);
                let _ = sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                    .bind(step)
                    .bind(&run_id)
                    .execute(&pool)
                    .await;
            }
            confirm_workflow_step(app.clone(), run_id, true, Some(review_comment.clone())).await?;
        }
    }

    if workflow_run_id.is_none() && !project_id.is_empty() && !role_id.is_empty() {
        {
            let pool_step = match get_pool(&app) {
                Ok(p) => p,
                Err(_) => {
                    log::error!("approve_project_artifact: failed to get pool for step advancement");
                    return Ok(());
                }
            };
            let now_step = chrono::Utc::now().timestamp_millis();

            let matching_step: Option<(String, i64)> = sqlx::query_as(
                "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                 JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                 WHERE wr.project_id = ? AND wr.status = 'running' \
                 AND wrs.role_id = ? AND wrs.status IN ('running', 'pending_approval') \
                 ORDER BY wrs.step_index ASC LIMIT 1"
            )
            .bind(&project_id)
            .bind(&role_id)
            .fetch_optional(&pool_step)
            .await
            .unwrap_or(None);

            if let Some((run_id, step_idx)) = matching_step {
                log::info!("approve_project_artifact: found matching step {}/{} for role {} (no workflow_run_id on artifact)", step_idx, run_id, role_id);
                let current: Option<i64> = sqlx::query_scalar("SELECT current_step FROM workflow_runs WHERE id = ?")
                    .bind(&run_id)
                    .fetch_optional(&pool_step)
                    .await
                    .unwrap_or(None);
                if current != Some(step_idx) {
                    let _ = sqlx::query("UPDATE workflow_runs SET current_step = ? WHERE id = ?")
                        .bind(step_idx)
                        .bind(&run_id)
                        .execute(&pool_step)
                        .await;
                }
                let _ = confirm_workflow_step(app.clone(), run_id, true, Some(review_comment.clone())).await;
            } else {
                let pending_steps: Vec<(String, i64)> = sqlx::query_as(
                    "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                     JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                     WHERE wr.project_id = ? AND wr.status = 'running' \
                     AND wrs.status = 'pending_approval' \
                     AND wrs.step_index = ( \
                        SELECT MIN(wrs2.step_index) FROM workflow_run_steps wrs2 \
                        WHERE wrs2.run_id = wr.id AND wrs2.status = 'pending_approval' \
                     )"
                )
                .bind(&project_id)
                .fetch_all(&pool_step)
                .await
                .unwrap_or_default();

                for (run_id, step_index) in &pending_steps {
                    let _ = sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'running', started_at = COALESCE(started_at, ?) WHERE run_id = ? AND step_index = ? AND status = 'pending_approval'"
                    )
                    .bind(now_step)
                    .bind(run_id)
                    .bind(step_index)
                    .execute(&pool_step)
                    .await;
                    log::info!("approve_project_artifact: advanced step {}/{} from pending_approval to running", step_index, run_id);
                }
            }
        }

        let app_wf = app.clone();
        let project_id_wf = project_id.clone();
        let role_id_wf = role_id.clone();
        let wf_run_id_wf = workflow_run_id.clone();
        let wf_step_wf = step_index;
        tauri::async_runtime::spawn(async move {
            log::info!("approve_project_artifact: triggering workflow for project_id={}, from_role_id={}", project_id_wf, role_id_wf);
            match trigger_workflow_execution(
                app_wf, project_id_wf, role_id_wf, None, None, None, wf_run_id_wf, wf_step_wf,
            ).await {
                Ok(result) => log::info!("approve_project_artifact: triggered={}, pending={}", result.triggered_workflows.len(), result.pending_approvals.len()),
                Err(e) => log::error!("approve_project_artifact: workflow trigger error={}", e),
            }
        });
    }

    // Debounced data push for artifact approval
    crate::commands::helpers::debounced_emit(&app, &project_id, "artifacts");
    crate::commands::helpers::debounced_emit(&app, &project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(&app, &project_id, "members");

    // 无流程模式：审批通过后检查任务是否需要标记为 done
    let task_id_from_artifact: Option<String> = sqlx::query_scalar(
        "SELECT task_id FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .unwrap_or(None);

    if let Some(ref tid) = task_id_from_artifact {
        let workflow_group_id: Option<String> = sqlx::query_scalar(
            "SELECT workflow_group_id FROM project_tasks WHERE id = ?"
        )
        .bind(tid)
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        // 无流程模式：所有产物都已审批通过 → 任务 done
        if workflow_group_id.as_ref().map_or(true, |s| s.is_empty()) {
            let pending_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM project_artifacts WHERE task_id = ? AND status IN ('draft', 'submitted')"
            )
            .bind(tid)
            .fetch_one(&pool)
            .await
            .unwrap_or(0);

            if pending_count == 0 {
                let _ = sqlx::query(
                    "UPDATE project_tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ? AND status != 'done'"
                )
                .bind(now)
                .bind(now)
                .bind(tid)
                .execute(&pool)
                .await;

                crate::commands::helpers::debounced_emit(&app, &project_id, "tasks");
                let _ = app.emit("task_status_changed", serde_json::json!({
                    "projectId": project_id,
                    "taskId": tid,
                    "newStatus": "done",
                }));
            }
        }
    }

    // Instant event for artifact status change
    let _ = app.emit("artifact_status_changed", serde_json::json!({
        "projectId": project_id,
        "artifactId": id,
        "newStatus": "approved",
    }));

    Ok(())
}

#[tauri::command]
pub async fn reject_project_artifact(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    // Get artifact info before update
    let artifact_info: Option<(String, String, String, String, String, Option<String>, Option<i32>, Option<String>)> = sqlx::query_as(
        "SELECT project_id, role_id, artifact_type, title, run_step_id, workflow_run_id, step_index, task_id FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE project_artifacts SET status = 'rejected', review_comment = ?, updated_at = ? WHERE id = ?")
        .bind(&reason)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some((art_project_id, art_role_id, art_type, art_title, _art_run_step_id, workflow_run_id, step_index, task_id)) = artifact_info {
        let _ = record_activity(&app, &art_project_id, Some(&art_role_id), "artifact_rejected", Some("artifact"), Some(&id), &format!("打回了产物：{}，原因：{}", art_title, reason)).await;

        if !art_project_id.is_empty() && !art_role_id.is_empty() {
            let mut target_role_id = art_role_id.clone();
            let mut target_step_index = i64::from(step_index.unwrap_or(1)).max(1);
            let mut target_artifact_type = art_type.clone();
            let mut retry_title_base = art_title.clone();

            if let Some(ref run_id) = workflow_run_id.clone().filter(|v| !v.is_empty()) {
                let current_step = step_index.map(i64::from).unwrap_or_default();

                let explicit_reject: Option<String> = sqlx::query_scalar(
                    "SELECT pw.reject_to_role_id FROM project_workflows pw \
                     WHERE pw.project_id = ? AND pw.from_role_id = ? AND pw.transition_type = 'need_confirm' \
                     AND pw.reject_to_role_id IS NOT NULL AND pw.reject_to_role_id != '' \
                     AND (pw.artifact_type = ? OR pw.artifact_type = '') \
                     ORDER BY CASE WHEN pw.artifact_type = ? THEN 0 ELSE 1 END \
                     LIMIT 1"
                )
                .bind(&art_project_id)
                .bind(&art_role_id)
                .bind(&art_type)
                .bind(&art_type)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);

                let resolved_prev_step: i64;

                if let Some(ref explicit_role) = explicit_reject {
                    let explicit_step: Option<i64> = sqlx::query_scalar(
                        "SELECT MIN(step_index) FROM workflow_run_steps WHERE run_id = ? AND role_id = ?"
                    )
                    .bind(run_id)
                    .bind(explicit_role)
                    .fetch_optional(&pool)
                    .await
                    .unwrap_or(None);

                    if let Some(es) = explicit_step {
                        resolved_prev_step = es;
                        target_role_id = explicit_role.clone();
                        log::info!("reject_project_artifact: using explicit reject_to_role_id={}, step={}", target_role_id, es);
                    } else {
                        log::warn!("reject_project_artifact: reject_to_role_id={} not found in steps, falling back", explicit_role);
                        let prev_need_step: Option<i64> = if current_step >= 1 {
                            sqlx::query_scalar(
                                "SELECT step_index FROM workflow_run_steps \
                                 WHERE run_id = ? AND step_index < ? AND action = 'need_confirm' \
                                 ORDER BY step_index DESC LIMIT 1"
                            )
                            .bind(run_id)
                            .bind(current_step)
                            .fetch_optional(&pool)
                            .await
                            .unwrap_or(None)
                        } else { None };

                        if let Some(ps) = prev_need_step {
                            resolved_prev_step = ps;
                        } else if current_step > 1 {
                            resolved_prev_step = current_step - 1;
                        } else {
                            resolved_prev_step = current_step.max(1);
                        }
                    }
                } else {
                    let prev_need_step: Option<i64> = if current_step >= 1 {
                        sqlx::query_scalar(
                            "SELECT step_index FROM workflow_run_steps \
                             WHERE run_id = ? AND step_index < ? AND action = 'need_confirm' \
                             ORDER BY step_index DESC LIMIT 1"
                        )
                        .bind(run_id)
                        .bind(current_step)
                        .fetch_optional(&pool)
                        .await
                        .unwrap_or(None)
                    } else { None };

                    if let Some(ps) = prev_need_step {
                        resolved_prev_step = ps;
                    } else if current_step > 1 {
                        resolved_prev_step = current_step - 1;
                    } else {
                        resolved_prev_step = current_step.max(1);
                    }
                }

                target_step_index = resolved_prev_step.max(1);

                let target_step_artifact: Option<(String, String)> = sqlx::query_as(
                    "SELECT artifact_type, title FROM project_artifacts \
                     WHERE workflow_run_id = ? AND step_index = ? \
                     ORDER BY created_at DESC LIMIT 1"
                )
                .bind(run_id)
                .bind(target_step_index)
                .fetch_optional(&pool)
                .await
                .unwrap_or(None);

                if let Some((artifact_type, title)) = target_step_artifact {
                    if !artifact_type.is_empty() {
                        target_artifact_type = artifact_type;
                    }
                    if !title.is_empty() {
                        retry_title_base = title;
                    }
                }

                sqlx::query("UPDATE workflow_runs SET current_step = ?, status = 'running', completed_at = NULL WHERE id = ?")
                    .bind(target_step_index)
                    .bind(run_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;

                sqlx::query(
                    "UPDATE workflow_run_steps SET status = 'running', completed_at = NULL, output = ? WHERE run_id = ? AND step_index = ?"
                )
                .bind(&reason)
                .bind(run_id)
                .bind(target_step_index)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;

                for step_idx in (target_step_index + 1)..=current_step {
                    sqlx::query(
                        "UPDATE workflow_run_steps SET status = 'pending', completed_at = NULL WHERE run_id = ? AND step_index = ?"
                    )
                    .bind(run_id)
                    .bind(step_idx)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;
                }
            }

            let new_artifact_id = uuid::Uuid::new_v4().to_string();
            let retry_title = format!("{} - 修改稿", retry_title_base);
            sqlx::query(
                "INSERT INTO project_artifacts (id, project_id, role_id, artifact_type, title, content, status, run_step_id, workflow_run_id, step_index, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', 'in_progress', '', ?, ?, ?, ?, ?)"
            )
            .bind(&new_artifact_id)
            .bind(&art_project_id)
            .bind(&target_role_id)
            .bind(&target_artifact_type)
            .bind(&retry_title)
            .bind(&workflow_run_id)
            .bind(target_step_index)
            .bind(&task_id)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some(ref tid) = task_id {
                if !tid.is_empty() && !target_role_id.is_empty() {
                    let _ = sqlx::query(
                        "UPDATE project_tasks SET assignee = ?, status = 'running', updated_at = ? WHERE id = ?"
                    )
                    .bind(&target_role_id)
                    .bind(now)
                    .bind(tid)
                    .execute(&pool)
                    .await;
                }
            }

            let app_notify = app.clone();
            let notify_project_id = art_project_id.clone();
            let notify_role_id = target_role_id.clone();
            let notify_title = art_title.clone();
            let notify_reason = reason.clone();
            let notify_artifact_id = new_artifact_id.clone();
            let notify_task_id = task_id.clone();
            tauri::async_runtime::spawn(async move {
                let context_msg = format!(
                    "你的产物「{}」已被驳回，原因：{}\n请根据驳回意见修改完善，然后重新提交。",
                    notify_title, notify_reason
                );
                let event_id = format!("reject_retry_{}_{}", notify_project_id, notify_artifact_id);
                let _ = crate::commands::project_execution::auto_delegate_chat(
                    app_notify,
                    notify_project_id,
                    "builtin_user".to_string(),
                    notify_role_id,
                    context_msg,
                    event_id,
                    notify_task_id,
                ).await;
            });

            // Emit event for frontend refresh
            let _ = app.emit("artifact-rejected", serde_json::json!({
                "artifact_id": id,
                "project_id": art_project_id,
                "role_id": art_role_id,
                "new_artifact_id": new_artifact_id,
            }));

            // Debounced data push for artifact rejection
            crate::commands::helpers::debounced_emit(&app, &art_project_id, "artifacts");
            crate::commands::helpers::debounced_emit(&app, &art_project_id, "tasks");
            crate::commands::helpers::debounced_emit(&app, &art_project_id, "members");

            // Instant event for artifact status change
            let _ = app.emit("artifact_status_changed", serde_json::json!({
                "projectId": art_project_id,
                "artifactId": id,
                "newStatus": "rejected",
            }));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn list_project_messages(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMessage>, String> {
    let pool = get_pool(&app)?;

    ensure_key_initialized_from_pool(&pool).await?;
    let sp = get_conversation_storage_path_from_pool(&pool).await;

    let encrypted_messages = file_storage::read_project_messages_file(sp.as_deref(), &project_id)?;

    let messages = encrypted_messages
        .into_iter()
        .map(|em| db::ProjectMessage {
            id: em.id,
            project_id: project_id.clone(),
            role_id: em.role_id,
            content: em.content,
            message_type: em.message_type,
            prompt_tokens: em.prompt_tokens,
            completion_tokens: em.completion_tokens,
            created_at: em.created_at,
        })
        .collect();

    Ok(messages)
}

#[tauri::command]
pub async fn create_project_message(app: AppHandle, req: db::CreateProjectMessageRequest) -> Result<db::ProjectMessage, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let message_type = req.message_type.clone().unwrap_or_else(|| "text".to_string());

    ensure_key_initialized_from_pool(&pool).await?;
    let sp = get_conversation_storage_path_from_pool(&pool).await;

    let encrypted_msg = file_storage::EncryptedProjectMessage {
        id: id.clone(),
        role_id: req.role_id.clone(),
        content: req.content.clone(),
        message_type: message_type.clone(),
        prompt_tokens: 0,
        completion_tokens: 0,
        created_at: now,
    };

    file_storage::append_message_to_project(sp.as_deref(), &req.project_id, encrypted_msg)?;

    let content_preview = if req.content.len() > 50 { req.content.chars().take(50).collect::<String>() } else { req.content.clone() };
    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "message_sent", Some("message"), Some(&id), &format!("发送了消息：{}...", content_preview)).await;

    Ok(db::ProjectMessage {
        id, project_id: req.project_id, role_id: req.role_id, content: req.content, message_type, prompt_tokens: 0, completion_tokens: 0, created_at: now,
    })
}

#[tauri::command]
pub async fn execute_workflow_step(app: AppHandle, project_id: String, from_role_id: Option<String>, artifact_type: Option<String>) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;

    let mut query = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ?");
    let mut bind_from: Option<String> = None;
    let mut bind_artifact: Option<String> = None;

    if from_role_id.is_some() {
        query.push_str(" AND from_role_id = ?");
        bind_from = from_role_id.clone();
    }
    if artifact_type.is_some() {
        query.push_str(" AND artifact_type = ?");
        bind_artifact = artifact_type.clone();
    }
    query.push_str(" ORDER BY sort_order ASC");

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(&query)
        .bind(&project_id);
    if let Some(ref fr) = bind_from {
        q = q.bind(fr);
    }
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_role_context(app: AppHandle, project_id: String, role_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    if role_id == "builtin_user" {
        let project: Option<db::Project> = sqlx::query_as::<_, db::Project>(
            "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
        )
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let project_data = project.ok_or("Project not found")?;

        return Ok(serde_json::json!({
            "role": {
                "id": "builtin_user",
                "name": "用户",
                "nickname": "用户",
                "icon": "👤",
                "description": "项目发起人",
                "responsibilities": "发起项目需求，提供项目方向和初始信息",
                "soul": "你是项目的发起人，负责提供项目需求和方向。",
                "energy": 100,
                "mood": "neutral",
                "equipment_level": 1,
            },
            "project": {
                "id": project_data.id,
                "name": project_data.name,
                "description": project_data.description,
                "workspace_path": project_data.workspace_path,
                "project_guidelines": project_data.project_guidelines,
            },
            "workflows": [],
            "artifacts": [],
        }));
    }

    let role: Option<(String, String, String, String, String, String, String, i64, i64, String)> = sqlx::query_as(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, is_builtin, energy, mood FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let role_data = role.ok_or("Role not found")?;

    let member: Option<(String, String, String, String, String, String, i64, i64, i64, i64)> = sqlx::query_as(
        "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? AND role_id = ?"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project: Option<db::Project> = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let project_data = project.ok_or("Project not found")?;

    let soul = member.as_ref().and_then(|m| if m.4.is_empty() { None } else { Some(m.4.clone()) })
        .unwrap_or_else(|| role_data.5.clone());
    let responsibilities = member.as_ref().and_then(|m| if m.5.is_empty() { None } else { Some(m.5.clone()) })
        .unwrap_or_else(|| role_data.4.clone());

    let workflows: Vec<db::ProjectWorkflow> = {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?) ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at,
        }).collect()
    };

    let artifacts: Vec<db::ProjectArtifact> = {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, Option<String>, Option<i32>, i64, i64)>(
            "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY created_at DESC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at)| db::ProjectArtifact {
            id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at,
        }).collect()
    };

    Ok(serde_json::json!({
        "role": {
            "id": role_data.0,
            "name": role_data.1,
            "nickname": role_data.2,
            "icon": role_data.3,
            "description": role_data.4,
            "responsibilities": responsibilities,
            "soul": soul,
            "energy": role_data.8,
            "mood": role_data.9,
            "equipment_level": member.as_ref().map(|m| m.6).unwrap_or(1),
        },
        "project": {
            "id": project_data.id,
            "name": project_data.name,
            "description": project_data.description,
            "workspace_path": project_data.workspace_path,
            "project_guidelines": project_data.project_guidelines,
        },
        "workflows": workflows,
        "artifacts": artifacts,
    }))
}

