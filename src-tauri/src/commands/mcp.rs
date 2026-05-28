use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::helpers::{hermes_home_dir, hermes_command};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerInfo {
    pub name: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub enabled: bool,
    pub tool_count: Option<i32>,
    pub auth: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolInfo {
    pub name: String,
    pub server_name: String,
    pub description: Option<String>,
}

fn mcp_config_path() -> String {
    format!("{}{}config.yaml", hermes_home_dir(), std::path::MAIN_SEPARATOR)
}

fn read_config_raw() -> Result<(serde_yaml::Value, Vec<(String, serde_yaml::Value)>), String> {
    let path = mcp_config_path();
    if !std::path::Path::new(&path).exists() {
        return Ok((serde_yaml::Value::Mapping(serde_yaml::Mapping::new()), Vec::new()));
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;

    let config: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    let servers_pairs = match config.get("mcp_servers").and_then(|v| v.as_mapping()) {
        Some(mapping) => mapping.iter()
            .map(|(k, v)| {
                let name = k.as_str().unwrap_or("unknown").to_string();
                (name, v.clone())
            })
            .collect(),
        None => Vec::new(),
    };

    Ok((config, servers_pairs))
}

fn migrate_old_mcp_config() {
    let old_path = format!("{}{}mcp_servers.yaml", hermes_home_dir(), std::path::MAIN_SEPARATOR);
    let new_path = mcp_config_path();

    if !std::path::Path::new(&old_path).exists() {
        return;
    }

    if let Ok(content) = std::fs::read_to_string(&old_path) {
        if let Ok(old_config) = serde_yaml::from_str::<serde_yaml::Value>(&content) {
            if old_config.get("mcp_servers").and_then(|v| v.as_mapping()).map(|m| m.is_empty()).unwrap_or(true) {
                let _ = std::fs::remove_file(&old_path);
                return;
            }

            let (mut config, existing_pairs) = read_config_raw().unwrap_or_else(|_| {
                (serde_yaml::Value::Mapping(serde_yaml::Mapping::new()), Vec::new())
            });

            let existing_names: std::collections::HashSet<String> = existing_pairs.iter().map(|(n, _)| n.clone()).collect();

            let mut merged_pairs = existing_pairs;
            if let Some(old_servers) = old_config.get("mcp_servers").and_then(|v| v.as_mapping()) {
                for (k, v) in old_servers.iter() {
                    let name = k.as_str().unwrap_or("unknown").to_string();
                    if !existing_names.contains(&name) {
                        merged_pairs.push((name, v.clone()));
                    }
                }
            }

            let mut servers_map = serde_yaml::Mapping::new();
            for (name, value) in &merged_pairs {
                servers_map.insert(
                    serde_yaml::Value::String(name.clone()),
                    value.clone(),
                );
            }

            if let Some(root) = config.as_mapping_mut() {
                root.insert(
                    serde_yaml::Value::String("mcp_servers".to_string()),
                    serde_yaml::Value::Mapping(servers_map),
                );
            }

            if let Ok(yaml_str) = serde_yaml::to_string(&config) {
                if std::fs::write(&new_path, yaml_str).is_ok() {
                    let _ = std::fs::remove_file(&old_path);
                    log::info!("Migrated MCP servers from mcp_servers.yaml to config.yaml");
                }
            }
        }
    }
}

fn read_mcp_servers_from_config() -> Result<(serde_yaml::Value, Vec<(String, serde_yaml::Value)>), String> {
    migrate_old_mcp_config();
    read_config_raw()
}

fn write_mcp_servers_to_config(servers_pairs: &[(String, serde_yaml::Value)]) -> Result<(), String> {
    let path = mcp_config_path();
    let hermes_home = hermes_home_dir();
    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create hermes home dir: {}", e);
    }

    let (mut config, _) = read_mcp_servers_from_config().unwrap_or_else(|_| {
        (serde_yaml::Value::Mapping(serde_yaml::Mapping::new()), Vec::new())
    });

    let mut servers_map = serde_yaml::Mapping::new();
    for (name, value) in servers_pairs {
        servers_map.insert(
            serde_yaml::Value::String(name.clone()),
            value.clone(),
        );
    }

    if let Some(root) = config.as_mapping_mut() {
        root.insert(
            serde_yaml::Value::String("mcp_servers".to_string()),
            serde_yaml::Value::Mapping(servers_map),
        );
    } else {
        let mut root = serde_yaml::Mapping::new();
        root.insert(
            serde_yaml::Value::String("mcp_servers".to_string()),
            serde_yaml::Value::Mapping(servers_map),
        );
        config = serde_yaml::Value::Mapping(root);
    }

    let content = serde_yaml::to_string(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write config: {}", e))
}

fn parse_server_from_yaml(name: &str, value: &serde_yaml::Value) -> McpServerInfo {
    let transport = value.get("transport")
        .and_then(|v| v.as_str())
        .unwrap_or("stdio")
        .to_string();

    let command = value.get("command").and_then(|v| v.as_str()).map(String::from);
    let args = value.get("args")
        .and_then(|v| v.as_sequence())
        .map(|seq| seq.iter().filter_map(|a| a.as_str().map(String::from)).collect());

    let url = value.get("url").and_then(|v| v.as_str()).map(String::from);
    let enabled = value.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    let auth = value.get("auth").and_then(|v| v.as_str()).map(String::from);

    let env = value.get("env")
        .and_then(|v| v.as_mapping())
        .map(|m| m.iter().filter_map(|(k, v)| {
            let key = k.as_str()?.to_string();
            let val = v.as_str()?.to_string();
            Some((key, val))
        }).collect());

    let headers = value.get("headers")
        .and_then(|v| v.as_mapping())
        .map(|m| m.iter().filter_map(|(k, v)| {
            let key = k.as_str()?.to_string();
            let val = v.as_str()?.to_string();
            Some((key, val))
        }).collect());

    McpServerInfo {
        name: name.to_string(),
        transport,
        command,
        args,
        url,
        enabled,
        tool_count: None,
        auth,
        env,
        headers,
    }
}

fn server_to_yaml_value(server: &McpServerInfo) -> serde_yaml::Value {
    let mut server_value = serde_yaml::Mapping::new();
    server_value.insert(
        serde_yaml::Value::String("transport".to_string()),
        serde_yaml::Value::String(server.transport.clone()),
    );
    if let Some(cmd) = &server.command {
        if !cmd.is_empty() {
            server_value.insert(
                serde_yaml::Value::String("command".to_string()),
                serde_yaml::Value::String(cmd.clone()),
            );
        }
    }
    if let Some(args) = &server.args {
        if !args.is_empty() {
            let seq: Vec<serde_yaml::Value> = args.iter()
                .map(|a| serde_yaml::Value::String(a.clone()))
                .collect();
            server_value.insert(
                serde_yaml::Value::String("args".to_string()),
                serde_yaml::Value::Sequence(seq),
            );
        }
    }
    if let Some(url) = &server.url {
        if !url.is_empty() {
            server_value.insert(
                serde_yaml::Value::String("url".to_string()),
                serde_yaml::Value::String(url.clone()),
            );
        }
    }
    server_value.insert(
        serde_yaml::Value::String("enabled".to_string()),
        serde_yaml::Value::Bool(server.enabled),
    );
    if let Some(auth) = &server.auth {
        if !auth.is_empty() {
            server_value.insert(
                serde_yaml::Value::String("auth".to_string()),
                serde_yaml::Value::String(auth.clone()),
            );
        }
    }
    if let Some(env) = &server.env {
        if !env.is_empty() {
            let mapping: serde_yaml::Mapping = env.iter()
                .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
                .collect();
            server_value.insert(
                serde_yaml::Value::String("env".to_string()),
                serde_yaml::Value::Mapping(mapping),
            );
        }
    }
    if let Some(headers) = &server.headers {
        if !headers.is_empty() {
            let mapping: serde_yaml::Mapping = headers.iter()
                .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
                .collect();
            server_value.insert(
                serde_yaml::Value::String("headers".to_string()),
                serde_yaml::Value::Mapping(mapping),
            );
        }
    }
    serde_yaml::Value::Mapping(server_value)
}

#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String> {
    let (_, servers_pairs) = read_mcp_servers_from_config()?;
    let servers: Vec<McpServerInfo> = servers_pairs.iter()
        .map(|(name, value)| parse_server_from_yaml(name, value))
        .collect();
    Ok(servers)
}

#[tauri::command]
pub async fn mcp_add_server(server: McpServerInfo) -> Result<(), String> {
    let (_, mut servers_pairs) = read_mcp_servers_from_config()?;

    if servers_pairs.iter().any(|(n, _)| n == &server.name) {
        return Err(format!("Server '{}' already exists", server.name));
    }

    servers_pairs.push((server.name.clone(), server_to_yaml_value(&server)));
    write_mcp_servers_to_config(&servers_pairs)
}

#[tauri::command]
pub async fn mcp_update_server(original_name: String, server: McpServerInfo) -> Result<(), String> {
    let (_, mut servers_pairs) = read_mcp_servers_from_config()?;

    servers_pairs.retain(|(n, _)| n != &original_name);
    servers_pairs.push((server.name.clone(), server_to_yaml_value(&server)));

    write_mcp_servers_to_config(&servers_pairs)
}

#[tauri::command]
pub async fn mcp_remove_server(name: String) -> Result<(), String> {
    let (_, mut servers_pairs) = read_mcp_servers_from_config()?;
    servers_pairs.retain(|(n, _)| n != &name);
    write_mcp_servers_to_config(&servers_pairs)
}

#[tauri::command]
pub async fn mcp_test_server(name: String) -> Result<String, String> {
    let output = hermes_command()
        .args(["mcp", "test", &name])
        .output()
        .map_err(|e| format!("Failed to run hermes mcp test: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP server test failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn mcp_enable_server(name: String, enabled: bool) -> Result<(), String> {
    let (_, mut servers_pairs) = read_mcp_servers_from_config()?;

    let idx = servers_pairs.iter()
        .position(|(n, _)| n == &name)
        .ok_or(format!("Server '{}' not found", name))?;

    let mut server_value = servers_pairs[idx].1.clone();
    if let Some(mapping) = server_value.as_mapping_mut() {
        mapping.insert(
            serde_yaml::Value::String("enabled".to_string()),
            serde_yaml::Value::Bool(enabled),
        );
    }
    servers_pairs[idx].1 = server_value;

    write_mcp_servers_to_config(&servers_pairs)
}
