use crate::database::models as db;
use crate::commands::project::seed_builtin_templates;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

#[tauri::command]
pub async fn get_avatar_conversation(app: AppHandle) -> Result<Option<db::Conversation>, String> {
    let pool = get_pool(&app)?;
    let row = sqlx::query_as::<_, (String, String, Option<String>, String, Option<String>, Option<String>, i64, i64, i64)>(
        "SELECT id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(row.map(|(id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at)| db::Conversation {
        id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at,
    }))
}

#[tauri::command]
pub async fn create_avatar_conversation(app: AppHandle) -> Result<db::Conversation, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO conversations (id, title, hermes_session_id, status, source, kb_ids, last_active_at, created_at, updated_at) VALUES (?, 'Avatar Chat', NULL, 'active', 'avatar', NULL, ?, ?, ?)")
        .bind(&id)
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::Conversation {
        id,
        title: "Avatar Chat".to_string(),
        hermes_session_id: None,
        status: "active".to_string(),
        source: Some("avatar".to_string()),
        kb_ids: None,
        last_active_at: now,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub async fn get_avatar_messages(app: AppHandle) -> Result<Vec<db::Message>, String> {
    let pool = get_pool(&app)?;

    let conversation_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM conversations WHERE source = 'avatar' ORDER BY updated_at DESC LIMIT 1"
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let conversation_id = match conversation_id {
        Some(id) => id,
        None => return Ok(vec![]),
    };

    let rows = sqlx::query_as::<_, (String, String, String, Option<String>, Option<String>, i64)>(
        "SELECT id, role, content, thinking, files, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
    )
    .bind(&conversation_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let messages = rows
        .into_iter()
        .map(|(id, role, content, thinking, files, timestamp)| db::Message {
            id,
            role,
            content,
            thinking: thinking.filter(|s| !s.is_empty()),
            files: files.filter(|s| !s.is_empty()),
            timestamp,
        })
        .collect();

    Ok(messages)
}

#[tauri::command]
pub async fn get_avatar_gestures(app: AppHandle) -> Result<Vec<db::AvatarGesture>, String> {
    let pool = get_pool(&app)?;
    let gestures = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures ORDER BY updated_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .collect();

    Ok(gestures)
}

#[tauri::command]
pub async fn create_avatar_gesture(
    app: AppHandle,
    req: db::CreateAvatarGestureRequest,
) -> Result<db::AvatarGesture, String> {
    let pool = get_pool(&app)?;
    let id = format!("gesture_{}", uuid::Uuid::new_v4());
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO avatar_gestures (id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'custom', ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(req.duration)
        .bind(req.look_at_x)
        .bind(req.look_at_y)
        .bind(req.tilt)
        .bind(&req.target_json)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let gesture = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .map_err(|e| e.to_string())?;

    Ok(gesture)
}

#[tauri::command]
pub async fn update_avatar_gesture(
    app: AppHandle,
    req: db::UpdateAvatarGestureRequest,
) -> Result<db::AvatarGesture, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let mut query = String::from("UPDATE avatar_gestures SET updated_at = ?");
    let mut args: sqlx::sqlite::SqliteArguments = Default::default();
    let _ = sqlx::Arguments::add(&mut args, now);

    if let Some(name) = &req.name {
        query.push_str(", name = ?");
        let _ = sqlx::Arguments::add(&mut args, name);
    }
    if let Some(duration) = req.duration {
        query.push_str(", duration = ?");
        let _ = sqlx::Arguments::add(&mut args, duration);
    }
    if let Some(look_at_x) = req.look_at_x {
        query.push_str(", look_at_x = ?");
        let _ = sqlx::Arguments::add(&mut args, look_at_x);
    }
    if let Some(look_at_y) = req.look_at_y {
        query.push_str(", look_at_y = ?");
        let _ = sqlx::Arguments::add(&mut args, look_at_y);
    }
    if let Some(tilt) = req.tilt {
        query.push_str(", tilt = ?");
        let _ = sqlx::Arguments::add(&mut args, tilt);
    }
    if let Some(target_json) = &req.target_json {
        query.push_str(", target_json = ?");
        let _ = sqlx::Arguments::add(&mut args, target_json);
    }

    query.push_str(" WHERE id = ?");
    let _ = sqlx::Arguments::add(&mut args, &req.id);

    sqlx::query_with(&query, args)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let gesture = sqlx::query_as::<_, (String, String, i64, f64, f64, f64, String, String, i64, i64)>(
        "SELECT id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at FROM avatar_gestures WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at)| db::AvatarGesture {
        id, name, duration, look_at_x, look_at_y, tilt, target_json, source, created_at, updated_at
    })
    .map_err(|e| e.to_string())?;

    Ok(gesture)
}

#[tauri::command]
pub async fn delete_avatar_gesture(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;

    sqlx::query("DELETE FROM avatar_gestures WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_ai_roles(app: AppHandle) -> Result<Vec<db::AiRole>, String> {
    let pool = get_pool(&app)?;

    let _ = seed_builtin_templates(&pool).await;

    let rows = sqlx::query_as::<_, db::AiRole>(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles ORDER BY sort_order ASC, created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

#[tauri::command]
pub async fn create_ai_role(app: AppHandle, req: db::CreateAiRoleRequest) -> Result<db::AiRole, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let max_sort: Option<i64> = sqlx::query_scalar("SELECT MAX(sort_order) FROM ai_roles")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;
    let sort_order = max_sort.unwrap_or(0) + 1;

    let icon = req.icon.unwrap_or_default();
    let nickname = req.nickname.unwrap_or_default();
    let description = req.description.unwrap_or_default();
    let responsibilities = req.responsibilities.unwrap_or_default();
    let soul_content = req.soul_content.unwrap_or_default();
    let avatar_url = req.avatar_url.unwrap_or_default();
    let avatar_type = req.avatar_type.unwrap_or_else(|| "default".to_string());
    let avatar_preset = req.avatar_preset.unwrap_or_default();
    let avatar_color = req.avatar_color.unwrap_or_default();

    sqlx::query("INSERT INTO ai_roles (id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 100, 'neutral', ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&nickname)
        .bind(&icon)
        .bind(&description)
        .bind(&responsibilities)
        .bind(&soul_content)
        .bind(&avatar_url)
        .bind(&avatar_type)
        .bind(&avatar_preset)
        .bind(&avatar_color)
        .bind(sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::AiRole {
        id, name: req.name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin: false, energy: 100, mood: "neutral".to_string(), created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_ai_role(app: AppHandle, req: db::UpdateAiRoleRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let role: db::AiRole = sqlx::query_as::<_, db::AiRole>(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(role.name);
    let nickname = req.nickname.unwrap_or(role.nickname);
    let icon = req.icon.unwrap_or(role.icon);
    let description = req.description.unwrap_or(role.description);
    let responsibilities = req.responsibilities.unwrap_or(role.responsibilities);
    let soul_content = req.soul_content.unwrap_or(role.soul_content);
    let avatar_url = req.avatar_url.unwrap_or(role.avatar_url);
    let avatar_type = req.avatar_type.unwrap_or(role.avatar_type);
    let avatar_preset = req.avatar_preset.unwrap_or(role.avatar_preset);
    let avatar_color = req.avatar_color.unwrap_or(role.avatar_color);
    let energy = req.energy.unwrap_or(role.energy);
    let mood = req.mood.unwrap_or(role.mood);

    sqlx::query("UPDATE ai_roles SET name = ?, nickname = ?, icon = ?, description = ?, responsibilities = ?, soul_content = ?, avatar_url = ?, avatar_type = ?, avatar_preset = ?, avatar_color = ?, energy = ?, mood = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&nickname)
        .bind(&icon)
        .bind(&description)
        .bind(&responsibilities)
        .bind(&soul_content)
        .bind(&avatar_url)
        .bind(&avatar_type)
        .bind(&avatar_preset)
        .bind(&avatar_color)
        .bind(energy)
        .bind(&mood)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn upload_vrm_avatar(app: AppHandle, role_id: String, file_path: String) -> Result<String, String> {
    let pool = get_pool(&app)?;
    let role: Option<db::AiRole> = sqlx::query_as::<_, db::AiRole>(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if role.is_none() {
        return Err("Role not found".to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let avatar_dir = std::path::Path::new(&app_data_dir).join("avatars");
    let _ = std::fs::create_dir_all(&avatar_dir);

    let ext = std::path::Path::new(&file_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("vrm")
        .to_string();
    let dest_name = format!("{}.{}", role_id, ext);
    let dest_path = avatar_dir.join(&dest_name);

    std::fs::copy(&file_path, &dest_path).map_err(|e| e.to_string())?;

    let avatar_url = dest_path.to_string_lossy().to_string();

    sqlx::query("UPDATE ai_roles SET avatar_url = ?, avatar_type = 'vrm', updated_at = ? WHERE id = ?")
        .bind(&avatar_url)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&role_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(avatar_url)
}

#[tauri::command]
pub async fn delete_ai_role(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let is_builtin: bool = sqlx::query_scalar("SELECT is_builtin FROM ai_roles WHERE id = ?")
        .bind(&id)
        .fetch_one(&pool)
        .await
        .map(|v: i64| v != 0)
        .map_err(|e| e.to_string())?;
    if is_builtin {
        return Err("Cannot delete builtin role".to_string());
    }
    sqlx::query("DELETE FROM ai_roles WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_role_energy(app: AppHandle, role_id: String, energy_cost: i64) -> Result<db::AiRole, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let current_energy: i64 = sqlx::query_scalar("SELECT energy FROM ai_roles WHERE id = ?")
        .bind(&role_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let new_energy = (current_energy - energy_cost).max(0).min(100);

    let new_mood = if new_energy >= 70 {
        "energetic"
    } else if new_energy >= 40 {
        "neutral"
    } else if new_energy >= 20 {
        "tired"
    } else {
        "exhausted"
    };

    sqlx::query("UPDATE ai_roles SET energy = ?, mood = ?, updated_at = ? WHERE id = ?")
        .bind(new_energy)
        .bind(new_mood)
        .bind(now)
        .bind(&role_id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let role: db::AiRole = sqlx::query_as::<_, db::AiRole>(
        "SELECT id, name, nickname, icon, description, responsibilities, soul_content, avatar_url, avatar_type, avatar_preset, avatar_color, sort_order, is_builtin, energy, mood, created_at, updated_at FROM ai_roles WHERE id = ?"
    )
    .bind(&role_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(role)
}

#[tauri::command]
pub async fn recover_role_energy(app: AppHandle) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("UPDATE ai_roles SET energy = MIN(100, energy + 5), updated_at = ? WHERE energy < 100")
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE ai_roles SET mood = CASE WHEN energy >= 70 THEN 'energetic' WHEN energy >= 40 THEN 'neutral' WHEN energy >= 20 THEN 'tired' ELSE 'exhausted' END, updated_at = ? WHERE mood != CASE WHEN energy >= 70 THEN 'energetic' WHEN energy >= 40 THEN 'neutral' WHEN energy >= 20 THEN 'tired' ELSE 'exhausted' END")
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
