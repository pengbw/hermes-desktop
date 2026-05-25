use crate::commands::project::{get_pool, record_activity};
use crate::crypto::{file_storage, key_manager};
use crate::database::models as db;
use sqlx::Row;
use tauri::{AppHandle, Emitter};

use super::project::do_dispatch_task;
#[tauri::command]
pub async fn list_project_tasks(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectTask>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at FROM project_tasks WHERE project_id = ? ORDER BY priority DESC, created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tasks = Vec::new();
    for row in rows {
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
        tasks.push(db::ProjectTask {
            id, project_id, title, body, assignee, status, priority, parent_task_id: parent_task_id.unwrap_or_default(), artifact_id: artifact_id.unwrap_or_default(), result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at,
        });
    }
    Ok(tasks)
}

#[tauri::command]
pub async fn create_project_task(app: AppHandle, req: db::CreateProjectTaskRequest) -> Result<db::ProjectTask, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let body = req.body.unwrap_or_default();
    let assignee = req.assignee.unwrap_or_default();
    let status = req.status.unwrap_or_else(|| "todo".to_string());
    let priority = req.priority.unwrap_or(0);
    let parent_task_id = req.parent_task_id.unwrap_or_default();

    let skills = req.skills.unwrap_or_else(|| "[]".to_string());
    let max_retries = req.max_retries.unwrap_or(0);
    let workspace_kind = req.workspace_kind.unwrap_or_default();
    let workspace_path = req.workspace_path.unwrap_or_default();

    sqlx::query("INSERT INTO project_tasks (id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 0, ?, ?, 0, ?, ?, '', NULL, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.title)
        .bind(&body)
        .bind(&assignee)
        .bind(&status)
        .bind(priority)
        .bind(&parent_task_id)
        .bind(&skills)
        .bind(max_retries)
        .bind(&workspace_kind)
        .bind(&workspace_path)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &req.project_id, None, "task_created", Some("task"), Some(&id), &format!("创建了任务：{}", req.title)).await;

    let updated_task: db::ProjectTask = sqlx::query_as(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, claim_lock, claim_expire_at, started_at, completed_at, skills, max_retries, retry_count, workspace_kind, workspace_path, board_id, workflow_group_id, created_at, updated_at FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(updated_task)
}

#[tauri::command]
pub async fn update_project_task(app: AppHandle, id: String, req: db::UpdateProjectTaskRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: Option<(String, String, String, String, i32, String, String, i32, String, String)> = sqlx::query_as(
        "SELECT title, body, assignee, status, priority, result, skills, max_retries, workspace_kind, workspace_path FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_title, cur_body, cur_assignee, cur_status, cur_priority, cur_result, cur_skills, cur_max_retries, cur_workspace_kind, cur_workspace_path) = task.ok_or("Task not found")?;

    let project_id: String = sqlx::query_scalar(
        "SELECT project_id FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .unwrap_or_default();

    let old_status = cur_status.clone();
    let new_title = req.title.unwrap_or(cur_title);
    let new_body = req.body.unwrap_or(cur_body);
    let new_assignee = req.assignee.unwrap_or_else(|| cur_assignee.clone());
    let new_status = req.status.unwrap_or(cur_status);
    let new_priority = req.priority.unwrap_or(cur_priority);
    let new_result = req.result.unwrap_or(cur_result);
    let new_skills = req.skills.unwrap_or(cur_skills);
    let new_max_retries = req.max_retries.unwrap_or(cur_max_retries);
    let new_workspace_kind = req.workspace_kind.unwrap_or(cur_workspace_kind);
    let new_workspace_path = req.workspace_path.unwrap_or(cur_workspace_path);

    let started_at_needs_bind = new_status == "running";
    let completed_at_needs_bind = new_status == "done";

    let started_at_update = if started_at_needs_bind {
        "COALESCE(started_at, ?)".to_string()
    } else {
        "started_at".to_string()
    };
    let completed_at_update = if completed_at_needs_bind {
        format!("COALESCE(completed_at, {})", now)
    } else {
        "completed_at".to_string()
    };

    let sql = format!(
        // SAFETY: started_at_update and completed_at_update are internal string literals, not user input
        "UPDATE project_tasks SET title = ?, body = ?, assignee = ?, status = ?, priority = ?, result = ?, skills = ?, max_retries = ?, workspace_kind = ?, workspace_path = ?, started_at = {}, completed_at = {}, updated_at = ? WHERE id = ?",
        started_at_update, completed_at_update
    );

    let mut query = sqlx::query(&sql)
        .bind(&new_title)
        .bind(&new_body)
        .bind(&new_assignee)
        .bind(&new_status)
        .bind(new_priority)
        .bind(&new_result)
        .bind(&new_skills)
        .bind(new_max_retries)
        .bind(&new_workspace_kind)
        .bind(&new_workspace_path);

    if started_at_needs_bind {
        query = query.bind(now);
    }
    if completed_at_needs_bind {
        query = query.bind(now);
    }

    query = query.bind(now).bind(&id);

    query
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if new_status == "done" && old_status != "done" {
        if !project_id.is_empty() {
            let role_id = if new_assignee.is_empty() { None } else { Some(new_assignee.as_str()) };
            let _ = record_activity(&app, &project_id, role_id, "task_completed", Some("task"), Some(&id), &format!("完成了任务：{}", new_title)).await;
        }
    } else if new_status == "running" && old_status != "running" {
        if !project_id.is_empty() {
            let role_id = if new_assignee.is_empty() { None } else { Some(new_assignee.as_str()) };
            let _ = record_activity(&app, &project_id, role_id, "task_started", Some("task"), Some(&id), &format!("开始执行任务：{}", new_title)).await;
        }
    }

    if !new_assignee.is_empty() && new_assignee != cur_assignee && new_status != "done" {
        if !project_id.is_empty() {
            let _ = do_dispatch_task(&app, &pool, &id, &new_assignee, &project_id, &new_title, &new_body, new_priority, None, "auto").await;
        }
    }

    let _ = app.emit("task_updated", serde_json::json!({
        "taskId": id,
        "projectId": project_id,
    }));

    Ok(())
}

#[tauri::command]
pub async fn retry_project_task(app: AppHandle, task_id: String) -> Result<(), String> {
    use crate::commands::project::do_dispatch_task;

    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: (String, String, String, String, String, i32, i32, i32, String) = sqlx::query_as(
        "SELECT project_id, title, body, assignee, status, priority, retry_count, max_retries, result FROM project_tasks WHERE id = ?"
    )
    .bind(&task_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Task not found")?;

    let (project_id, title, body, assignee, status, priority, retry_count, max_retries, _result) = task;

    if status != "failed" && status != "done" {
        return Err(format!("任务当前状态为「{}」，只有失败或已完成的任务才能重试", status));
    }

    if max_retries > 0 && retry_count >= max_retries {
        return Err(format!("已达到最大重试次数（{}/{}）", retry_count, max_retries));
    }

    if assignee.is_empty() {
        return Err("任务尚未分配执行者，无法重试".to_string());
    }

    // Reset workflow run if exists
    let failed_runs: Vec<(String, i64)> = sqlx::query_as(
        "SELECT id, current_step FROM workflow_runs WHERE project_id = ? AND task_id = ? AND status = 'failed' ORDER BY started_at DESC LIMIT 1"
    )
    .bind(&project_id)
    .bind(&task_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    for (run_id, current_step) in &failed_runs {
        // Reset failed steps and subsequent steps to 'pending'
        sqlx::query(
            "UPDATE workflow_run_steps SET status = 'pending', completed_at = NULL WHERE run_id = ? AND step_index >= ? AND status IN ('failed', 'rejected')"
        )
        .bind(run_id)
        .bind(current_step)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        // Reset the first retried step to 'running'
        sqlx::query(
            "UPDATE workflow_run_steps SET status = 'running', started_at = ?, completed_at = NULL, output = ? WHERE run_id = ? AND step_index = ?"
        )
        .bind(now)
        .bind(&format!("任务重试 — 第 {} 次重试", retry_count + 1))
        .bind(run_id)
        .bind(current_step)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        // Reset workflow run to 'running'
        sqlx::query("UPDATE workflow_runs SET status = 'running', completed_at = NULL WHERE id = ?")
            .bind(run_id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    // Mark failed artifacts as 'rejected' for the task
    sqlx::query(
        "UPDATE project_artifacts SET status = 'rejected', review_comment = ?, updated_at = ? WHERE project_id = ? AND task_id = ? AND status = 'failed'"
    )
    .bind(&format!("任务重试 — 第 {} 次重试", retry_count + 1))
    .bind(now)
    .bind(&project_id)
    .bind(&task_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Also mark assignee's in_progress artifacts for this task as rejected
    sqlx::query(
        "UPDATE project_artifacts SET status = 'rejected', review_comment = ?, updated_at = ? WHERE project_id = ? AND task_id = ? AND status = 'in_progress'"
    )
    .bind(&format!("任务重试 — 第 {} 次重试", retry_count + 1))
    .bind(now)
    .bind(&project_id)
    .bind(&task_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Update task: reset to 'ready', increment retry_count, clear result
    sqlx::query(
        "UPDATE project_tasks SET status = 'ready', retry_count = ?, result = '', claim_lock = '', claim_expire_at = 0, completed_at = NULL, updated_at = ? WHERE id = ?"
    )
    .bind(retry_count + 1)
    .bind(now)
    .bind(&task_id)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    // Append a system message for context
    let msg_id = uuid::Uuid::new_v4().to_string();
    let retry_msg = format!(
        "⚠️ 任务「{}」上次执行失败，正在第 {} 次重试...\n本次需要完成的任务：\n**{}**\n{}",
        title,
        retry_count + 1,
        title,
        body
    );

    let sp: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'conversation_storage_path'"
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten()
    .filter(|v: &String| !v.is_empty());

    if crate::crypto::key_manager::get_cached_key().is_none() {
        let _ = crate::crypto::key_manager::init_or_load_key(sp.as_deref());
    }

    let _ = crate::crypto::file_storage::append_message_to_project(sp.as_deref(), &project_id, crate::crypto::file_storage::EncryptedProjectMessage {
        id: msg_id.clone(),
        role_id: "builtin_user".to_string(),
        content: retry_msg.clone(),
        message_type: "task_retry".to_string(),
        prompt_tokens: 0,
        completion_tokens: 0,
        created_at: now,
    });

    // Re-dispatch the task
    do_dispatch_task(&app, &pool, &task_id, &assignee, &project_id, &title, &body, priority, Some(&format!("任务重试（第 {} 次）", retry_count + 1)), "retry").await?;

    let _ = crate::commands::project::record_activity(&app, &project_id, Some(&assignee), "task_retried", Some("task"), Some(&task_id), &format!("重试任务（第 {} 次）: {}", retry_count + 1, title)).await;

    let _ = app.emit("task_status_changed", serde_json::json!({
        "projectId": project_id,
        "taskId": task_id,
        "newStatus": "ready",
        "retryCount": retry_count + 1,
    }));

    crate::commands::helpers::debounced_emit(&app, &project_id, "tasks");
    crate::commands::helpers::debounced_emit(&app, &project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(&app, &project_id, "artifacts");

    Ok(())
}

#[tauri::command]
pub async fn list_project_boards(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectBoard>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, project_id, name, description, sort_order, is_default, created_at, updated_at FROM project_boards WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, name, description, sort_order, is_default, created_at, updated_at)| db::ProjectBoard {
        id, project_id, name, description, sort_order, is_default, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_board(app: AppHandle, req: db::CreateProjectBoardRequest) -> Result<db::ProjectBoard, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let description = req.description.unwrap_or_default();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_boards WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(-1) + 1;

    let board_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM project_boards WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let is_default = if board_count == 0 { 1 } else { 0 };

    sqlx::query("INSERT INTO project_boards (id, project_id, name, description, sort_order, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.name)
        .bind(&description)
        .bind(sort_order)
        .bind(is_default)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectBoard {
        id, project_id: req.project_id, name: req.name, description, sort_order, is_default, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_board(app: AppHandle, id: String, req: db::UpdateProjectBoardRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let current: Option<(String, String, i64)> = sqlx::query_as(
        "SELECT name, description, sort_order FROM project_boards WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_name, cur_desc, cur_sort) = current.ok_or("Board not found")?;
    let name = req.name.unwrap_or(cur_name);
    let description = req.description.unwrap_or(cur_desc);
    let sort_order = req.sort_order.unwrap_or(cur_sort);

    sqlx::query("UPDATE project_boards SET name = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(sort_order)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project_board(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let is_default: Option<i64> = sqlx::query_scalar("SELECT is_default FROM project_boards WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if is_default == Some(1) {
        return Err("Cannot delete default board".to_string());
    }

    sqlx::query("DELETE FROM project_boards WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn archive_project_task(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: Option<(String, String)> = sqlx::query_as(
        "SELECT title, status FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (title, _status) = task.ok_or("Task not found")?;

    sqlx::query("UPDATE project_tasks SET status = 'archived', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let project_id: Option<String> = sqlx::query_scalar(
        "SELECT project_id FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(pid) = project_id {
        let _ = record_activity(&app, &pid, None, "task_archived", Some("task"), Some(&id), &format!("归档了任务：{}", title)).await;
    }

    Ok(())
}

#[tauri::command]
pub async fn update_message_tokens(app: AppHandle, message_id: String, project_id: String, prompt_tokens: i64, completion_tokens: i64) -> Result<(), String> {
    let pool = get_pool(&app)?;

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

    file_storage::update_project_message_tokens(sp.as_deref(), &project_id, &message_id, prompt_tokens, completion_tokens)?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project_task(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_tasks WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_project_artifact(app: AppHandle, id: String, title: Option<String>, content: Option<String>, file_path: Option<String>, status: Option<String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let artifact: Option<(String, String, String, String)> = sqlx::query_as(
        "SELECT title, content, file_path, status FROM project_artifacts WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_title, cur_content, cur_file_path, cur_status) = artifact.ok_or("Artifact not found")?;

    let new_title = title.unwrap_or(cur_title);
    let new_content = content.unwrap_or(cur_content);
    let new_file_path = file_path.unwrap_or(cur_file_path);
    let new_status = status.unwrap_or(cur_status);

    sqlx::query("UPDATE project_artifacts SET title = ?, content = ?, file_path = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(&new_title)
        .bind(&new_content)
        .bind(&new_file_path)
        .bind(&new_status)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

