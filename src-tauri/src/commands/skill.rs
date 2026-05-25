use crate::commands::helpers::{hermes_command, strip_ansi, AppState, hermes_home_dir};
use crate::database::models::SkillCatalogItem;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use tauri::{AppHandle, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<AppState>();
    Ok(state.db_pool.clone())
}

fn resolve_locale_json(json_str: &str, locale: &str) -> String {
    if let Ok(map) = serde_json::from_str::<std::collections::HashMap<String, String>>(json_str) {
        crate::database::seeds::resolve_localized(&map, locale).to_string()
    } else {
        json_str.to_string()
    }
}

#[derive(Serialize, Clone)]
struct HermesSkill {
    name: String,
    category: String,
    source: String,
    trust: String,
    enabled: bool,
    description: String,
    version: String,
    tags: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct HermesSkillsResult {
    skills: Vec<HermesSkill>,
    total: usize,
    hub_installed: usize,
    builtin: usize,
    local: usize,
    enabled_count: usize,
    disabled_count: usize,
    categories: Vec<SkillCategory>,
}

#[derive(Serialize, Clone)]
pub struct SkillCategory {
    id: String,
    name: String,
    description: String,
    icon: String,
    count: usize,
}

fn parse_skill_frontmatter(category: &str, skill_name: &str) -> (String, String, Vec<String>) {
    let skill_path = format!("{}{}skills{}{}{}{}SKILL.md", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR, category, std::path::MAIN_SEPARATOR, skill_name);

    let content = match std::fs::read_to_string(&skill_path) {
        Ok(c) => c,
        Err(_) => return (String::new(), String::new(), Vec::new()),
    };

    let mut description = String::new();
    let mut version = String::new();
    let mut tags: Vec<String> = Vec::new();
    let mut in_tags_list = false;

    if let Some(fm) = content.strip_prefix("---") {
        if let Some(end) = fm.find("---") {
            let frontmatter = &fm[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if in_tags_list && line.starts_with("- ") {
                    let tag = line.trim_start_matches("- ").trim().trim_matches('"').to_string();
                    if !tag.is_empty() {
                        tags.push(tag);
                    }
                    continue;
                }
                in_tags_list = false;

                if let Some(val) = line.strip_prefix("description:") {
                    description = val.trim().trim_matches('"').to_string();
                } else if let Some(val) = line.strip_prefix("version:") {
                    version = val.trim().trim_matches('"').to_string();
                } else if line.contains("tags:") {
                    if let Some(start) = line.find('[') {
                        if let Some(end_bracket) = line.find(']') {
                            let inner = &line[start + 1..end_bracket];
                            tags = inner.split(',')
                                .map(|t| t.trim().trim_matches('"').to_string())
                                .filter(|t| !t.is_empty())
                                .collect();
                        }
                    } else {
                        in_tags_list = true;
                    }
                }
            }
        }
    }

    (description, version, tags)
}

fn parse_category_description(category: &str) -> String {
    let desc_path = format!("{}{}skills{}{}{}DESCRIPTION.md", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR, category, std::path::MAIN_SEPARATOR);

    let content = match std::fs::read_to_string(&desc_path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    if let Some(fm) = content.strip_prefix("---") {
        if let Some(end) = fm.find("---") {
            let frontmatter = &fm[..end];
            for line in frontmatter.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("description:") {
                    return val.trim().trim_matches('"').to_string();
                }
            }
        }
    }

    String::new()
}

fn category_icon(cat: &str) -> String {
    match cat {
        "apple" => "\u{1F34E}",
        "autonomous-ai-agents" => "\u{1F916}",
        "creative" => "\u{1F3A8}",
        "data-science" => "\u{1F4CA}",
        "devops" => "\u{1F527}",
        "diagramming" => "\u{1F4D0}",
        "dogfood" => "\u{1F415}",
        "domain" => "\u{1F310}",
        "email" => "\u{1F4E7}",
        "gaming" => "\u{1F3AE}",
        "gifs" => "🎞️",
        "github" => "\u{1F419}",
        "inference-sh" => "\u{26A1}",
        "mcp" => "\u{1F50C}",
        "media" => "\u{1F3B5}",
        "mlops" => "\u{1F9E0}",
        "note-taking" => "\u{1F4DD}",
        "productivity" => "\u{1F4CB}",
        "red-teaming" => "\u{1F534}",
        "research" => "\u{1F52C}",
        "smart-home" => "\u{1F3E0}",
        "social-media" => "\u{1F4F1}",
        "software-development" => "\u{1F4BB}",
        _ => "\u{1F4C2}",
    }.to_string()
}

#[tauri::command]
pub async fn list_hermes_skills() -> Result<HermesSkillsResult, String> {
    let output = hermes_command()
        .args(&["skills", "list"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills list \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills: Vec<HermesSkill> = Vec::new();
    let mut hub_installed: usize = 0;
    let mut builtin: usize = 0;
    let mut local: usize = 0;
    let mut enabled_count: usize = 0;
    let mut disabled_count: usize = 0;
    let mut category_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let name = parts[0].to_string();
                let category = parts[1].to_string();
                let source = parts[2].to_string();
                let trust = parts[3].to_string();
                let enabled = if parts.len() >= 5 {
                    parts[4].eq_ignore_ascii_case("enabled")
                } else {
                    true
                };

                if name == "Name" || name.contains("\u{2501}") || name.contains("-") && category.contains("-") {
                    continue;
                }

                let (description, version, tags) = parse_skill_frontmatter(&category, &name);

                if enabled {
                    enabled_count += 1;
                } else {
                    disabled_count += 1;
                }
                *category_counts.entry(category.clone()).or_insert(0) += 1;

                skills.push(HermesSkill {
                    name,
                    category,
                    source,
                    trust,
                    enabled,
                    description,
                    version,
                    tags,
                });
            }
        }

        if clean.contains("hub-installed") && clean.contains("builtin") {
            for part in clean.split(',') {
                let part = part.trim();
                if part.contains("hub-installed") {
                    hub_installed = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                } else if part.contains("builtin") {
                    builtin = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                } else if part.contains("local") {
                    local = part.split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(0);
                }
            }
        }
    }

    let mut categories: Vec<SkillCategory> = category_counts.into_iter().map(|(id, count)| {
        let desc = parse_category_description(&id);
        let icon = category_icon(&id);
        let display_name = id.split('-').map(|w| {
            let mut c = w.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
            }
        }).collect::<Vec<_>>().join(" ");
        SkillCategory {
            id,
            name: display_name,
            description: desc,
            icon,
            count,
        }
    }).collect();
    categories.sort_by(|a, b| a.id.cmp(&b.id));

    let total = skills.len();
    Ok(HermesSkillsResult {
        skills,
        total,
        hub_installed,
        builtin,
        local,
        enabled_count,
        disabled_count,
        categories,
    })
}

#[derive(Serialize, Clone)]
pub struct BrowseSkill {
    name: String,
    description: String,
    source: String,
    trust: String,
    identifier: String,
}

#[derive(Serialize, Clone)]
pub struct BrowseResult {
    skills: Vec<BrowseSkill>,
    page: usize,
    total_pages: usize,
    total_skills: usize,
}

#[tauri::command]
pub async fn browse_skills(page: Option<usize>, size: Option<usize>, source: Option<String>) -> Result<BrowseResult, String> {
    let page = page.unwrap_or(1);
    let size = size.unwrap_or(20);
    let source = source.unwrap_or_else(|| "all".to_string());

    let mut cmd = hermes_command();
    cmd.args(&["skills", "browse", "--page", &page.to_string(), "--size", &size.to_string(), "--source", &source]);

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills browse \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills = Vec::new();
    let mut total_pages = 1usize;
    let mut total_skills = 0usize;

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.contains("page") && clean.contains('/') {
            if let Some(idx) = clean.rfind("page ") {
                let rest = &clean[idx + 5..];
                let parts: Vec<&str> = rest.split('/').collect();
                if parts.len() >= 2 {
                    total_pages = parts[1].split_whitespace().next()
                        .and_then(|n| n.parse().ok()).unwrap_or(1);
                }
            }
        }

        if clean.contains("skills loaded") {
            if let Some(idx) = clean.find(|c: char| c.is_ascii_digit()) {
                let rest = &clean[idx..];
                total_skills = rest.split_whitespace().next()
                    .and_then(|n| n.parse().ok()).unwrap_or(0);
            }
        }

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let first = parts[0].to_string();
                if first == "#" {
                    continue;
                }

                let skill_name = if parts.len() >= 5 { parts[1].to_string() } else { first.clone() };
                let desc = if parts.len() >= 5 { parts[2].to_string() } else { parts[1].to_string() };
                let src = if parts.len() >= 5 { parts[3].to_string() } else { parts[2].to_string() };
                let trust_val = if parts.len() >= 6 { parts[4].to_string() } else { parts[3].to_string() };
                let identifier = if parts.len() >= 7 { parts[5].to_string() } else { String::new() };

                if skill_name == "Name" || skill_name.contains("\u{2501}") {
                    continue;
                }

                skills.push(BrowseSkill {
                    name: skill_name,
                    description: desc,
                    source: src,
                    trust: trust_val,
                    identifier,
                });
            }
        }
    }

    Ok(BrowseResult {
        skills,
        page,
        total_pages,
        total_skills,
    })
}

#[tauri::command]
pub async fn search_skills(query: String, source: Option<String>, limit: Option<usize>) -> Result<Vec<BrowseSkill>, String> {
    let mut cmd = hermes_command();
    cmd.args(&["skills", "search", &query]);
    if let Some(s) = source {
        cmd.args(&["--source", &s]);
    }
    if let Some(l) = limit {
        cmd.args(&["--limit", &l.to_string()]);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills search \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut skills = Vec::new();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();

        if clean.starts_with("\u{2502}") || clean.starts_with("|") {
            let sep = if clean.contains("\u{2502}") { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            if parts.len() >= 4 {
                let name = parts[0].to_string();
                if name == "Name" || name.contains("\u{2501}") {
                    continue;
                }

                let desc = parts[1].to_string();
                let src = parts[2].to_string();
                let trust_val = parts[3].to_string();
                let identifier = if parts.len() >= 5 { parts[4].to_string() } else { String::new() };

                skills.push(BrowseSkill {
                    name,
                    description: desc,
                    source: src,
                    trust: trust_val,
                    identifier,
                });
            }
        }
    }

    Ok(skills)
}

#[tauri::command]
pub async fn install_skill(identifier: String, category: Option<String>, name: Option<String>) -> Result<String, String> {
    let mut cmd = hermes_command();
    cmd.args(&["skills", "install", &identifier, "-y"]);
    if let Some(cat) = category {
        cmd.args(&["--category", &cat]);
    }
    if let Some(n) = name {
        cmd.args(&["--name", &n]);
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills install \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("\u{5B89}\u{88C5}\u{5931}\u{8D25}: {}", stderr))
    }
}

#[tauri::command]
pub async fn uninstall_skill(name: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["skills", "uninstall", &name])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills uninstall \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("\u{5378}\u{8F7D}\u{5931}\u{8D25}: {}", stderr))
    }
}

#[tauri::command]
pub async fn inspect_skill(identifier: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["skills", "inspect", &identifier])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("\u{8FD0}\u{884C} hermes skills inspect \u{5931}\u{8D25}: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if output.status.success() && !stdout.trim().is_empty() {
        return Ok(stdout);
    }

    let local_path = format!("{}{}skills{}{}{}SKILL.md", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR, identifier, std::path::MAIN_SEPARATOR);
    if let Ok(content) = std::fs::read_to_string(&local_path) {
        return Ok(content);
    }

    let parts: Vec<&str> = identifier.split('/').collect();
    if parts.len() >= 2 {
        let cat_name = format!("{}/{}", parts[parts.len() - 2], parts[parts.len() - 1]);
        let local_path2 = format!("{}{}skills{}{}{}SKILL.md", hermes_home_dir(), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR, cat_name, std::path::MAIN_SEPARATOR);
        if let Ok(content) = std::fs::read_to_string(&local_path2) {
            return Ok(content);
        }
    }

    Err(format!("Failed to view details: skill {} not found", identifier))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CatalogSkill {
    pub id: String,
    pub name: String,
    pub identifier: String,
    pub category: String,
    pub category_label: String,
    pub description: String,
    pub source: String,
    pub trust: String,
    pub version: String,
    pub tags: Vec<String>,
    pub config_schema: serde_json::Value,
    pub user_config: serde_json::Value,
    pub installed: bool,
    pub sort_order: i32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogResult {
    pub skills: Vec<CatalogSkill>,
    pub total: usize,
    pub installed_count: usize,
    pub not_installed_count: usize,
    pub categories: Vec<SkillCategory>,
    pub page: usize,
    pub total_pages: usize,
}

async fn get_hermes_installed_identifiers() -> Result<HashSet<String>, String> {
    let output = hermes_command()
        .args(&["skills", "list"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("获取已安装技能失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let mut installed = HashSet::new();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();
        if clean.starts_with('\u{2502}') || clean.starts_with("|") {
            let sep = if clean.contains('\u{2502}') { "\u{2502}" } else { "|" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if parts.len() >= 4 {
                let name = parts[0].to_string();
                if name == "Name" || name.contains('\u{2501}') {
                    continue;
                }
                installed.insert(name);
            }
        }
    }

    Ok(installed)
}

#[tauri::command]
pub async fn list_skill_catalog(
    app: AppHandle,
    search: Option<String>,
    category: Option<String>,
    source: Option<String>,
    installed_filter: Option<String>,
    page: Option<usize>,
    page_size: Option<usize>,
    locale: Option<String>,
) -> Result<SkillCatalogResult, String> {
    let pool = get_pool(&app)?;

    let installed_set = get_hermes_installed_identifiers().await.unwrap_or_default();

    let mut query_str = String::from("SELECT id, name, identifier, category, category_label, description, source, trust, version, tags, config_schema, user_config, sort_order, created_at, updated_at FROM skill_catalog WHERE 1=1");
    let mut bind_search: Option<String> = None;
    let mut bind_category: Option<String> = None;
    let mut bind_source: Option<String> = None;

    if search.is_some() {
        query_str.push_str(" AND (name LIKE ? OR description LIKE ? OR category LIKE ? OR identifier LIKE ?)");
        bind_search = search.clone();
    }
    if category.is_some() {
        query_str.push_str(" AND category = ?");
        bind_category = category.clone();
    }
    if source.is_some() {
        query_str.push_str(" AND source = ?");
        bind_source = source.clone();
    }
    query_str.push_str(" ORDER BY sort_order ASC, name ASC");

    let search_pattern = bind_search.as_ref().map(|s| format!("%{}%", s));

    let mut q = sqlx::query_as::<_, (String, String, String, String, String, String, String, String, String, String, String, String, i32, i64, i64)>(&query_str);
    if let Some(ref pattern) = search_pattern {
        q = q.bind(pattern).bind(pattern).bind(pattern).bind(pattern);
    }
    if let Some(ref c) = bind_category { q = q.bind(c); }
    if let Some(ref s) = bind_source { q = q.bind(s); }

    let loc = locale.as_deref().unwrap_or("zh-CN");
    let rows = q.fetch_all(&pool).await.map_err(|e| e.to_string())?;

    let mut all_skills: Vec<CatalogSkill> = rows.into_iter().map(|(id, name, identifier, category, category_label, description, source, trust, version, tags_str, config_schema_str, user_config_str, sort_order, _created_at, _updated_at)| {
        let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
        let config_schema: serde_json::Value = serde_json::from_str(&config_schema_str).unwrap_or(serde_json::Value::Null);
        let user_config: serde_json::Value = serde_json::from_str(&user_config_str).unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
        let installed = installed_set.contains(&identifier) || installed_set.contains(&name);
        let resolved_cat_label = resolve_locale_json(&category_label, loc);
        let resolved_desc = resolve_locale_json(&description, loc);
        CatalogSkill { id, name, identifier, category, category_label: resolved_cat_label, description: resolved_desc, source, trust, version, tags, config_schema, user_config, installed, sort_order }
    }).collect();

    let installed_names_in_catalog: HashSet<String> = all_skills.iter()
        .filter(|s| s.installed)
        .map(|s| s.identifier.clone())
        .chain(all_skills.iter().filter(|s| s.installed).map(|s| s.name.clone()))
        .collect();

    for hermes_name in &installed_set {
        if !installed_names_in_catalog.contains(hermes_name) {
            all_skills.push(CatalogSkill {
                id: format!("hermes-{}", hermes_name),
                name: hermes_name.clone(),
                identifier: hermes_name.clone(),
                category: String::new(),
                category_label: String::new(),
                description: String::new(),
                source: "hermes-dynamic".to_string(),
                trust: String::new(),
                version: String::new(),
                tags: vec![],
                config_schema: serde_json::Value::Null,
                user_config: serde_json::Value::Object(serde_json::Map::new()),
                installed: true,
                sort_order: 9999,
            });
        }
    }

    let filter = installed_filter.unwrap_or_else(|| "all".to_string());
    let filtered: Vec<CatalogSkill> = all_skills.iter().filter(|s| {
        match filter.as_str() {
            "installed" => s.installed,
            "not_installed" => !s.installed,
            _ => true,
        }
    }).cloned().collect();

    let total = filtered.len();
    let installed_count = filtered.iter().filter(|s| s.installed).count();
    let not_installed_count = total - installed_count;

    let mut cat_counts: HashMap<String, (String, usize)> = HashMap::new();
    for s in &all_skills {
        if !s.category.is_empty() {
            cat_counts.entry(s.category.clone())
                .and_modify(|(_label, count)| *count += 1)
                .or_insert((s.category_label.clone(), 1));
        }
    }
    let mut categories: Vec<SkillCategory> = cat_counts.into_iter().map(|(id, (name, count))| {
        let icon = category_icon(&id);
        SkillCategory { id, name, description: String::new(), icon, count }
    }).collect();
    categories.sort_by(|a, b| a.id.cmp(&b.id));

    let ps = page_size.unwrap_or(20);
    let p = page.unwrap_or(1);
    let total_pages = if total == 0 { 1 } else { (total + ps - 1) / ps };
    let start = (p - 1) * ps;
    let paged: Vec<CatalogSkill> = filtered.into_iter().skip(start).take(ps).collect();

    Ok(SkillCatalogResult {
        skills: paged,
        total,
        installed_count,
        not_installed_count,
        categories,
        page: p,
        total_pages,
    })
}

#[tauri::command]
pub async fn add_skill_to_catalog(app: AppHandle, input: SkillCatalogItem) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let source = if input.source.is_empty() { "hub".to_string() } else { input.source };
    let tags = if input.tags.is_empty() { "[]".to_string() } else { input.tags };
    let config_schema = if input.config_schema.is_empty() { "null".to_string() } else { input.config_schema };

    sqlx::query("INSERT OR REPLACE INTO skill_catalog (id, name, identifier, category, category_label, description, source, trust, version, tags, config_schema, user_config, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '{}', ?, ?, ?)")
        .bind(&id)
        .bind(&input.name)
        .bind(&input.identifier)
        .bind(&input.category)
        .bind(&input.category_label)
        .bind(&input.description)
        .bind(&source)
        .bind(&input.trust)
        .bind(&tags)
        .bind(&config_schema)
        .bind(input.sort_order)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn remove_skill_from_catalog(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM skill_catalog WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_skill_in_catalog(app: AppHandle, id: String, input: SkillCatalogItem) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let source = if input.source.is_empty() { "hub".to_string() } else { input.source };
    let tags = if input.tags.is_empty() { "[]".to_string() } else { input.tags };
    let config_schema = if input.config_schema.is_empty() { "null".to_string() } else { input.config_schema };

    sqlx::query("UPDATE skill_catalog SET name=?, identifier=?, category=?, category_label=?, description=?, source=?, trust=?, tags=?, config_schema=?, sort_order=?, updated_at=? WHERE id=?")
        .bind(&input.name)
        .bind(&input.identifier)
        .bind(&input.category)
        .bind(&input.category_label)
        .bind(&input.description)
        .bind(&source)
        .bind(&input.trust)
        .bind(&tags)
        .bind(&config_schema)
        .bind(input.sort_order)
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn batch_import_skills(app: AppHandle, skills: Vec<SkillCatalogItem>) -> Result<usize, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let mut count = 0usize;

    for input in skills {
        let id = uuid::Uuid::new_v4().to_string();
        let source = if input.source.is_empty() { "hub".to_string() } else { input.source };
        let tags = if input.tags.is_empty() { "[]".to_string() } else { input.tags };
        let config_schema = if input.config_schema.is_empty() { "null".to_string() } else { input.config_schema };

        let result = sqlx::query("INSERT OR IGNORE INTO skill_catalog (id, name, identifier, category, category_label, description, source, trust, version, tags, config_schema, user_config, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '{}', ?, ?, ?)")
            .bind(&id)
            .bind(&input.name)
            .bind(&input.identifier)
            .bind(&input.category)
            .bind(&input.category_label)
            .bind(&input.description)
            .bind(&source)
            .bind(&input.trust)
            .bind(&tags)
            .bind(&config_schema)
            .bind(input.sort_order)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if result.rows_affected() > 0 {
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn save_skill_config(app: AppHandle, identifier: String, config: HashMap<String, String>) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();
    let config_json = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    sqlx::query("UPDATE skill_catalog SET user_config = ?, updated_at = ? WHERE identifier = ?")
        .bind(&config_json)
        .bind(now)
        .bind(&identifier)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn install_skill_from_catalog(app: AppHandle, identifier: String, config: Option<HashMap<String, String>>) -> Result<String, String> {
    if let Some(ref cfg) = config {
        let pool = get_pool(&app)?;
        let now = chrono::Utc::now().timestamp_millis();
        let config_json = serde_json::to_string(cfg).map_err(|e| e.to_string())?;
        sqlx::query("UPDATE skill_catalog SET user_config = ?, updated_at = ? WHERE identifier = ?")
            .bind(&config_json)
            .bind(now)
            .bind(&identifier)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    }

    let install_identifier = if let Ok(Some(actual_identifier)) = search_hermes_skill(&identifier).await {
        actual_identifier
    } else {
        identifier.clone()
    };

    let mut cmd = hermes_command();
    cmd.args(&["skills", "install", &install_identifier, "-y", "--force"]);

    if let Some(ref cfg) = config {
        for (key, value) in cfg {
            cmd.env(&key, &value);
        }
    }

    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("安装失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(stdout)
    } else {
        Err(format!("安装失败: {}", stderr))
    }
}

async fn search_hermes_skill(query: &str) -> Result<Option<String>, String> {
    let mut cmd = hermes_command();
    cmd.args(&["skills", "search", query]);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let output = cmd.output().map_err(|e| format!("搜索技能失败: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    for line in stdout.lines() {
        let clean = strip_ansi(line);
        let clean = clean.trim();
        if clean.starts_with('|') || clean.starts_with("┏") || clean.starts_with("━") {
            let sep = if clean.contains('┃') { "┃" } else if clean.contains('|') { "|" } else { "\t" };
            let parts: Vec<&str> = clean.split(sep)
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if parts.len() >= 5 {
                let name = parts[0];
                if name != "Name" && !name.contains("─") && !name.is_empty() {
                    let full_identifier = parts[4].to_string();
                    if !full_identifier.is_empty() {
                        return Ok(Some(full_identifier));
                    }
                }
            }
        }
    }

    Ok(None)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CatalogFile {
    version: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    categories: Vec<CatalogCategoryDef>,
    skills: Vec<CatalogSkillDef>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CatalogCategoryDef {
    id: String,
    label: crate::database::seeds::LocalizedString,
    icon: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct CatalogSkillDef {
    name: String,
    identifier: String,
    #[serde(default)]
    category: String,
    #[serde(rename = "categoryLabel", default)]
    category_label: crate::database::seeds::LocalizedString,
    #[serde(default)]
    description: crate::database::seeds::LocalizedString,
    #[serde(default = "default_source")]
    source: String,
    #[serde(default)]
    trust: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "configSchema", default)]
    config_schema: serde_json::Value,
    #[serde(default)]
    sort_order: i32,
}

fn default_source() -> String { "hub".to_string() }

fn find_skill_catalog_json(app: &AppHandle) -> Result<(std::path::PathBuf, String), String> {
    let resource_json = app.path().resource_dir()
        .map(|p| p.join("resources").join("skill-catalog.json"))
        .map_err(|e| format!("获取资源目录失败: {}", e))?;
    log::info!("Trying resource_dir path: {}", resource_json.display());
    if resource_json.exists() {
        let content = std::fs::read_to_string(&resource_json)
            .map_err(|e| format!("读取 resources/skill-catalog.json 失败: {}", e))?;
        log::info!("Loaded skill catalog from resource_dir");
        return Ok((resource_json, content));
    }

    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("skill-catalog.json");
    log::info!("Trying dev path: {}", dev_path.display());
    if dev_path.exists() {
        let content = std::fs::read_to_string(&dev_path)
            .map_err(|e| format!("读取开发目录 skill-catalog.json 失败: {}", e))?;
        log::info!("Loaded skill catalog from dev path (CARGO_MANIFEST_DIR)");
        return Ok((dev_path, content));
    }

    let local_data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop");
    let local_json = local_data_dir.join("skill-catalog.json");
    log::info!("Trying local data path: {}", local_json.display());
    if local_json.exists() {
        let content = std::fs::read_to_string(&local_json)
            .map_err(|e| format!("读取本地 skill-catalog.json 失败: {}", e))?;
        log::info!("Loaded skill catalog from local data dir");
        return Ok((local_json, content));
    }

    Err("找不到 skill-catalog.json 文件".to_string())
}

#[tauri::command]
pub async fn load_skill_catalog_from_file(app: AppHandle) -> Result<usize, String> {
    let pool = get_pool(&app)?;

    let (_path, content) = find_skill_catalog_json(&app)?;

    let catalog: CatalogFile = serde_json::from_str(&content)
        .map_err(|e| format!("解析 skill-catalog.json 失败: {}", e))?;

    let now = chrono::Utc::now().timestamp_millis();
    let mut count = 0usize;

    for skill_def in &catalog.skills {
        let cat_label_str = if skill_def.category_label.is_empty() {
            catalog.categories.iter()
                .find(|c| c.id == skill_def.category)
                .map(|c| serde_json::to_string(&c.label).unwrap_or_default())
                .unwrap_or_default()
        } else {
            serde_json::to_string(&skill_def.category_label).unwrap_or_default()
        };

        let desc_str = serde_json::to_string(&skill_def.description).unwrap_or_default();

        let id = uuid::Uuid::new_v4().to_string();
        let tags = serde_json::to_string(&skill_def.tags).unwrap_or_else(|_| "[]".to_string());
        let config_schema = skill_def.config_schema.to_string();

        let result = sqlx::query("INSERT OR REPLACE INTO skill_catalog (id, name, identifier, category, category_label, description, source, trust, version, tags, config_schema, user_config, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, '{}', ?, ?, ?)")
            .bind(&id)
            .bind(&skill_def.name)
            .bind(&skill_def.identifier)
            .bind(&skill_def.category)
            .bind(&cat_label_str)
            .bind(&desc_str)
            .bind(&skill_def.source)
            .bind(&skill_def.trust)
            .bind(&tags)
            .bind(&config_schema)
            .bind(skill_def.sort_order)
            .bind(now)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if result.rows_affected() > 0 {
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
pub async fn check_and_init_skill_catalog(app: AppHandle) -> Result<usize, String> {
    let pool = get_pool(&app)?;

    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM skill_catalog")
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if count.0 > 0 {
        return Ok(0);
    }

    load_skill_catalog_from_file(app).await
}
