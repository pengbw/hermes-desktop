use crate::database::models as db;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
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

    let workspace_path = format!("{}/{}", workspace_root.trim_end_matches('/'), slug);

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
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
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
            "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', 'auto', ?, '', '', 'pending', '', ?, ?)"
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

    Ok(db::ProjectMember {
        id, project_id: req.project_id, role_id: req.role_id, profile_name, custom_soul, custom_responsibilities, equipment_level, sort_order, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_member(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_members WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
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
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at,
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
    let workspace_path = format!("{}/{}", dirs::home_dir().map(|h| h.join("hermes-workspace").to_string_lossy().to_string()).unwrap_or_else(|| "./hermes-workspace".to_string()).trim_end_matches('/'), slug);
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
        for (idx, w) in workflows.iter().enumerate() {
            let wid = uuid::Uuid::new_v4().to_string();
            let from_role_id = w["fromRoleId"].as_str().map(|s| s.to_string());
            let to_role_id = w["toRoleId"].as_str().unwrap_or("").to_string();
            let artifact_type = w["artifactType"].as_str().unwrap_or("").to_string();
            let transition_type = w["transitionType"].as_str().unwrap_or("auto_push").to_string();
            let sort_order = w["sortOrder"].as_i64().unwrap_or(idx as i64);

            sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&wid)
                .bind(&id)
                .bind(&from_role_id)
                .bind(&to_role_id)
                .bind(&artifact_type)
                .bind(&transition_type)
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

#[tauri::command]
pub async fn list_project_workflows(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at,
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
pub async fn trigger_workflow_execution(app: AppHandle, project_id: String, from_role_id: String, artifact_type: Option<String>) -> Result<WorkflowExecutionResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let mut query_str = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? AND from_role_id = ?");
    let mut bind_artifact: Option<String> = None;
    if artifact_type.is_some() {
        query_str.push_str(" AND artifact_type = ?");
        bind_artifact = artifact_type.clone();
    }
    query_str.push_str(" ORDER BY sort_order ASC");

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(&query_str)
        .bind(&project_id)
        .bind(&from_role_id);
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let workflows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut triggered = Vec::new();
    let mut pending = Vec::new();

    for (_id, _project_id, _from_role_id, to_role_id, wf_artifact_type, transition_type, _sort_order, _created_at) in &workflows {
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

        let new_artifact_id = uuid::Uuid::new_v4().to_string();
        let artifact_title = format!("{} - {}", wf_artifact_type, to_role_name);

        match transition_type.as_str() {
            "auto_push" => {
                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'in_progress', '', ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
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
                sqlx::query(
                    "INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, '', ?, ?, '', '', 'submitted', '', ?, ?)"
                )
                .bind(&new_artifact_id)
                .bind(&project_id)
                .bind(to_role_id)
                .bind(wf_artifact_type)
                .bind(&artifact_title)
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
            }
            _ => {}
        }
    }

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

    sqlx::query("INSERT INTO project_workflows (id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.from_role_id)
        .bind(&req.to_role_id)
        .bind(&artifact_type)
        .bind(&transition_type)
        .bind(sort_order)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectWorkflow {
        id, project_id: req.project_id, from_role_id: req.from_role_id, to_role_id: req.to_role_id, artifact_type, transition_type, sort_order, created_at: now,
    })
}

#[tauri::command]
pub async fn remove_project_workflow(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM project_workflows WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn sync_workflow_to_file(app: AppHandle, project_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let workflows = sqlx::query_as::<_, (String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? ORDER BY sort_order ASC"
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
    let workflow_data: Vec<serde_json::Value> = workflows.iter().map(|(id, pid, from, to, artifact, trans, sort, created)| {
        serde_json::json!({
            "id": id,
            "projectId": pid,
            "fromRoleId": from,
            "toRoleId": to,
            "artifactType": artifact,
            "transitionType": trans,
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
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, i64, i64)>(
        "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at FROM project_artifacts WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at)| db::ProjectArtifact {
        id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at,
    }).collect())
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

    sqlx::query("INSERT INTO project_artifacts (id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)")
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

    Ok(db::ProjectArtifact {
        id, project_id: req.project_id, role_id: req.role_id, task_id, artifact_type, title, file_path, content, status, review_comment: String::new(), created_at: now, updated_at: now,
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
    Ok(())
}

#[tauri::command]
pub async fn reject_project_artifact(app: AppHandle, id: String, reason: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE project_artifacts SET status = 'rejected', review_comment = ?, updated_at = ? WHERE id = ?")
        .bind(&reason)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_project_messages(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectMessage>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64)>(
        "SELECT id, project_id, role_id, content, message_type, created_at FROM project_messages WHERE project_id = ? ORDER BY created_at ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, role_id, content, message_type, created_at)| db::ProjectMessage {
        id, project_id, role_id, content, message_type, created_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_message(app: AppHandle, req: db::CreateProjectMessageRequest) -> Result<db::ProjectMessage, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let message_type = req.message_type.unwrap_or_else(|| "text".to_string());

    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.role_id)
        .bind(&req.content)
        .bind(&message_type)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectMessage {
        id, project_id: req.project_id, role_id: req.role_id, content: req.content, message_type, created_at: now,
    })
}

#[tauri::command]
pub async fn list_project_tasks(app: AppHandle, project_id: String) -> Result<Vec<db::ProjectTask>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, i32, Option<String>, Option<String>, String, i64, i64)>(
        "SELECT id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, created_at, updated_at FROM project_tasks WHERE project_id = ? ORDER BY priority DESC, created_at ASC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, created_at, updated_at)| db::ProjectTask {
        id, project_id, title, body, assignee, status, priority, parent_task_id: parent_task_id.unwrap_or_default(), artifact_id: artifact_id.unwrap_or_default(), result, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_project_task(app: AppHandle, req: db::CreateProjectTaskRequest) -> Result<db::ProjectTask, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let body = req.body.unwrap_or_default();
    let assignee = req.assignee.unwrap_or_default();
    let status = req.status.unwrap_or_else(|| "triage".to_string());
    let priority = req.priority.unwrap_or(0);
    let parent_task_id = req.parent_task_id.unwrap_or_default();

    sqlx::query("INSERT INTO project_tasks (id, project_id, title, body, assignee, status, priority, parent_task_id, artifact_id, result, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)")
        .bind(&id)
        .bind(&req.project_id)
        .bind(&req.title)
        .bind(&body)
        .bind(&assignee)
        .bind(&status)
        .bind(priority)
        .bind(&parent_task_id)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::ProjectTask {
        id, project_id: req.project_id, title: req.title, body, assignee, status, priority, parent_task_id, artifact_id: String::new(), result: String::new(), created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_project_task(app: AppHandle, id: String, req: db::UpdateProjectTaskRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let task: Option<(String, String, String, String, i32, String)> = sqlx::query_as(
        "SELECT title, body, assignee, status, priority, result FROM project_tasks WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (cur_title, cur_body, cur_assignee, cur_status, cur_priority, cur_result) = task.ok_or("Task not found")?;

    let new_title = req.title.unwrap_or(cur_title);
    let new_body = req.body.unwrap_or(cur_body);
    let new_assignee = req.assignee.unwrap_or(cur_assignee);
    let new_status = req.status.unwrap_or(cur_status);
    let new_priority = req.priority.unwrap_or(cur_priority);
    let new_result = req.result.unwrap_or(cur_result);

    sqlx::query("UPDATE project_tasks SET title = ?, body = ?, assignee = ?, status = ?, priority = ?, result = ?, updated_at = ? WHERE id = ?")
        .bind(&new_title)
        .bind(&new_body)
        .bind(&new_assignee)
        .bind(&new_status)
        .bind(new_priority)
        .bind(&new_result)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
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

#[tauri::command]
pub async fn execute_workflow_step(app: AppHandle, project_id: String, from_role_id: Option<String>, artifact_type: Option<String>) -> Result<Vec<db::ProjectWorkflow>, String> {
    let pool = get_pool(&app)?;

    let mut query = String::from("SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ?");
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

    let mut q = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(&query)
        .bind(&project_id);
    if let Some(ref fr) = bind_from {
        q = q.bind(fr);
    }
    if let Some(ref at) = bind_artifact {
        q = q.bind(at);
    }

    let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at)| db::ProjectWorkflow {
        id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at,
    }).collect())
}

#[tauri::command]
pub async fn get_project_role_context(app: AppHandle, project_id: String, role_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let role: Option<(String, String, String, String, String, String, String, String, i64, String)> = sqlx::query_as(
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
        let rows = sqlx::query_as::<_, (String, String, Option<String>, String, String, String, i64, i64)>(
            "SELECT id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at FROM project_workflows WHERE project_id = ? AND (from_role_id = ? OR to_role_id = ?) ORDER BY sort_order ASC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at)| db::ProjectWorkflow {
            id, project_id, from_role_id, to_role_id, artifact_type, transition_type, sort_order, created_at,
        }).collect()
    };

    let artifacts: Vec<db::ProjectArtifact> = {
        let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, i64, i64)>(
            "SELECT id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY created_at DESC"
        )
        .bind(&project_id)
        .bind(&role_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        rows.into_iter().map(|(id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at)| db::ProjectArtifact {
            id, project_id, role_id, task_id, artifact_type, title, file_path, content, status, review_comment, created_at, updated_at,
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
            "project_guidelines": project_data.project_guidelines,
        },
        "workflows": workflows,
        "artifacts": artifacts,
    }))
}

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
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

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

    if !mood_hint.is_empty() {
        system_prompt.push_str(&format!("\n\n当前状态：精力{}%，{}{}", role_energy, mood_hint, if role_mood == "exhausted" { "（回复可能较简短）" } else { "" }));
    }

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }

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

    let api_base = "http://127.0.0.1:8642/v1";
    let api_key = "hermes-desktop-local-dev-key";

    let client = reqwest::Client::new();
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

    let recent_msgs: Vec<(String, String, String)> = sqlx::query_as(
        "SELECT role_id, content, message_type FROM project_messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 10"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .rev()
    .collect();

    let mut context_messages: Vec<serde_json::Value> = Vec::new();
    for (msg_role_id, msg_content, _msg_type) in &recent_msgs {
        if *msg_role_id == role_id {
            context_messages.push(serde_json::json!({
                "role": "assistant",
                "content": msg_content
            }));
        } else {
            context_messages.push(serde_json::json!({
                "role": "user",
                "content": msg_content
            }));
        }
    }

    if !context_messages.is_empty() {
        messages.splice(1..1, context_messages);
    }

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
        "stream": true,
    });

    let response = client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("AI service error: {} - {}", status, text));
    }

    let app_handle = app.clone();
    let event_id_clone = event_id.clone();
    tauri::async_runtime::spawn(async move {
        use futures_util::StreamExt;
        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut buffer = String::new();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                    while let Some(pos) = buffer.find("\n") {
                        let line = buffer[..pos].trim().to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if line.starts_with("data: ") {
                            let data = &line[6..];
                            if data == "[DONE]" {
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

                                break;
                            }
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                                    full_content.push_str(content);
                                    let _ = app_handle.emit(&event_id_clone, serde_json::json!({
                                        "chunk": content,
                                        "done": false,
                                    }));
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
                    break;
                }
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn chat_with_project_roles(app: AppHandle, project_id: String, role_ids: Vec<String>, message: String, event_id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let api_base = "http://127.0.0.1:8642/v1";
    let api_key = "hermes-desktop-local-dev-key";
    let client = reqwest::Client::new();

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
        let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");

        let display_name = if role_nickname.is_empty() { role_name.to_string() } else { role_nickname.to_string() };

        let other_mentioned: Vec<String> = role_ids.iter()
            .filter(|id| *id != role_id)
            .filter_map(|id| {
                let ctx = tokio::task::block_in_place(|| {
                    tokio::runtime::Handle::current().block_on(
                        get_project_role_context(app.clone(), project_id.clone(), id.clone())
                    )
                });
                ctx.ok().and_then(|c| {
                    let n = c["role"]["nickname"].as_str().unwrap_or("");
                    let rn = c["role"]["name"].as_str().unwrap_or("");
                    Some(if n.is_empty() { rn.to_string() } else { n.to_string() })
                })
            })
            .collect();

        let mut system_prompt = format!(
            "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}",
            project_name, display_name, role_name, role_resp, role_soul, project_desc
        );

        if !project_guidelines.is_empty() {
            system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
        }

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

        let recent_msgs: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT role_id, content, message_type FROM project_messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 10"
        )
        .bind(&project_id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .rev()
        .collect();

        let mut context_messages: Vec<serde_json::Value> = Vec::new();
        for (msg_role_id, msg_content, _msg_type) in &recent_msgs {
            if *msg_role_id == *role_id {
                context_messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": msg_content
                }));
            } else {
                context_messages.push(serde_json::json!({
                    "role": "user",
                    "content": msg_content
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

        let response = client
            .post(format!("{}/chat/completions", api_base))
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("AI service error for role {}: {} - {}", display_name, status, text));
        }

        let resp_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
        let reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

        let _ = app.emit(&event_id, serde_json::json!({
            "roleIndex": i,
            "roleId": role_id,
            "roleName": display_name,
            "chunk": reply,
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
pub async fn auto_delegate_chat(app: AppHandle, project_id: String, from_role_id: String, to_role_id: String, context_message: String, event_id: String) -> Result<AutoDelegateResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let from_context = get_project_role_context(app.clone(), project_id.clone(), from_role_id.clone()).await?;
    let to_context = get_project_role_context(app.clone(), project_id.clone(), to_role_id.clone()).await?;

    let from_role = &from_context["role"];
    let to_role = &to_context["role"];

    let from_name = from_role["nickname"].as_str().unwrap_or("").to_string();
    let from_name = if from_name.is_empty() { from_role["name"].as_str().unwrap_or("角色A").to_string() } else { from_name };
    let to_name = to_role["nickname"].as_str().unwrap_or("").to_string();
    let to_name = if to_name.is_empty() { to_role["name"].as_str().unwrap_or("角色B").to_string() } else { to_name };

    let from_resp = from_role["responsibilities"].as_str().unwrap_or("");
    let to_resp = to_role["responsibilities"].as_str().unwrap_or("");

    let recent_artifacts: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT title, artifact_type, status, content FROM project_artifacts WHERE project_id = ? AND role_id = ? ORDER BY updated_at DESC LIMIT 3"
    )
    .bind(&project_id)
    .bind(&from_role_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut delegate_message = format!("来自「{}」的委派消息：\n{}", from_name, context_message);

    if !recent_artifacts.is_empty() {
        delegate_message.push_str("\n\n相关产物：");
        for (title, atype, status, content) in &recent_artifacts {
            delegate_message.push_str(&format!("\n- {}（{}，状态：{}）", title, atype, status));
            if !content.is_empty() {
                let preview = if content.len() > 200 { &content[..200] } else { content.as_str() };
                delegate_message.push_str(&format!("：{}...", preview));
            }
        }
    }

    delegate_message.push_str(&format!("\n\n请基于「{}」的产出，从你「{}」的职责角度（{}）进行分析和执行。", from_name, to_name, to_resp));

    let msg_id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, 'auto_delegate', ?)")
        .bind(&msg_id)
        .bind(&project_id)
        .bind(&from_role_id)
        .bind(&delegate_message)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let api_base = "http://127.0.0.1:8642/v1";
    let api_key = "hermes-desktop-local-dev-key";
    let client = reqwest::Client::new();

    let project = &to_context["project"];
    let project_name = project["name"].as_str().unwrap_or("");
    let project_desc = project["description"].as_str().unwrap_or("");
    let project_guidelines = project["project_guidelines"].as_str().unwrap_or("");
    let to_soul = to_role["soul"].as_str().unwrap_or("");

    let mut system_prompt = format!(
        "你是项目「{}」中的AI角色。\n你的名字是「{}」，角色类型是「{}」。\n\n角色职责：{}\n\n角色灵魂设定：\n{}\n\n项目描述：{}\n\n你刚刚收到了来自「{}」的委派任务。{}是你的上游角色，负责{}。请基于上游的产出完成你的工作。",
        project_name, to_name, to_role["name"].as_str().unwrap_or(""), to_resp, to_soul, project_desc, from_name, from_name, from_resp
    );

    if !project_guidelines.is_empty() {
        system_prompt.push_str(&format!("\n\n项目执行规则：\n{}", project_guidelines));
    }

    system_prompt.push_str(&format!("\n\n请以「{}」的身份回答，保持角色一致性。完成工作后请说明你的产出物。", to_name));

    let messages = vec![
        serde_json::json!({ "role": "system", "content": system_prompt }),
        serde_json::json!({ "role": "user", "content": delegate_message }),
    ];

    let body = serde_json::json!({
        "model": "default",
        "messages": messages,
        "stream": false,
    });

    let response = client
        .post(format!("{}/chat/completions", api_base))
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to AI service: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("AI service error: {} - {}", status, text));
    }

    let resp_json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let reply = resp_json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();

    let reply_msg_id = uuid::Uuid::new_v4().to_string();
    let now2 = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO project_messages (id, project_id, role_id, content, message_type, created_at) VALUES (?, ?, ?, ?, 'auto_reply', ?)")
        .bind(&reply_msg_id)
        .bind(&project_id)
        .bind(&to_role_id)
        .bind(&reply)
        .bind(now2)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit(&event_id, serde_json::json!({
        "fromRoleId": from_role_id,
        "fromRoleName": from_name,
        "toRoleId": to_role_id,
        "toRoleName": to_name,
        "message": delegate_message,
        "reply": reply,
        "done": true,
    }));

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

#[tauri::command]
pub async fn run_workflow_auto_chat(app: AppHandle, project_id: String, start_role_id: String, initial_message: String, event_id: String) -> Result<Vec<AutoDelegateResult>, String> {
    let pool = get_pool(&app)?;

    let mut results: Vec<AutoDelegateResult> = Vec::new();
    let mut current_role_id = start_role_id.clone();
    let mut current_message = initial_message.clone();
    let mut visited = std::collections::HashSet::new();
    visited.insert(start_role_id.clone());

    let max_steps = 5;
    for _step in 0..max_steps {
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

            let step_event_id = format!("{}-{}", event_id, results.len());
            let result = auto_delegate_chat(
                app.clone(),
                project_id.clone(),
                current_role_id.clone(),
                to_role_id.clone(),
                current_message.clone(),
                step_event_id,
            )
            .await?;

            current_message = result.reply.clone();
            results.push(result);
            current_role_id = to_role_id.clone();
        }
    }

    let _ = app.emit(&event_id, serde_json::json!({
        "done": true,
        "totalSteps": results.len(),
    }));

    Ok(results)
}
