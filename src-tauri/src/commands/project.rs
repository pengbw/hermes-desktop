use crate::commands::helpers::{self, AppState, call_hermes_api_non_streaming};
use crate::crypto::{file_storage, key_manager};
use crate::database::models as db;
use sqlx::{Row, SqlitePool};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

use super::project_workflow::sync_workflow_to_file;
use super::project_execution::start_workflow_run;
pub(crate) fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<AppState>();
    Ok(state.db_pool.clone())
}

struct ContextTagRegex {
    re1: regex::Regex,
    re2: regex::Regex,
    re3: regex::Regex,
}

static CTX_TAG_REGEX: OnceLock<ContextTagRegex> = OnceLock::new();

pub(crate) fn clean_context_tags(text: &str) -> String {
    let regs = CTX_TAG_REGEX.get_or_init(|| ContextTagRegex {
        re1: regex::Regex::new(r"<memory[^>]*>[\s\S]*?</memory>").unwrap(),
        re2: regex::Regex::new(r"\[memory\][\s\S]*?\[/memory\]").unwrap(),
        re3: regex::Regex::new(r"<!--\s*memory[\s\S]*?-->").unwrap(),
    });
    let result = regs.re1.replace_all(text, "").to_string();
    let result = regs.re2.replace_all(&result, "").to_string();
    regs.re3.replace_all(&result, "").to_string()
}

pub(crate) async fn record_activity(app: &AppHandle, project_id: &str, role_id: Option<&str>, action: &str, target_type: Option<&str>, target_id: Option<&str>, detail: &str) -> Result<(), String> {
    let pool = get_pool(app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO project_activities (id, project_id, role_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(project_id)
        .bind(role_id.unwrap_or(""))
        .bind(action)
        .bind(target_type.unwrap_or(""))
        .bind(target_id.unwrap_or(""))
        .bind(detail)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("project_activity", serde_json::json!({
        "projectId": project_id,
        "action": action,
        "roleId": role_id.unwrap_or(""),
        "targetType": target_type.unwrap_or(""),
        "targetId": target_id.unwrap_or(""),
        "detail": detail,
    }));

    Ok(())
}

pub(crate) async fn mark_auto_delegate_failure(
    app: &AppHandle,
    project_id: &str,
    role_id: &str,
    event_id: Option<&str>,
    error_message: &str,
    task_id: Option<&str>,
) -> Result<(), String> {
    let pool = get_pool(app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let running_task_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM project_tasks WHERE project_id = ? AND assignee = ? AND status = 'running'"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    if let Some(tid) = task_id {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'failed', result = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? \
             WHERE id = ? AND status = 'running'"
        )
        .bind(error_message)
        .bind(now)
        .bind(now)
        .bind(tid)
        .execute(&pool)
        .await;
    } else {
        let _ = sqlx::query(
            "UPDATE project_tasks SET status = 'failed', result = ?, completed_at = COALESCE(completed_at, ?), updated_at = ? \
             WHERE project_id = ? AND assignee = ? AND status = 'running'"
        )
        .bind(error_message)
        .bind(now)
        .bind(now)
        .bind(project_id)
        .bind(role_id)
        .execute(&pool)
        .await;
    }

    let running_steps: Vec<(String, i64)> = sqlx::query_as(
        "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
         JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
         WHERE wr.project_id = ? AND wr.status = 'running' \
         AND wrs.role_id = ? AND wrs.status = 'running'"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    for (run_id, step_index) in &running_steps {
        let _ = sqlx::query(
            "UPDATE workflow_run_steps SET status = 'failed', completed_at = ?, output = ? \
             WHERE run_id = ? AND step_index = ? AND status = 'running'"
        )
        .bind(now)
        .bind(error_message)
        .bind(run_id)
        .bind(step_index)
        .execute(&pool)
        .await;

        let _ = sqlx::query(
            "UPDATE workflow_runs SET status = 'failed', completed_at = ? \
             WHERE id = ? AND status = 'running'"
        )
        .bind(now)
        .bind(run_id)
        .execute(&pool)
        .await;
    }

    crate::commands::helpers::debounced_emit(app, project_id, "tasks");
    crate::commands::helpers::debounced_emit(app, project_id, "workflow_steps");
    crate::commands::helpers::debounced_emit(app, project_id, "artifacts");

    // 将角色 in_progress 状态的产物标记为失败，让角色状态恢复空闲
    let _ = sqlx::query(
        "UPDATE project_artifacts SET status = 'failed', review_comment = ?, updated_at = ? WHERE project_id = ? AND role_id = ? AND status = 'in_progress'"
    )
    .bind(error_message)
    .bind(now)
    .bind(project_id)
    .bind(role_id)
    .execute(&pool)
    .await;

    for task_id in running_task_ids {
        let _ = app.emit("task_status_changed", serde_json::json!({
            "projectId": project_id,
            "taskId": task_id,
            "newStatus": "failed",
        }));
    }

    let _ = app.emit("workflow_step_changed", serde_json::json!({
        "projectId": project_id,
        "fromRoleId": role_id,
        "error": error_message,
    }));

    if let Some(eid) = event_id {
        let _ = app.emit(eid, serde_json::json!({
            "projectId": project_id,
            "toRoleId": role_id,
            "error": error_message,
            "done": true,
        }));
    }

    let _ = record_activity(
        app,
        project_id,
        Some(role_id),
        "auto_delegate_failed",
        Some("workflow"),
        None,
        error_message,
    )
    .await;

    Ok(())
}

pub(crate) async fn repair_legacy_software_dev_workflow(
    pool: &SqlitePool,
    project_id: Option<&str>,
) -> Result<(), String> {
    let mut query = String::from(
        "SELECT DISTINCT project_id FROM project_workflows \
         WHERE from_role_id = 'builtin_software_dev_reviewer' \
         AND to_role_id = 'builtin_software_dev_dev' \
         AND artifact_type = '审查反馈' \
         AND transition_type = 'need_confirm'",
    );
    if project_id.is_some() {
        query.push_str(" AND project_id = ?");
    }

    let mut q = sqlx::query_scalar::<_, String>(&query);
    if let Some(pid) = project_id {
        q = q.bind(pid);
    }

    let project_ids = q.fetch_all(pool).await.map_err(|e| e.to_string())?;

    for pid in project_ids {
        let qa_to_reviewer_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM project_workflows \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_qa' \
             AND to_role_id = 'builtin_software_dev_reviewer' \
             AND artifact_type = '测试报告'",
        )
        .bind(&pid)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

        if qa_to_reviewer_count == 0 {
            continue;
        }

        sqlx::query(
            "UPDATE project_workflows SET transition_type = 'need_confirm' \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_qa' \
             AND to_role_id = 'builtin_software_dev_reviewer' \
             AND artifact_type = '测试报告'",
        )
        .bind(&pid)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        sqlx::query(
            "DELETE FROM project_workflows \
             WHERE project_id = ? \
             AND from_role_id = 'builtin_software_dev_reviewer' \
             AND to_role_id = 'builtin_software_dev_dev' \
             AND artifact_type = '审查反馈' \
             AND transition_type = 'need_confirm'",
        )
        .bind(&pid)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub(crate) async fn seed_builtin_templates(pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();

    let templates_data = crate::database::seeds::load_project_templates();

    for (idx, tmpl) in templates_data.templates.iter().enumerate() {
        let id = format!("builtin_{}", tmpl.id);
        sqlx::query(
            "INSERT INTO project_templates (id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at) VALUES (?, '', ?, '', '', '', 1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET icon=excluded.icon, sort_order=excluded.sort_order, updated_at=excluded.updated_at"
        )
        .bind(&id)
        .bind(&tmpl.icon)
        .bind(idx as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    for (i, role) in templates_data.templates.iter().flat_map(|t| &t.roles).enumerate() {
        let id = format!("builtin_{}", role.id);
        sqlx::query(
            "INSERT INTO ai_roles (id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at) VALUES (?, '', ?, ?, '', '', '', '', 'default', ?, ?, ?, 1, 100, 'neutral', ?, ?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname, icon=excluded.icon, avatar_preset=excluded.avatar_preset, avatar_color=excluded.avatar_color, sort_order=excluded.sort_order, updated_at=excluded.updated_at"
        )
        .bind(&id)
        .bind(&role.nickname)
        .bind(&role.icon)
        .bind(&role.avatar_preset)
        .bind(&role.avatar_color)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    for tmpl in &templates_data.templates {
        for wf in &tmpl.workflows {
            let id = format!("builtin_{}", wf.id);
            let template_id = format!("builtin_{}", tmpl.id);
            let sort_order: i64 = wf.id.rsplit('_').next()
                .map(|s| s.trim_start_matches("wf").parse().unwrap_or(0))
                .unwrap_or(0);
            let from_role_id = match &wf.from_role_id {
                Some(r) => format!("builtin_{}", r),
                None => "start".to_string(),
            };
            let to_role_id = if wf.to_role_id == "end" { "end".to_string() } else { format!("builtin_{}", wf.to_role_id) };
            let reject_to_role_id = wf.reject_to_role_id.as_ref().map(|r| format!("builtin_{}", r));

            sqlx::query(
                "INSERT INTO template_workflows (id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order) VALUES (?, ?, ?, ?, '', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET from_role_id=excluded.from_role_id, to_role_id=excluded.to_role_id, transition_type=excluded.transition_type, reject_to_role_id=excluded.reject_to_role_id, sort_order=excluded.sort_order"
            )
            .bind(&id)
            .bind(&template_id)
            .bind(&from_role_id)
            .bind(&to_role_id)
            .bind(&wf.transition_type)
            .bind(&reject_to_role_id)
            .bind(sort_order)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    sqlx::query("DELETE FROM ai_roles WHERE id = 'user'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn list_project_templates(app: AppHandle, locale: Option<String>) -> Result<Vec<db::ProjectTemplateDetail>, String> {
    let pool = get_pool(&app)?;

    let _ = seed_builtin_templates(&pool).await;

    let loc = locale.as_deref().unwrap_or("zh-CN");
    let seeds_data = crate::database::seeds::load_project_templates();

    let mut templates = sqlx::query_as::<_, db::ProjectTemplate>(
        "SELECT id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at FROM project_templates ORDER BY sort_order ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    for tmpl in &mut templates {
        if tmpl.is_builtin {
            let seed_id = tmpl.id.strip_prefix("builtin_").unwrap_or(&tmpl.id);
            if let Some(seed) = seeds_data.templates.iter().find(|s| s.id == seed_id) {
                tmpl.name = crate::database::seeds::resolve_localized(&seed.name, loc).to_string();
                tmpl.description = crate::database::seeds::resolve_localized(&seed.description, loc).to_string();
                tmpl.project_rule = crate::database::seeds::resolve_localized(&seed.project_rule, loc).to_string();
                tmpl.project_guidelines = crate::database::seeds::resolve_localized(&seed.project_guidelines, loc).to_string();
            }
        }
    }

    let mut result = Vec::new();
    for tmpl in templates {
        let mut workflows = sqlx::query_as::<_, db::TemplateWorkflow>(
            "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
        )
        .bind(&tmpl.id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        for wf in &mut workflows {
            let wf_seed_id = wf.id.strip_prefix("builtin_").unwrap_or(&wf.id);
            for seed_tmpl in &seeds_data.templates {
                if let Some(seed_wf) = seed_tmpl.workflows.iter().find(|w| w.id == wf_seed_id) {
                    wf.artifact_type = crate::database::seeds::resolve_localized(&seed_wf.artifact_type, loc).to_string();
                    break;
                }
            }
        }

        let mut role_ids: Vec<String> = Vec::new();
        for w in &workflows {
            if let Some(ref from) = w.from_role_id {
                role_ids.push(from.clone());
            }
            role_ids.push(w.to_role_id.clone());
        }
        role_ids.sort();
        role_ids.dedup();

        let mut roles = Vec::new();
        for rid in &role_ids {
            if let Some(mut role) = sqlx::query_as::<_, db::AiRole>(
                "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles WHERE id = ?"
            )
            .bind(rid)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?
            {
                if role.is_builtin {
                    let seed_id = role.id.strip_prefix("builtin_").unwrap_or(&role.id);
                    for seed_tmpl in &seeds_data.templates {
                        if let Some(seed) = seed_tmpl.roles.iter().find(|r| r.id == seed_id) {
                            role.name = crate::database::seeds::resolve_localized(&seed.name, loc).to_string();
                            role.description = crate::database::seeds::resolve_localized(&seed.description, loc).to_string();
                            role.responsibilities = crate::database::seeds::resolve_localized(&seed.responsibilities, loc).to_string();
                            role.soul_content = crate::database::seeds::resolve_localized(&seed.soul_content, loc).to_string();
                            break;
                        }
                    }
                }
                roles.push(role);
            }
        }

        result.push(db::ProjectTemplateDetail {
            template: tmpl,
            roles,
            workflows,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn create_project_from_template(app: AppHandle, req: db::CreateProjectFromTemplateRequest, locale: Option<String>) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;

    let _ = seed_builtin_templates(&pool).await;

    let loc = locale.as_deref().unwrap_or("zh-CN");
    let seeds_data = crate::database::seeds::load_project_templates();

    log::info!("create_project_from_template: template_id={}", req.template_id);

    let tmpl = sqlx::query_as::<_, db::ProjectTemplate>(
        "SELECT id, name, icon, description, project_rule, project_guidelines, is_builtin, sort_order, created_at, updated_at FROM project_templates WHERE id = ?"
    )
    .bind(&req.template_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Template not found")?;

    let (description, project_rule, project_guidelines) = if tmpl.is_builtin {
        let seed_id = tmpl.id.strip_prefix("builtin_").unwrap_or(&tmpl.id);
        if let Some(seed) = seeds_data.templates.iter().find(|s| s.id == seed_id) {
            (
                crate::database::seeds::resolve_localized(&seed.description, loc).to_string(),
                crate::database::seeds::resolve_localized(&seed.project_rule, loc).to_string(),
                crate::database::seeds::resolve_localized(&seed.project_guidelines, loc).to_string(),
            )
        } else {
            (tmpl.description.clone(), tmpl.project_rule.clone(), tmpl.project_guidelines.clone())
        }
    } else {
        (tmpl.description.clone(), tmpl.project_rule.clone(), tmpl.project_guidelines.clone())
    };

    let template_workflows = sqlx::query_as::<_, db::TemplateWorkflow>(
        "SELECT id, template_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, sort_order FROM template_workflows WHERE template_id = ? ORDER BY sort_order ASC"
    )
    .bind(&req.template_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut role_ids: Vec<String> = Vec::new();
    for w in &template_workflows {
        if let Some(ref from) = w.from_role_id {
            if !from.is_empty() && from != "start" && from != "end" {
                role_ids.push(from.clone());
            }
        }
        if !w.to_role_id.is_empty() && w.to_role_id != "start" && w.to_role_id != "end" {
            role_ids.push(w.to_role_id.clone());
        }
    }
    role_ids.sort();
    role_ids.dedup();

    let now = chrono::Utc::now().timestamp_millis();
    let project_id = uuid::Uuid::new_v4().to_string();
    let icon = req.icon.unwrap_or_else(|| tmpl.icon.clone());
    let description = req.description.unwrap_or(description);
    let office_theme = req.office_theme.unwrap_or_else(|| "cozy".to_string());

    let workspace_root = sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("{}/hermes-workspace", dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_else(|| ".".to_string())));
    let slug: String = req.name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let workspace_path = std::path::PathBuf::from(workspace_root.trim_end_matches(|c| c == '/' || c == '\\')).join(&slug).to_string_lossy().to_string();
    let _ = std::fs::create_dir_all(&workspace_path);

    sqlx::query(
        "INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, '', ?, ?, ?, ?, ?)"
    )
    .bind(&project_id)
    .bind(&req.name)
    .bind(&description)
    .bind(&workspace_path)
    .bind(&icon)
    .bind(&project_rule)
    .bind(&project_guidelines)
    .bind(&office_theme)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    log::info!("create_project_from_template: role_ids={:?}", role_ids);

    for (i, role_id) in role_ids.iter().enumerate() {
        let member_id = uuid::Uuid::new_v4().to_string();
        log::info!("create_project_from_template: inserting member {} role_id={} project_id={}", i, role_id, project_id);
        let result = sqlx::query(
            "INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, sort_order, created_at, updated_at) VALUES (?, ?, ?, '', '', '', ?, ?, ?)"
        )
        .bind(&member_id)
        .bind(&project_id)
        .bind(role_id)
        .bind(i as i64)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
        match result {
            Ok(r) => log::info!("create_project_from_template: member inserted rows_affected={}", r.rows_affected()),
            Err(e) => log::error!("create_project_from_template: member insert failed: {}", e),
        }
    }

    // 创建主流程组
    let primary_group_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO project_workflow_groups (id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at) VALUES (?, ?, '主流程', 1, 1, NULL, 0, ?, ?)"
    )
    .bind(&primary_group_id)
    .bind(&project_id)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    for twf in &template_workflows {
        let wf_id = uuid::Uuid::new_v4().to_string();
        let from_role_id_for_insert = twf.from_role_id.as_ref().filter(|s| !s.is_empty());

        let artifact_type = if twf.artifact_type.is_empty() {
            let wf_seed_id = twf.id.strip_prefix("builtin_").unwrap_or(&twf.id);
            seeds_data.templates.iter()
                .flat_map(|t| &t.workflows)
                .find(|w| w.id == wf_seed_id)
                .map(|w| crate::database::seeds::resolve_localized(&w.artifact_type, loc).to_string())
                .unwrap_or_default()
        } else {
            twf.artifact_type.clone()
        };

        sqlx::query(
            "INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, '', '', '', '', 1, ?, ?, ?)"
        )
        .bind(&wf_id)
        .bind(&project_id)
        .bind(from_role_id_for_insert)
        .bind(&twf.to_role_id)
        .bind(&artifact_type)
        .bind(&twf.transition_type)
        .bind(&twf.reject_to_role_id)
        .bind(&primary_group_id)
        .bind(twf.sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    let _ = sync_workflow_to_file(app.clone(), project_id.clone()).await;

    let project = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(project)
}

#[tauri::command]
pub async fn preprocess_skill_template(app: AppHandle, project_id: String, role_id: String, template: String) -> Result<String, String> {
    let pool = get_pool(&app)?;

    let project_name: Option<String> = sqlx::query_scalar("SELECT name FROM projects WHERE id = ?")
        .bind(&project_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role_name: Option<String> = sqlx::query_scalar(
        "SELECT COALESCE(nickname, name) FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut result = template;
    result = result.replace("{{project_name}}", project_name.as_deref().unwrap_or(""));
    result = result.replace("{{role_name}}", role_name.as_deref().unwrap_or(""));
    result = result.replace("{{role_id}}", &role_id);
    result = result.replace("{{project_id}}", &project_id);

    Ok(result)
}
pub(crate) async fn extract_and_save_memory(app: AppHandle, project_id: String, role_id: String, user_message: String, assistant_content: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let api_base = helpers::hermes_api_base_from_pool(&pool).await;
    let api_key = helpers::hermes_api_key_from_pool(&pool).await;

    let memory_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM project_memories WHERE project_id = ? AND role_id = ?"
    )
    .bind(&project_id)
    .bind(&role_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if memory_count.0 >= 50 {
        return Ok(());
    }

    let combined = format!("用户：{}\n\n角色回复：{}", 
        if user_message.len() > 500 { user_message.chars().take(500).collect::<String>() } else { user_message.clone() },
        if assistant_content.len() > 1000 { assistant_content.chars().take(1000).collect::<String>() } else { assistant_content.clone() }
    );

    let extract_prompt = format!(
        "分析以下对话，提取值得长期记住的关键信息。只提取以下类型的信息：\n\
        1. 重要决策和结论\n\
        2. 技术方案选择及理由\n\
        3. 项目约束和规范\n\
        4. 关键事实和数据\n\n\
        如果对话中没有值得记住的信息，请回复空字符串。\n\
        如果有，请用简洁的一句话描述，格式为：类别|内容\n\
        类别可选：decision（决策）、tech（技术方案）、constraint（约束）、fact（事实）\n\
        例如：decision|采用React作为前端框架\n\
        例如：constraint|API响应时间不超过200ms\n\n\
        对话内容：\n{}", combined
    );

        let body = serde_json::json!({
            "model": "default",
            "messages": [{"role": "user", "content": extract_prompt}],
        });

        let response = match call_hermes_api_non_streaming(&api_base, &api_key, &project_id, body).await {
            Ok(resp) => resp,
            Err(e) => {
                log::warn!("extract_and_save_memory: API call failed: {}", e);
                return Ok(());
            }
        };

    if !response.status().is_success() {
        return Ok(());
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").trim().to_string();

    if content.is_empty() {
        return Ok(());
    }

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() { continue; }

        let (category, memory_content) = if let Some(pos) = line.find('|') {
            let cat = &line[..pos];
            let mem = &line[pos + 1..];
            match cat {
                "decision" | "tech" | "constraint" | "fact" => (cat.to_string(), mem.to_string()),
                _ => ("general".to_string(), line.to_string()),
            }
        } else {
            ("general".to_string(), line.to_string())
        };

        if memory_content.is_empty() { continue; }

        let similar: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM project_memories WHERE project_id = ? AND role_id = ? AND content LIKE ? LIMIT 1"
        )
        .bind(&project_id)
        .bind(&role_id)
        .bind(format!("%{}%", &memory_content.chars().take(20).collect::<String>()))
        .fetch_optional(&pool)
        .await
        .unwrap_or(None);

        if similar.is_some() { continue; }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let importance = match category.as_str() {
            "decision" => 3,
            "constraint" => 3,
            "tech" => 2,
            _ => 1,
        };

        let _ = sqlx::query(
            "INSERT INTO project_memories (id, project_id, role_id, category, content, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&project_id)
        .bind(&role_id)
        .bind(&category)
        .bind(&memory_content)
        .bind(importance)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
    }

    Ok(())
}

async fn is_workflow_start_role(pool: &sqlx::SqlitePool, project_id: &str, role_id: &str) -> bool {
    let start_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM project_workflows WHERE project_id = ? AND from_role_id = 'start' AND to_role_id = ?"
    )
    .bind(project_id)
    .bind(role_id)
    .fetch_one(pool)
    .await
    .unwrap_or(0);

    start_count > 0
}

#[tauri::command]
pub(crate) async fn do_dispatch_task(app: &AppHandle, pool: &sqlx::SqlitePool, task_id: &str, role_id: &str, project_id: &str, title: &str, body: &str, priority: i32, message: Option<&str>, dispatch_type: &str) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();

    let current_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM project_tasks WHERE id = ?"
    )
    .bind(task_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    match current_status.as_deref() {
        Some("done") | Some("archived") => {
            log::info!("do_dispatch_task: skipping task={} with status={}", task_id, current_status.unwrap_or_default());
            return Ok(());
        }
        Some("running") => {
            log::info!("do_dispatch_task: task={} already running, checking for duplicate dispatch", task_id);
        }
        _ => {}
    }

    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM task_dispatches WHERE task_id = ? AND role_id = ? AND status = 'sent'"
    )
    .bind(task_id)
    .bind(role_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if existing.is_some() {
        log::info!("do_dispatch_task: already dispatched task={} to role={}", task_id, role_id);
        return Ok(());
    }

    let dispatch_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO task_dispatches (id, task_id, role_id, dispatch_type, message, status, created_at) VALUES (?, ?, ?, ?, ?, 'sent', ?)"
    )
    .bind(&dispatch_id)
    .bind(task_id)
    .bind(role_id)
    .bind(dispatch_type)
    .bind(message.unwrap_or(""))
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    sqlx::query(
        "UPDATE project_tasks SET status = 'ready', started_at = COALESCE(started_at, ?), claim_lock = ?, claim_expire_at = ?, updated_at = ? WHERE id = ?"
    )
    .bind(now)
    .bind(role_id)
    .bind(now + 30 * 60 * 1000)
    .bind(now)
    .bind(task_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = record_activity(app, project_id, Some(role_id), "task_dispatched", Some("task"), Some(task_id), &format!("派发任务：{}", title)).await;

    let mut task_message = format!("你被分配了一个任务：\n**任务标题**：{}\n**优先级**：{}", title, match priority {
        p if p >= 3 => "高",
        p if p >= 2 => "中",
        _ => "低",
    });
    if !body.is_empty() {
        task_message.push_str(&format!("\n**任务描述**：{}", body));
    }
    if let Some(msg) = message {
        if !msg.is_empty() {
            task_message.push_str(&format!("\n**附加说明**：{}", msg));
        }
    }

    let msg_id = uuid::Uuid::new_v4().to_string();
    let sp: Option<String> = sqlx::query_scalar(
        "SELECT value FROM app_config WHERE key = 'conversation_storage_path'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .filter(|v: &String| !v.is_empty());

    if key_manager::get_cached_key().is_none() {
        let _ = key_manager::init_or_load_key(sp.as_deref());
    }

    let _ = file_storage::append_message_to_project(sp.as_deref(), project_id, file_storage::EncryptedProjectMessage {
        id: msg_id.clone(),
        role_id: "builtin_user".to_string(),
        content: task_message.clone(),
        message_type: "task_dispatch".to_string(),
        prompt_tokens: 0,
        completion_tokens: 0,
        created_at: now,
    });

    let event_id = format!("task_dispatch_{}_{}", task_id, now);

    let is_start = is_workflow_start_role(pool, project_id, role_id).await;
    log::info!("do_dispatch_task: role_id={}, project_id={}, is_workflow_start={}", role_id, project_id, is_start);

    if is_start {
        // For start roles, start the workflow run which will trigger auto_delegate_chat
        let app_wf = app.clone();
        let project_id_wf = project_id.to_string();
        let initial_msg = title.to_string();
        let task_id_for_wf = task_id.to_string();
        match start_workflow_run(app_wf, project_id_wf, initial_msg, None, Some(task_id_for_wf)).await {
            Ok(run) => log::info!("start_workflow_run: created run_id={}, status={}", run.id, run.status),
            Err(e) => log::error!("start_workflow_run: error={}", e),
        }
    } else {
        // For non-start roles, delegate directly
        let app_clone = app.clone();
        let project_id_clone = project_id.to_string();
        let role_id_clone = role_id.to_string();
        let task_message_clone = task_message.clone();
        let found_task_id_clone = Some(task_id.to_string());
        tauri::async_runtime::spawn(async move {
            let _ = crate::commands::project_execution::auto_delegate_chat(
                app_clone, project_id_clone, "builtin_user".to_string(), role_id_clone, task_message_clone, event_id, found_task_id_clone,
            ).await;
        });
    }

    let _ = app.emit("task_dispatched", serde_json::json!({
        "taskId": task_id,
        "roleId": role_id,
        "dispatchId": dispatch_id,
    }));

    Ok(())
}

#[tauri::command]
pub async fn list_projects(app: AppHandle) -> Result<Vec<db::Project>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects ORDER BY is_favorite DESC, updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub async fn create_empty_project(app: AppHandle, req: db::CreateEmptyProjectRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let workspace_root = sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| format!("{}/hermes-workspace", dirs::home_dir().map(|h| h.to_string_lossy().to_string()).unwrap_or_else(|| ".".to_string())));

    let slug: String = req.name.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let workspace_path = std::path::PathBuf::from(workspace_root.trim_end_matches(|c| c == '/' || c == '\\')).join(&slug).to_string_lossy().to_string();
    let _ = std::fs::create_dir_all(&workspace_path);

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_default();
    let office_theme = req.office_theme.unwrap_or_else(|| "cozy".to_string());

    let project_rule = "自定义项目，由项目创建者自主定义协作规范与交付标准。".to_string();
    let project_guidelines = "1. 自行定义角色职责与工作流程\n2. 明确每个任务的验收标准\n3. 产出物需经过审核确认\n4. 保持团队协作和信息同步".to_string();

    sqlx::query(
        "INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, '', ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.name)
    .bind(&description)
    .bind(&workspace_path)
    .bind(&icon)
    .bind(&project_rule)
    .bind(&project_guidelines)
    .bind(&office_theme)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &id, None, "project_created", Some("project"), Some(&id), "创建自定义项目").await;

    Ok(db::Project {
        id,
        name: req.name,
        description,
        workspace_path,
        status: "active".to_string(),
        tag: "none".to_string(),
        icon,
        is_favorite: 0,
        cover_image: String::new(),
        project_rule,
        project_guidelines,
        office_theme,
        office_layout: String::new(),
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn create_project(app: AppHandle, req: db::CreateProjectRequest) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let workspace_root: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'workspace_root'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let workspace_root = workspace_root.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|h| h.join("hermes-workspace").to_string_lossy().to_string())
            .unwrap_or_else(|| "./hermes-workspace".to_string())
    });

    let slug: String = req.name
        .chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else if c == ' ' || c == '-' { '-' } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    let workspace_path = std::path::PathBuf::from(workspace_root.trim_end_matches(|c| c == '/' || c == '\\')).join(&slug).to_string_lossy().to_string();

    let _ = std::fs::create_dir_all(&workspace_path);

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_default();
    let cover_image = req.cover_image.unwrap_or_default();
    let project_rule = req.project_rule.unwrap_or_default();
    let project_guidelines = req.project_guidelines.unwrap_or_default();
    let office_theme = req.office_theme.unwrap_or_default();
    let office_layout = req.office_layout.unwrap_or_default();

    sqlx::query("INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 'none', ?, 0, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&description)
        .bind(&workspace_path)
        .bind(&icon)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Project {
        id, name: req.name, description, workspace_path, status: "active".to_string(), tag: "none".to_string(), icon, is_favorite: 0, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project(app: AppHandle, req: db::UpdateProjectRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let project: db::Project = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(project.name);
    let description = req.description.unwrap_or(project.description);
    let status = req.status.unwrap_or(project.status);
    let tag = req.tag.unwrap_or(project.tag);
    let icon = req.icon.unwrap_or(project.icon);
    let is_favorite = req.is_favorite.map(|v| if v { 1i64 } else { 0i64 }).unwrap_or(project.is_favorite);
    let cover_image = req.cover_image.unwrap_or(project.cover_image);
    let project_rule = req.project_rule.unwrap_or(project.project_rule);
    let project_guidelines = req.project_guidelines.unwrap_or(project.project_guidelines);
    let office_theme = req.office_theme.unwrap_or(project.office_theme);
    let office_layout = req.office_layout.unwrap_or(project.office_layout);

    sqlx::query("UPDATE projects SET name = ?, description = ?, status = ?, tag = ?, icon = ?, is_favorite = ?, cover_image = ?, project_rule = ?, project_guidelines = ?, office_theme = ?, office_layout = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(&status)
        .bind(&tag)
        .bind(&icon)
        .bind(is_favorite)
        .bind(&cover_image)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_project(app: AppHandle, id: String) -> Result<(), String> {
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

    let _ = file_storage::delete_project_messages_file(sp.as_deref(), &id);

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_tasks WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_messages WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_artifacts WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_workflows WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_members WHERE project_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_members(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMember>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
        "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at)| db::ProjectMember {
        id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn add_project_member(app: AppHandle, req: db::CreateProjectMemberRequest) -> Result<db::ProjectMember, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM project_members WHERE project_id = ?")
        .bind(&req.project_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let profile_name = req.profile_name.unwrap_or_default();
    let custom_soul = req.custom_soul.unwrap_or_default();
    let custom_responsibilities = req.custom_responsibilities.unwrap_or_default();
    let equipment_level = req.equipment_level.unwrap_or(1);

    sqlx::query("INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&profile_name)
        .bind(&custom_soul)
        .bind(&custom_responsibilities)
        .bind(equipment_level)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role: Option<(String,)> = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM ai_roles WHERE id = ?"
    )
    .bind(&req.role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((role_name,)) = role {
        let artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - 产出物", role_name);
        let _ = sqlx::query(
            "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, workflow_run_id, step_index, created_at, updated_at) VALUES (?, ?, ?, '', 'auto', ?, '', '', 'pending', '', NULL, NULL, ?, ?)"
        )
        .bind(&artifact_id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&artifact_title)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await;
    }

    let _ = record_activity(&app, &req.project_id, Some(&req.role_id), "member_added", Some("member"), Some(&id), "加入了项目").await;

    Ok(db::ProjectMember {
        id: id.clone(), project_id: req.project_id.clone(), role_id: req.role_id.clone(), profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_member(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let member: Option<(String, String, String)> = sqlx::query_as(
        "SELECT id, project_id, role_id FROM project_members WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (member_id, project_id, role_id) = member.ok_or("Member not found")?;

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_artifacts WHERE project_id = ? AND role_id = ?")
        .bind(&project_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?)")
        .bind(&project_id)
        .bind(&role_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM project_messages WHERE project_id = ? AND role_id = ?")
        .bind(&project_id)
        .bind(&role_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

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

    let _ = file_storage::delete_role_messages_from_project(sp.as_deref(), &project_id, &role_id);

    sqlx::query("DELETE FROM project_members WHERE id = ?")
        .bind(&member_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let _ = record_activity(&app, &project_id, Some(&role_id), "member_removed", Some("member"), Some(&id), "离开了项目").await;

    Ok(())
}

#[tauri::command]
pub async fn update_member_equipment(app: AppHandle, member_id: String, equipment_level: i64) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_members SET equipment_level = ?, updated_at = ? WHERE id = ?")
        .bind(equipment_level)
        .bind(now)
        .bind(&member_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn export_project(app: AppHandle, project_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let project: Option<db::Project> = sqlx::query_as::<_, db::Project>(
        "SELECT id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let p = project.ok_or("Project not found")?;

    let members: Vec<db::ProjectMember> = {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64, i64, i64)>(
            "SELECT id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at FROM project_members WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at)| db::ProjectMember {
            id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at,
        }).collect()
    };

    let workflows: Vec<db::ProjectWorkflow> = {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, String, String, String, String, String, bool, Option<String>, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, reject_to_role_id, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at,
        }).collect()
    };

    Ok(serde_json::json!({
        "version": 1,
        "project": {
            "name": p.name,
            "description": p.description,
            "status": p.status,
            "tag": p.tag,
            "icon": p.icon,
            "projectRule": p.project_rule,
            "projectGuidelines": p.project_guidelines,
            "officeTheme": p.office_theme,
            "officeLayout": p.office_layout,
        },
        "members": members.iter().map(|m| serde_json::json!({
            "roleId": m.role_id,
            "profileName": m.profile_name,
            "customSoul": m.custom_soul,
            "customResponsibilities": m.custom_responsibilities,
            "equipmentLevel": m.equipment_level,
            "sortOrder": m.sort_order,
        })).collect::<Vec<_>>(),
        "workflows": workflows.iter().map(|w| serde_json::json!({
            "fromRoleId": w.from_role_id,
            "toRoleId": w.to_role_id,
            "artifactType": w.artifact_type,
            "transitionType": w.transition_type,
            "sortOrder": w.sort_order,
        })).collect::<Vec<_>>(),
    }))
}

#[tauri::command]
pub async fn import_project(app: AppHandle, data: serde_json::Value) -> Result<db::Project, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let name = data["project"]["name"].as_str().unwrap_or("导入项目").to_string();
    let description = data["project"]["description"].as_str().unwrap_or("").to_string();
    let status = data["project"]["status"].as_str().unwrap_or("active").to_string();
    let tag = data["project"]["tag"].as_str().unwrap_or("none").to_string();
    let icon = data["project"]["icon"].as_str().unwrap_or("💼").to_string();
    let project_rule = data["project"]["projectRule"].as_str().unwrap_or("").to_string();
    let project_guidelines = data["project"]["projectGuidelines"].as_str().unwrap_or("").to_string();
    let office_theme = data["project"]["officeTheme"].as_str().unwrap_or("cozy").to_string();
    let office_layout = data["project"]["officeLayout"].as_str().unwrap_or("").to_string();

    let slug: String = name.chars()
        .map(|c| if c.is_alphanumeric() { c.to_ascii_lowercase() } else if c == ' ' || c == '-' { '-' } else { '-' })
        .collect::<String>()
        .split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
    let workspace_base = dirs::home_dir()
        .map(|h| h.join("hermes-workspace"))
        .unwrap_or_else(|| std::path::PathBuf::from("./hermes-workspace"));
    let workspace_path = workspace_base.join(&slug).to_string_lossy().to_string();
    let _ = std::fs::create_dir_all(&workspace_path);

    sqlx::query("INSERT INTO projects (id, name, description, workspace_path, status, tag, icon, is_favorite, cover_image, project_rule, project_guidelines, office_theme, office_layout, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&name)
        .bind(&description)
        .bind(&workspace_path)
        .bind(&status)
        .bind(&tag)
        .bind(&icon)
        .bind(&project_rule)
        .bind(&project_guidelines)
        .bind(&office_theme)
        .bind(&office_layout)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(members) = data["members"].as_array() {
        for (idx, m) in members.iter().enumerate() {
            let mid = uuid::Uuid::new_v4().to_string();
            let role_id = m["roleId"].as_str().unwrap_or("").to_string();
            let profile_name = m["profileName"].as_str().unwrap_or("").to_string();
            let custom_soul = m["customSoul"].as_str().unwrap_or("").to_string();
            let custom_responsibilities = m["customResponsibilities"].as_str().unwrap_or("").to_string();
            let equipment_level = m["equipmentLevel"].as_i64().unwrap_or(1);
            let sort_order = m["sortOrder"].as_i64().unwrap_or(idx as i64);

            sqlx::query("INSERT INTO project_members (id, project_id, role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&mid)
                .bind(&id)
                .bind(&role_id)
                .bind(&profile_name)
                .bind(&custom_soul)
                .bind(&custom_responsibilities)
                .bind(equipment_level)
                .bind(sort_order)
                .bind(now)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    if let Some(workflows) = data["workflows"].as_array() {
        // 创建主流程组
        let primary_group_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO project_workflow_groups (id, project_id, name, is_primary, is_valid, parent_group_id, sort_order, created_at, updated_at) VALUES (?, ?, '主流程', 1, 1, NULL, 0, ?, ?)"
        )
        .bind(&primary_group_id)
        .bind(&id)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

        for (idx, w) in workflows.iter().enumerate() {
            let wid = uuid::Uuid::new_v4().to_string();
            let from_role_id = w["fromRoleId"].as_str().map(|s| s.to_string());
            let to_role_id = w["toRoleId"].as_str().unwrap_or("").to_string();
            let artifact_type = w["artifactType"].as_str().unwrap_or("").to_string();
            let transition_type = w["transitionType"].as_str().unwrap_or("auto_push").to_string();
            let task_id = w["taskId"].as_str().unwrap_or("").to_string();
            let condition_expr = w["conditionExpr"].as_str().unwrap_or("").to_string();
            let branch_label = w["branchLabel"].as_str().unwrap_or("").to_string();
            let parallel_group = w["parallelGroup"].as_str().unwrap_or("").to_string();
            let sort_order = w["sortOrder"].as_i64().unwrap_or(idx as i64);

            sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, task_id, condition_expr, branch_label, parallel_group, is_primary, group_id, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)")
                .bind(&wid)
                .bind(&id)
                .bind(&from_role_id)
                .bind(&to_role_id)
                .bind(&artifact_type)
                .bind(&transition_type)
                .bind(&task_id)
                .bind(&condition_expr)
                .bind(&branch_label)
                .bind(&parallel_group)
                .bind(&primary_group_id)
                .bind(sort_order)
                .bind(now)
                .execute(&pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(db::Project {
        id, name, description, workspace_path, status, tag, icon, is_favorite: 0, cover_image: String::new(), project_rule, project_guidelines, office_theme, office_layout, created_at: now, updated_at: now,
    })
}

