use crate::commands::helpers::{hermes_command, strip_ansi};
use serde::Serialize;
use std::process::Stdio;

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
struct SkillCategory {
    id: String,
    name: String,
    description: String,
    icon: String,
    count: usize,
}

fn parse_skill_frontmatter(category: &str, skill_name: &str) -> (String, String, Vec<String>) {
    let home = dirs::home_dir().unwrap_or_default();
    let skill_path = format!("{}/.hermes/skills/{}/{}/SKILL.md", home.display(), category, skill_name);

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
    let home = dirs::home_dir().unwrap_or_default();
    let desc_path = format!("{}/.hermes/skills/{}/DESCRIPTION.md", home.display(), category);

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

    let home = dirs::home_dir().unwrap_or_default();
    let local_path = format!("{}/.hermes/skills/{}/SKILL.md", home.display(), identifier);
    if let Ok(content) = std::fs::read_to_string(&local_path) {
        return Ok(content);
    }

    let parts: Vec<&str> = identifier.split('/').collect();
    if parts.len() >= 2 {
        let cat_name = format!("{}/{}", parts[parts.len() - 2], parts[parts.len() - 1]);
        let local_path2 = format!("{}/.hermes/skills/{}/SKILL.md", home.display(), cat_name);
        if let Ok(content) = std::fs::read_to_string(&local_path2) {
            return Ok(content);
        }
    }

    Err(format!("Failed to view details: skill {} not found", identifier))
}
