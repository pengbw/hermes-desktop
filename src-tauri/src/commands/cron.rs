use serde::{Deserialize, Serialize};
use regex::Regex;

use super::helpers::{hermes_home_dir, hermes_command};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub schedule: String,
    pub schedule_display: String,
    pub skills: Vec<String>,
    pub enabled: bool,
    pub state: String,
    pub next_run: Option<String>,
    pub last_run: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CronJobOutput {
    pub id: String,
    pub job_id: String,
    pub job_name: String,
    pub status: String,
    pub output: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub duration: Option<i64>,
}

fn cron_jobs_path() -> String {
    format!("{}{}cron{}jobs.json", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR)
}

fn cron_output_dir() -> String {
    format!("{}{}cron{}output", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR)
}

fn ensure_cron_dir() -> Result<(), String> {
    let cron_dir = format!("{}{}cron", hermes_home_dir(), std::path::MAIN_SEPARATOR);
    std::fs::create_dir_all(&cron_dir)
        .map_err(|e| format!("Failed to create cron dir: {}", e))
}

fn parse_duration(s: &str) -> Option<u64> {
    let re = Regex::new(r"^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$").ok()?;
    let normalized = s.trim().to_lowercase();
    let caps = re.captures(&normalized)?;
    let value: u64 = caps.get(1)?.as_str().parse().ok()?;
    let unit_first_char = caps.get(2)?.as_str().chars().next().unwrap_or('m');
    let multiplier = match unit_first_char {
        'h' => 60,
        'd' => 1440,
        _ => 1,
    };
    Some(value * multiplier)
}

fn parse_schedule_to_json(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let lower = trimmed.to_lowercase();

    if lower.starts_with("every ") {
        if let Some(minutes) = parse_duration(&trimmed[6..]) {
            return serde_json::json!({
                "kind": "interval",
                "minutes": minutes,
                "display": format!("every {}m", minutes),
            });
        }
    }

    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() >= 5 {
        if let Ok(cron_field_re) = Regex::new(r"^[\d\*\-,/LW#?]+$") {
            let all_cron = parts.iter().take(5).all(|p| cron_field_re.is_match(p));
            if all_cron {
                return serde_json::json!({
                    "kind": "cron",
                    "expr": trimmed,
                    "display": trimmed,
                });
            }
        }
    }

    serde_json::json!({
        "kind": "cron",
        "expr": trimmed,
        "display": trimmed,
    })
}

fn parse_schedule_display(v: &serde_json::Value) -> String {
    if let Some(s) = v.get("schedule_display").and_then(|s| s.as_str()) {
        return s.to_string();
    }
    if let Some(schedule) = v.get("schedule") {
        if let Some(s) = schedule.as_str() {
            return s.to_string();
        }
        if let Some(d) = schedule.get("display").and_then(|s| s.as_str()) {
            return d.to_string();
        }
    }
    String::new()
}

fn parse_schedule_raw(v: &serde_json::Value) -> String {
    if let Some(schedule) = v.get("schedule") {
        if let Some(s) = schedule.as_str() {
            return s.to_string();
        }
        if let Some(d) = schedule.get("display").and_then(|s| s.as_str()) {
            return d.to_string();
        }
    }
    String::new()
}

fn fix_schedule_in_place(jobs: &mut [serde_json::Value]) -> bool {
    let mut changed = false;
    for job in jobs.iter_mut() {
        let obj = match job.as_object_mut() {
            Some(o) => o,
            None => continue,
        };

        let schedule_raw = match obj.get("schedule").and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        let parsed = parse_schedule_to_json(&schedule_raw);
        obj.insert("schedule".to_string(), parsed);

        if !obj.contains_key("schedule_display") {
            obj.insert("schedule_display".to_string(), serde_json::Value::String(schedule_raw));
        }
        changed = true;
    }
    changed
}

fn read_cron_jobs_file() -> Result<Vec<serde_json::Value>, String> {
    let path = cron_jobs_path();

    if !std::path::Path::new(&path).exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read cron jobs: {}", e))?;

    let data: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cron jobs: {}", e))?;

    let mut jobs = data.get("jobs")
        .and_then(|j| j.as_array())
        .cloned()
        .unwrap_or_default();

    if fix_schedule_in_place(&mut jobs) {
        if let Err(e) = write_cron_jobs_file(&jobs) {
            log::warn!("Failed to save fixed cron jobs: {}", e);
        } else {
            log::info!("Fixed schedule format for existing cron jobs");
        }
    }

    Ok(jobs)
}

fn write_cron_jobs_file(jobs: &[serde_json::Value]) -> Result<(), String> {
    ensure_cron_dir()?;

    let path = cron_jobs_path();
    let now = chrono::Utc::now().to_rfc3339();

    let data = serde_json::json!({
        "jobs": jobs,
        "updated_at": now,
    });

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize cron jobs: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write cron jobs: {}", e))
}

fn parse_job_from_json(v: &serde_json::Value) -> CronJob {
    let schedule_display = parse_schedule_display(v);
    let schedule_raw = parse_schedule_raw(v);

    CronJob {
        id: v.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        name: v.get("name").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        prompt: v.get("prompt").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        schedule: schedule_raw,
        schedule_display,
        skills: v.get("skills")
            .and_then(|s| s.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        enabled: v.get("enabled").and_then(|s| s.as_bool()).unwrap_or(true),
        state: v.get("state").and_then(|s| s.as_str()).unwrap_or("scheduled").to_string(),
        next_run: v.get("next_run_at").or_else(|| v.get("next_run"))
            .and_then(|s| s.as_str()).map(String::from),
        last_run: v.get("last_run_at").or_else(|| v.get("last_run"))
            .and_then(|s| s.as_str()).map(String::from),
        created_at: v.get("created_at").and_then(|s| s.as_str()).map(String::from),
        updated_at: v.get("updated_at").and_then(|s| s.as_str()).map(String::from),
    }
}

fn migrate_old_cron_jobs() -> Result<(), String> {
    let old_path = format!("{}{}cron_jobs.json", hermes_home_dir(), std::path::MAIN_SEPARATOR);
    let new_path = cron_jobs_path();

    if !std::path::Path::new(&old_path).exists() || std::path::Path::new(&new_path).exists() {
        return Ok(());
    }

    log::info!("Migrating old cron_jobs.json to cron/jobs.json");

    let content = std::fs::read_to_string(&old_path)
        .map_err(|e| format!("Failed to read old cron jobs: {}", e))?;

    let old_jobs: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse old cron jobs: {}", e))?;

    let mut migrated_jobs: Vec<serde_json::Value> = Vec::new();
    for job in &old_jobs {
        let mut new_job = job.clone();
        if let Some(obj) = new_job.as_object_mut() {
            if obj.contains_key("next_run") {
                if let Some(v) = obj.remove("next_run") {
                    obj.insert("next_run_at".to_string(), v);
                }
            }
            if obj.contains_key("last_run") {
                if let Some(v) = obj.remove("last_run") {
                    obj.insert("last_run_at".to_string(), v);
                }
            }
            if let Some(created_at) = obj.get("created_at").and_then(|v| v.as_i64()) {
                if let Some(dt) = chrono::DateTime::from_timestamp(created_at, 0) {
                    obj.insert("created_at".to_string(), serde_json::Value::String(dt.to_rfc3339()));
                }
            }
            if let Some(updated_at) = obj.get("updated_at").and_then(|v| v.as_i64()) {
                if let Some(dt) = chrono::DateTime::from_timestamp(updated_at, 0) {
                    obj.insert("updated_at".to_string(), serde_json::Value::String(dt.to_rfc3339()));
                }
            }
            if let Some(schedule_val) = obj.remove("schedule") {
                if let Some(raw) = schedule_val.as_str() {
                    let parsed = parse_schedule_to_json(raw);
                    obj.insert("schedule".to_string(), parsed);
                } else {
                    obj.insert("schedule".to_string(), schedule_val);
                }
            }
        }
        migrated_jobs.push(new_job);
    }

    write_cron_jobs_file(&migrated_jobs)?;

    if let Err(e) = std::fs::remove_file(&old_path) {
        log::warn!("Failed to remove old cron_jobs.json after migration: {}", e);
    }

    log::info!("Migrated {} cron jobs to new format", migrated_jobs.len());
    Ok(())
}

#[tauri::command]
pub async fn cron_list_jobs() -> Result<Vec<CronJob>, String> {
    let _ = migrate_old_cron_jobs();

    let jobs = read_cron_jobs_file()?;
    Ok(jobs.iter().map(parse_job_from_json).collect())
}

#[tauri::command]
pub async fn cron_create_job(
    name: String,
    prompt: String,
    schedule: String,
    skills: Vec<String>,
) -> Result<CronJob, String> {
    let _ = migrate_old_cron_jobs();

    let mut jobs = read_cron_jobs_file()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let parsed_schedule = parse_schedule_to_json(&schedule);

    let job = serde_json::json!({
        "id": id,
        "name": name,
        "prompt": prompt,
        "schedule": parsed_schedule,
        "schedule_display": schedule,
        "skills": skills,
        "enabled": true,
        "state": "scheduled",
        "next_run_at": null,
        "last_run_at": null,
        "created_at": now,
        "updated_at": now,
    });

    jobs.push(job.clone());
    write_cron_jobs_file(&jobs)?;

    Ok(parse_job_from_json(&job))
}

#[tauri::command]
pub async fn cron_update_job(
    id: String,
    name: Option<String>,
    prompt: Option<String>,
    schedule: Option<String>,
    skills: Option<Vec<String>>,
    enabled: Option<bool>,
) -> Result<CronJob, String> {
    let mut jobs = read_cron_jobs_file()?;

    let job = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or(format!("Job '{}' not found", id))?;

    let obj = job.as_object_mut()
        .ok_or("Invalid job format")?;

    if let Some(n) = name {
        obj.insert("name".to_string(), serde_json::Value::String(n));
    }
    if let Some(p) = prompt {
        obj.insert("prompt".to_string(), serde_json::Value::String(p));
    }
    if let Some(s) = schedule {
        let parsed = parse_schedule_to_json(&s);
        obj.insert("schedule".to_string(), parsed);
        obj.insert("schedule_display".to_string(), serde_json::Value::String(s));
    }
    if let Some(sk) = skills {
        let arr: Vec<serde_json::Value> = sk.iter()
            .map(|s| serde_json::Value::String(s.clone()))
            .collect();
        obj.insert("skills".to_string(), serde_json::Value::Array(arr));
    }
    if let Some(e) = enabled {
        obj.insert("enabled".to_string(), serde_json::Value::Bool(e));
    }

    let now = chrono::Utc::now().to_rfc3339();
    obj.insert("updated_at".to_string(), serde_json::Value::String(now));

    let result = parse_job_from_json(job);
    write_cron_jobs_file(&jobs)?;

    Ok(result)
}

#[tauri::command]
pub async fn cron_delete_job(id: String) -> Result<(), String> {
    let mut jobs = read_cron_jobs_file()?;
    jobs.retain(|j| j.get("id").and_then(|v| v.as_str()) != Some(&id));
    write_cron_jobs_file(&jobs)
}

#[tauri::command]
pub async fn cron_trigger_job(id: String) -> Result<CronJob, String> {
    let run_output = hermes_command()
        .args(["cron", "run", &id])
        .output()
        .map_err(|e| format!("Failed to run cron job: {}", e))?;

    if !run_output.status.success() {
        let stderr = String::from_utf8_lossy(&run_output.stderr).to_string();
        return Err(format!("Failed to trigger cron job: {}", stderr));
    }

    let tick_output = hermes_command()
        .args(["cron", "tick"])
        .output()
        .map_err(|e| format!("Failed to tick cron: {}", e))?;

    if !tick_output.status.success() {
        let stderr = String::from_utf8_lossy(&tick_output.stderr).to_string();
        log::warn!("Cron tick warning: {}", stderr);
    }

    let jobs = read_cron_jobs_file()?;
    let job = jobs.iter()
        .find(|j| j.get("id").and_then(|v| v.as_str()) == Some(&id))
        .map(parse_job_from_json)
        .ok_or(format!("Job '{}' not found after trigger", id))?;

    Ok(job)
}

#[tauri::command]
pub async fn cron_pause_job(id: String) -> Result<(), String> {
    let mut jobs = read_cron_jobs_file()?;

    let job = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or(format!("Job '{}' not found", id))?;

    let obj = job.as_object_mut()
        .ok_or("Invalid job format")?;

    obj.insert("enabled".to_string(), serde_json::Value::Bool(false));
    obj.insert("state".to_string(), serde_json::Value::String("paused".to_string()));

    let now = chrono::Utc::now().to_rfc3339();
    obj.insert("updated_at".to_string(), serde_json::Value::String(now));

    write_cron_jobs_file(&jobs)
}

#[tauri::command]
pub async fn cron_resume_job(id: String) -> Result<(), String> {
    let mut jobs = read_cron_jobs_file()?;

    let job = jobs.iter_mut().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or(format!("Job '{}' not found", id))?;

    let obj = job.as_object_mut()
        .ok_or("Invalid job format")?;

    obj.insert("enabled".to_string(), serde_json::Value::Bool(true));
    obj.insert("state".to_string(), serde_json::Value::String("scheduled".to_string()));

    let now = chrono::Utc::now().to_rfc3339();
    obj.insert("updated_at".to_string(), serde_json::Value::String(now));

    write_cron_jobs_file(&jobs)
}

#[tauri::command]
pub async fn cron_get_outputs(id: String) -> Result<Vec<CronJobOutput>, String> {
    let output_dir = format!("{}{}{}", cron_output_dir(), std::path::MAIN_SEPARATOR, id);

    let jobs = read_cron_jobs_file().unwrap_or_default();
    let job_info = jobs.iter().find(|j| j.get("id").and_then(|v| v.as_str()) == Some(&id));
    let job_name = job_info
        .and_then(|j| j.get("name").and_then(|v| v.as_str()))
        .unwrap_or("")
        .to_string();
    let job_status = job_info
        .and_then(|j| j.get("last_status").and_then(|v| v.as_str()))
        .map(|s| match s {
            "ok" => "completed",
            "error" => "error",
            _ => s,
        })
        .unwrap_or("completed");
    let last_error = job_info
        .and_then(|j| j.get("last_error").and_then(|v| v.as_str()))
        .unwrap_or("");

    let dir_path = std::path::Path::new(&output_dir);
    if !dir_path.exists() {
        return Ok(Vec::new());
    }

    let mut outputs: Vec<CronJobOutput> = Vec::new();

    let entries = std::fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read output dir: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let filename = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown");

        let output_content = std::fs::read_to_string(&path)
            .unwrap_or_default();

        let metadata = std::fs::metadata(&path).ok();

        let status = if !last_error.is_empty() { "error" } else { job_status };

        outputs.push(CronJobOutput {
            id: filename.to_string(),
            job_id: id.clone(),
            job_name: job_name.clone(),
            status: status.to_string(),
            output: output_content,
            started_at: filename.to_string().into(),
            finished_at: metadata.and_then(|m| {
                m.modified().ok().map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
            }),
            duration: None,
        });
    }

    outputs.sort_by(|a, b| b.id.cmp(&a.id));

    Ok(outputs)
}
