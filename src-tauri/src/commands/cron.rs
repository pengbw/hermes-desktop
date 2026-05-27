use serde::{Deserialize, Serialize};

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
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
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
    format!("{}{}cron_jobs.json", hermes_home_dir(), std::path::MAIN_SEPARATOR)
}

fn read_cron_jobs_file() -> Result<Vec<serde_json::Value>, String> {
    let path = cron_jobs_path();
    if !std::path::Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read cron jobs: {}", e))?;
    let jobs: Vec<serde_json::Value> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse cron jobs: {}", e))?;
    Ok(jobs)
}

fn write_cron_jobs_file(jobs: &[serde_json::Value]) -> Result<(), String> {
    let path = cron_jobs_path();
    let hermes_home = hermes_home_dir();
    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create hermes home dir: {}", e);
    }
    let content = serde_json::to_string_pretty(jobs)
        .map_err(|e| format!("Failed to serialize cron jobs: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write cron jobs: {}", e))
}

fn parse_job_from_json(v: &serde_json::Value) -> CronJob {
    let schedule = v.get("schedule").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let schedule_display = v.get("schedule_display")
        .and_then(|s| s.as_str())
        .unwrap_or(&schedule)
        .to_string();

    CronJob {
        id: v.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        name: v.get("name").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        prompt: v.get("prompt").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        schedule: schedule.clone(),
        schedule_display,
        skills: v.get("skills")
            .and_then(|s| s.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
        enabled: v.get("enabled").and_then(|s| s.as_bool()).unwrap_or(true),
        state: v.get("state").and_then(|s| s.as_str()).unwrap_or("scheduled").to_string(),
        next_run: v.get("next_run").and_then(|s| s.as_str()).map(String::from),
        last_run: v.get("last_run").and_then(|s| s.as_str()).map(String::from),
        created_at: v.get("created_at").and_then(|s| s.as_i64()),
        updated_at: v.get("updated_at").and_then(|s| s.as_i64()),
    }
}

#[tauri::command]
pub async fn cron_list_jobs() -> Result<Vec<CronJob>, String> {
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
    let mut jobs = read_cron_jobs_file()?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    let schedule_display = schedule.clone();

    let job = serde_json::json!({
        "id": id,
        "name": name,
        "prompt": prompt,
        "schedule": schedule,
        "schedule_display": schedule_display,
        "skills": skills,
        "enabled": true,
        "state": "scheduled",
        "next_run": null,
        "last_run": null,
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
        obj.insert("schedule".to_string(), serde_json::Value::String(s.clone()));
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

    let now = chrono::Utc::now().timestamp();
    obj.insert("updated_at".to_string(), serde_json::Value::Number(now.into()));

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
pub async fn cron_trigger_job(id: String) -> Result<String, String> {
    let _output = hermes_command()
        .args(["cron", "trigger", &id])
        .output()
        .map_err(|e| format!("Failed to trigger cron job: {}", e))?;

    Ok(format!("Job {} triggered", id))
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

    let now = chrono::Utc::now().timestamp();
    obj.insert("updated_at".to_string(), serde_json::Value::Number(now.into()));

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

    let now = chrono::Utc::now().timestamp();
    obj.insert("updated_at".to_string(), serde_json::Value::Number(now.into()));

    write_cron_jobs_file(&jobs)
}

#[tauri::command]
pub async fn cron_get_outputs(id: String) -> Result<Vec<CronJobOutput>, String> {
    let output = hermes_command()
        .args(["cron", "logs", &id])
        .output()
        .map_err(|e| format!("Failed to get cron outputs: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let outputs: Vec<CronJobOutput> = serde_json::from_str(&stdout)
            .unwrap_or_default();
        Ok(outputs)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Failed to get cron outputs: {}", stderr))
    }
}
