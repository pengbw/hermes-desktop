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
    format!("{}{}mcp_servers.yaml", hermes_home_dir(), std::path::MAIN_SEPARATOR)
}

fn read_mcp_config() -> Result<serde_yaml::Value, String> {
    let path = mcp_config_path();
    if !std::path::Path::new(&path).exists() {
        return Ok(serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read MCP config: {}", e))?;
    let config: serde_yaml::Value = serde_yaml::from_str(&content)
        .map_err(|e| format!("Failed to parse MCP config: {}", e))?;
    Ok(config)
}

fn write_mcp_config(config: &serde_yaml::Value) -> Result<(), String> {
    let path = mcp_config_path();
    let hermes_home = hermes_home_dir();
    if let Err(e) = std::fs::create_dir_all(&hermes_home) {
        log::warn!("Failed to create hermes home dir: {}", e);
    }
    let content = serde_yaml::to_string(config)
        .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write MCP config: {}", e))
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

#[tauri::command]
pub async fn mcp_list_servers() -> Result<Vec<McpServerInfo>, String> {
    let config = read_mcp_config()?;
    let servers = config.get("mcp_servers")
        .and_then(|v| v.as_mapping())
        .map(|m| m.iter().map(|(k, v)| {
            let name = k.as_str().unwrap_or("unknown").to_string();
            parse_server_from_yaml(&name, v)
        }).collect())
        .unwrap_or_default();
    Ok(servers)
}

#[tauri::command]
pub async fn mcp_add_server(server: McpServerInfo) -> Result<(), String> {
    let mut config = read_mcp_config()?;

    let servers = config.as_mapping_mut()
        .ok_or("Invalid config format")?
        .entry(serde_yaml::Value::String("mcp_servers".to_string()))
        .or_insert(serde_yaml::Value::Mapping(serde_yaml::Mapping::new()))
        .as_mapping_mut()
        .ok_or("Invalid mcp_servers format")?;

    if servers.contains_key(&serde_yaml::Value::String(server.name.clone())) {
        return Err(format!("Server '{}' already exists", server.name));
    }

    let mut server_value = serde_yaml::Mapping::new();
    server_value.insert(
        serde_yaml::Value::String("transport".to_string()),
        serde_yaml::Value::String(server.transport.clone()),
    );
    if let Some(cmd) = &server.command {
        server_value.insert(
            serde_yaml::Value::String("command".to_string()),
            serde_yaml::Value::String(cmd.clone()),
        );
    }
    if let Some(args) = &server.args {
        let seq: Vec<serde_yaml::Value> = args.iter()
            .map(|a| serde_yaml::Value::String(a.clone()))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("args".to_string()),
            serde_yaml::Value::Sequence(seq),
        );
    }
    if let Some(url) = &server.url {
        server_value.insert(
            serde_yaml::Value::String("url".to_string()),
            serde_yaml::Value::String(url.clone()),
        );
    }
    server_value.insert(
        serde_yaml::Value::String("enabled".to_string()),
        serde_yaml::Value::Bool(server.enabled),
    );
    if let Some(auth) = &server.auth {
        server_value.insert(
            serde_yaml::Value::String("auth".to_string()),
            serde_yaml::Value::String(auth.clone()),
        );
    }
    if let Some(env) = &server.env {
        let mapping: serde_yaml::Mapping = env.iter()
            .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("env".to_string()),
            serde_yaml::Value::Mapping(mapping),
        );
    }
    if let Some(headers) = &server.headers {
        let mapping: serde_yaml::Mapping = headers.iter()
            .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("headers".to_string()),
            serde_yaml::Value::Mapping(mapping),
        );
    }

    servers.insert(
        serde_yaml::Value::String(server.name.clone()),
        serde_yaml::Value::Mapping(server_value),
    );

    write_mcp_config(&config)
}

#[tauri::command]
pub async fn mcp_update_server(original_name: String, server: McpServerInfo) -> Result<(), String> {
    let mut config = read_mcp_config()?;

    let servers = config.as_mapping_mut()
        .ok_or("Invalid config format")?
        .get_mut("mcp_servers")
        .and_then(|v| v.as_mapping_mut())
        .ok_or("mcp_servers not found")?;

    if original_name != server.name {
        servers.remove(&serde_yaml::Value::String(original_name));
    }

    let mut server_value = serde_yaml::Mapping::new();
    server_value.insert(
        serde_yaml::Value::String("transport".to_string()),
        serde_yaml::Value::String(server.transport.clone()),
    );
    if let Some(cmd) = &server.command {
        server_value.insert(
            serde_yaml::Value::String("command".to_string()),
            serde_yaml::Value::String(cmd.clone()),
        );
    }
    if let Some(args) = &server.args {
        let seq: Vec<serde_yaml::Value> = args.iter()
            .map(|a| serde_yaml::Value::String(a.clone()))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("args".to_string()),
            serde_yaml::Value::Sequence(seq),
        );
    }
    if let Some(url) = &server.url {
        server_value.insert(
            serde_yaml::Value::String("url".to_string()),
            serde_yaml::Value::String(url.clone()),
        );
    }
    server_value.insert(
        serde_yaml::Value::String("enabled".to_string()),
        serde_yaml::Value::Bool(server.enabled),
    );
    if let Some(auth) = &server.auth {
        server_value.insert(
            serde_yaml::Value::String("auth".to_string()),
            serde_yaml::Value::String(auth.clone()),
        );
    }
    if let Some(env) = &server.env {
        let mapping: serde_yaml::Mapping = env.iter()
            .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("env".to_string()),
            serde_yaml::Value::Mapping(mapping),
        );
    }
    if let Some(headers) = &server.headers {
        let mapping: serde_yaml::Mapping = headers.iter()
            .map(|(k, v)| (serde_yaml::Value::String(k.clone()), serde_yaml::Value::String(v.clone())))
            .collect();
        server_value.insert(
            serde_yaml::Value::String("headers".to_string()),
            serde_yaml::Value::Mapping(mapping),
        );
    }

    servers.insert(
        serde_yaml::Value::String(server.name.clone()),
        serde_yaml::Value::Mapping(server_value),
    );

    write_mcp_config(&config)
}

#[tauri::command]
pub async fn mcp_remove_server(name: String) -> Result<(), String> {
    let mut config = read_mcp_config()?;

    let servers = config.as_mapping_mut()
        .ok_or("Invalid config format")?
        .get_mut("mcp_servers")
        .and_then(|v| v.as_mapping_mut())
        .ok_or("mcp_servers not found")?;

    servers.remove(&serde_yaml::Value::String(name));
    write_mcp_config(&config)
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
    let mut config = read_mcp_config()?;

    let servers = config.as_mapping_mut()
        .ok_or("Invalid config format")?
        .get_mut("mcp_servers")
        .and_then(|v| v.as_mapping_mut())
        .ok_or("mcp_servers not found")?;

    let server_entry = servers.get_mut(&serde_yaml::Value::String(name.clone()))
        .ok_or(format!("Server '{}' not found", name))?;

    let server_map = server_entry.as_mapping_mut()
        .ok_or("Invalid server entry format")?;

    server_map.insert(
        serde_yaml::Value::String("enabled".to_string()),
        serde_yaml::Value::Bool(enabled),
    );

    write_mcp_config(&config)
}
