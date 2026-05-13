use crate::commands::helpers::{
    command, copy_dir_recursive, ensure_gateway_config, hermes_command,
    home_dir, kill_hermes_process, path_with_local_bin, try_install_python_via_uv,
    AgentProcess, AppState, InstallProgress,
    sync_api_keys_to_hermes_env, sync_hermes_providers_to_db,
};
use serde::Serialize;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize, Clone)]
pub struct HermesInfo {
    installed: bool,
    running: bool,
    version: String,
    python: String,
    model: String,
    provider: String,
    project_path: String,
    api_keys: Vec<ApiKeyStatus>,
}

#[derive(Serialize, Clone)]
pub struct ApiKeyStatus {
    name: String,
    configured: bool,
}

#[tauri::command]
pub async fn get_hermes_info() -> Result<HermesInfo, String> {
    use crate::commands::helpers::{check_hermes_process, strip_ansi};

    let version_output = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let (installed, version, python, project_path) = match version_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut ver = String::new();
            let mut py = String::new();
            let mut proj = String::new();

            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("Hermes Agent") {
                    ver = line.to_string();
                } else if line.starts_with("Python:") {
                    py = line.replace("Python:", "").trim().to_string();
                } else if line.starts_with("Project:") {
                    proj = line.replace("Project:", "").trim().to_string();
                }
            }
            (output.status.success(), ver, py, proj)
        }
        Err(_) => (false, String::new(), String::new(), String::new()),
    };

    if !installed {
        return Ok(HermesInfo {
            installed: false,
            running: false,
            version: String::new(),
            python: String::new(),
            model: String::new(),
            provider: String::new(),
            project_path: String::new(),
            api_keys: vec![],
        });
    }

    let status_output = hermes_command()
        .arg("status")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let (model, provider, api_keys) = match status_output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut model = String::new();
            let mut provider = String::new();
            let mut keys: Vec<ApiKeyStatus> = Vec::new();
            let mut in_api_section = false;

            for line in stdout.lines() {
                let line_trimmed = line.trim();
                let clean = strip_ansi(line_trimmed);
                let clean = clean.trim();

                if clean.starts_with("Model:") {
                    model = clean.replace("Model:", "").trim().to_string();
                } else if clean.starts_with("Provider:") {
                    provider = clean.replace("Provider:", "").trim().to_string();
                } else if clean.contains("API Keys") {
                    in_api_section = true;
                } else if clean.starts_with("✔") && in_api_section {
                    in_api_section = false;
                } else if in_api_section && (clean.contains("✔") || clean.contains("✘")) {
                    let configured = clean.contains("✔");
                    let name = clean
                        .replace("✔", "")
                        .replace("✘", "")
                        .split("(")
                        .next()
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    if !name.is_empty() {
                        keys.push(ApiKeyStatus { name, configured });
                    }
                }
            }
            (model, provider, keys)
        }
        Err(_) => (String::new(), String::new(), vec![]),
    };

    let running = check_hermes_process();

    Ok(HermesInfo {
        installed,
        running,
        version,
        python,
        model,
        provider,
        project_path,
        api_keys,
    })
}

#[tauri::command]
pub async fn check_hermes_installed() -> Result<serde_json::Value, String> {
    let version_output = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match version_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut version = String::new();
            let mut python = String::new();
            for line in stdout.lines() {
                let line = line.trim();
                if line.starts_with("Hermes Agent") {
                    version = line.to_string();
                } else if line.starts_with("Python:") {
                    python = line.replace("Python:", "").trim().to_string();
                }
            }
            Ok(serde_json::json!({
                "installed": true,
                "version": version,
                "python": python
            }))
        }
        _ => Ok(serde_json::json!({
            "installed": false,
            "version": "",
            "python": ""
        })),
    }
}

#[tauri::command]
#[allow(unused_variables)]
pub async fn install_hermes_agent(app: AppHandle, method: String) -> Result<bool, String> {
    log::info!("[install] Starting installation, method={}", method);
    let _ = app.emit(
        "install-progress",
        InstallProgress { line: "Detecting system environment...".to_string(), done: false, success: false },
    );

    kill_hermes_process();

    log::info!("[install] Proceeding with native install (bundled source)");

    #[cfg(target_os = "windows")]
    {
        return windows_native_install(&app).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        return unix_native_install(&app).await;
    }
}

#[tauri::command]
pub async fn start_hermes_agent(app: AppHandle, state: State<'_, AgentProcess>) -> Result<String, String> {
    use crate::commands::helpers::path_with_local_bin;

    kill_hermes_process();
    std::thread::sleep(std::time::Duration::from_millis(300));

    let workspace_root = {
        let state = app.state::<AppState>();
        let pool = state.db_pool.clone();
        sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| format!("{}/hermes-workspace", home_dir()))
    };
    let _ = std::fs::create_dir_all(&workspace_root);

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let _ = guard.take();

    let new_path = path_with_local_bin();

    match hermes_command()
        .args(["gateway", "run", "--accept-hooks"])
        .env("PATH", &new_path)
        .current_dir(&workspace_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            log::info!("Hermes Agent started (cwd: {})", workspace_root);
            *guard = Some(child);
            Ok("Hermes Agent started".to_string())
        }
        Err(e) => {
            log::error!("Failed to start Hermes Agent: {}", e);
            Err(format!("Failed to start Hermes Agent: {}", e))
        }
    }
}

#[tauri::command]
pub fn restart_hermes(app: AppHandle, state: State<'_, AgentProcess>) -> Result<String, String> {
    {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let _ = guard.take();
    }

    kill_hermes_process();

    std::thread::sleep(std::time::Duration::from_millis(500));

    let app_state = app.state::<AppState>();
    let pool = app_state.db_pool.clone();
    let workspace_root = tauri::async_runtime::block_on(async {
        sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| format!("{}/hermes-workspace", home_dir()))
    });
    let _ = std::fs::create_dir_all(&workspace_root);

    let new_path = path_with_local_bin();

    let child = hermes_command()
        .args(["gateway", "run", "--accept-hooks"])
        .env("PATH", &new_path)
        .current_dir(&workspace_root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start hermes: {}", e))?;

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(child);
    log::info!("Hermes Agent restarted (cwd: {})", workspace_root);
    Ok("Hermes Agent restarted".to_string())
}

#[tauri::command]
pub fn open_log_dir() -> Result<(), String> {
    let log_dir = crate::database::models::log_dir();

    #[cfg(target_os = "macos")]
    command("open")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    command("explorer")
        .arg(&log_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_conversation_count(app: AppHandle) -> Result<i64, String> {
    use crate::commands::helpers::AppState;

    let state = app.state::<AppState>();
    let pool = &state.db_pool;
    let row = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM conversations")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.0)
}

#[tauri::command]
pub async fn get_hermes_config() -> Result<serde_json::Value, String> {
    use crate::commands::helpers::serde_yaml_to_json;

    let config_path_output = hermes_command()
        .args(&["config", "path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get config path: {}", e))?;
    let config_path = String::from_utf8_lossy(&config_path_output.stdout).trim().to_string();

    let env_path_output = hermes_command()
        .args(&["config", "env-path"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to get env path: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();

    let yaml_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config file: {}", e))?;

    let yaml = serde_yaml_to_json(&yaml_content);

    let model = yaml.pointer("/model/default")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let provider = yaml.pointer("/model/provider")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let base_url = yaml.pointer("/model/base_url")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let max_turns = yaml.pointer("/agent/max_turns")
        .and_then(|v| v.as_i64()).unwrap_or(90);
    let personality = yaml.pointer("/display/personality")
        .and_then(|v| v.as_str()).unwrap_or("default").to_string();
    let show_reasoning = yaml.pointer("/display/show_reasoning")
        .and_then(|v| v.as_bool()).unwrap_or(false);
    let timezone = yaml.get("timezone")
        .and_then(|v| v.as_str()).unwrap_or("").to_string();
    let terminal_backend = yaml.pointer("/terminal/backend")
        .and_then(|v| v.as_str()).unwrap_or("local").to_string();
    let terminal_timeout = yaml.pointer("/terminal/timeout")
        .and_then(|v| v.as_i64()).unwrap_or(180);
    let compression_enabled = yaml.pointer("/compression/enabled")
        .and_then(|v| v.as_bool()).unwrap_or(true);
    let memory_enabled = yaml.pointer("/memory/memory_enabled")
        .and_then(|v| v.as_bool()).unwrap_or(true);
    let tts_provider = yaml.pointer("/tts/provider")
        .and_then(|v| v.as_str()).unwrap_or("edge").to_string();

    Ok(serde_json::json!({
        "model": model,
        "provider": provider,
        "base_url": base_url,
        "max_turns": max_turns,
        "personality": personality,
        "show_reasoning": show_reasoning,
        "timezone": timezone,
        "terminal_backend": terminal_backend,
        "terminal_timeout": terminal_timeout,
        "compression_enabled": compression_enabled,
        "memory_enabled": memory_enabled,
        "tts_provider": tts_provider,
        "config_path": config_path,
        "env_path": env_path,
    }))
}

#[tauri::command]
pub async fn set_hermes_config(key: String, value: String) -> Result<String, String> {
    let output = hermes_command()
        .args(&["config", "set", &key, &value])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to modify config: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout.trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Err(format!("{}{}", stdout, stderr).trim().to_string())
    }
}

#[cfg(not(target_os = "windows"))]
async fn unix_native_install(app: &AppHandle) -> Result<bool, String> {
    use crate::commands::helpers::find_unix_python;

    let home = home_dir();
    let hermes_dir = format!("{}/.hermes/hermes-agent", home);
    let venv_dir = format!("{}/venv", hermes_dir);

    let _ = app.emit("install-progress", InstallProgress {
        line: "Extracting project from bundled source...".to_string(), done: false, success: false,
    });

    if std::path::Path::new(&hermes_dir).exists() {
        log::info!("[install] Removing existing hermes_dir: {}", hermes_dir);
        let _ = std::fs::remove_dir_all(&hermes_dir);
    }
    std::fs::create_dir_all(&hermes_dir)
        .map_err(|e| format!("Failed to create dir {}: {}", hermes_dir, e))?;

    let source_candidates = vec![
        app.path().resource_dir()
            .map(|p| p.join("hermes-agent-source"))
            .unwrap_or_default(),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("hermes-agent-source"),
        std::env::current_exe()
            .map(|p| p.parent().unwrap_or(std::path::Path::new(".")).join("hermes-agent-source"))
            .unwrap_or_default(),
    ];

    let mut bundled_found = false;
    let mut found_path = std::path::PathBuf::new();
    for candidate in &source_candidates {
        log::info!("[install] Looking for bundled source at: {}", candidate.display());
        if candidate.exists() && candidate.is_dir() {
            let has_real_source = candidate.join("pyproject.toml").exists()
                || candidate.join("setup.py").exists()
                || candidate.join("setup.cfg").exists();
            if has_real_source {
                bundled_found = true;
                found_path = candidate.clone();
                break;
            } else {
                log::warn!("[install] Found directory but no valid source files, skipping: {}", candidate.display());
            }
        }
    }

    if bundled_found {
        log::info!("[install] Copying bundled hermes-agent source from: {}", found_path.display());
        copy_dir_recursive(&found_path, std::path::Path::new(&hermes_dir))
            .map_err(|e| format!("Failed to copy source: {}", e))?;
        log::info!("[install] Source copy complete");
    } else {
        return Err("Bundled hermes-agent source not found. Please build the application with 'node scripts/download-hermes-source.cjs' first, or reinstall.".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Source code ready".to_string(), done: false, success: false,
    });

    let python = find_unix_python()
        .or_else(|| try_install_python_via_uv(&app))
        .ok_or("Python 3.11+ not found, and auto-install failed. Please install Python 3.11+ manually.")?;

    let _ = app.emit("install-progress", InstallProgress {
        line: format!("Using Python: {}", python), done: false, success: false,
    });

    let _ = app.emit("install-progress", InstallProgress {
        line: "Creating virtual environment...".to_string(), done: false, success: false,
    });

    let venv = command(&python)
        .args(["-m", "venv", &venv_dir])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to create venv: {}", e))?;

    if !venv.status.success() {
        return Err("Failed to create virtual environment".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Virtual environment created, installing dependencies...".to_string(), done: false, success: false,
    });

    let python_exe = format!("{}/bin/python", venv_dir);
    let _pip_upgrade = command(&python_exe)
        .args(["-m", "pip", "install", "--upgrade", "pip",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let install = command(&python_exe)
        .args(["-m", "pip", "install", "-e", &hermes_dir,
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("pip install failed: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("pip install failed: {}", stderr.trim()));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Installing gateway dependencies...".to_string(), done: false, success: false,
    });

    let _ = command(&python_exe)
        .args(["-m", "pip", "install", "aiohttp",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let _ = app.emit("install-progress", InstallProgress {
        line: "Dependencies installed, verifying...".to_string(), done: false, success: false,
    });

    let venv_hermes_bin = format!("{}/bin/hermes", venv_dir);
    let version_check = command(&venv_hermes_bin)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !version_check {
        return Err("Hermes Agent installation verification failed. The bundled source may be incomplete or corrupted. Please reinstall the application.".to_string());
    }

    let local_bin = format!("{}/.local/bin", home);
    let hermes_link = format!("{}/hermes", local_bin);
    let venv_hermes = format!("{}/bin/hermes", venv_dir);
    if std::path::Path::new(&venv_hermes).exists() && !std::path::Path::new(&hermes_link).exists() {
        let _ = std::fs::create_dir_all(&local_bin);
        let _ = std::os::unix::fs::symlink(&venv_hermes, &hermes_link);
    }

    let actual_installed = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if actual_installed {
        ensure_gateway_config(app);
        sync_hermes_providers_to_db(app).await;
        sync_api_keys_to_hermes_env(app).await;
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: if actual_installed { "Installation complete".to_string() } else { "Installation failed".to_string() },
        done: true, success: actual_installed,
    });

    Ok(actual_installed)
}

#[cfg(target_os = "windows")]
async fn windows_native_install(app: &AppHandle) -> Result<bool, String> {
    use crate::commands::helpers::{find_windows_python, try_install_python_via_uv};

    let local_appdata = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let hermes_dir = format!("{}\\hermes\\hermes-agent", local_appdata);
    let venv_dir = format!("{}\\venv", hermes_dir);

    let _ = app.emit("install-progress", InstallProgress {
        line: "Extracting project from bundled source...".to_string(), done: false, success: false,
    });

    if std::path::Path::new(&hermes_dir).exists() {
        log::info!("[install] Removing existing hermes_dir: {}", hermes_dir);
        let _ = std::fs::remove_dir_all(&hermes_dir);
    }
    std::fs::create_dir_all(&hermes_dir)
        .map_err(|e| format!("Failed to create dir {}: {}", hermes_dir, e))?;

    let resource_base = app.path().resource_dir()
        .map_err(|e| format!("Cannot get resource dir: {}", e))?;

    let source_candidates = vec![
        resource_base.join("hermes-agent-source"),
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("hermes-agent-source"),
        std::path::Path::new(&std::env::current_exe().map_err(|e| e.to_string())?)
            .parent().unwrap_or(std::path::Path::new("."))
            .join("hermes-agent-source"),
    ];

    let mut bundled_found = false;
    let mut found_path = std::path::PathBuf::new();
    for candidate in &source_candidates {
        log::info!("[install] Looking for bundled source at: {}", candidate.display());
        if candidate.exists() && candidate.is_dir() {
            let has_real_source = candidate.join("pyproject.toml").exists()
                || candidate.join("setup.py").exists()
                || candidate.join("setup.cfg").exists();
            if has_real_source {
                bundled_found = true;
                found_path = candidate.clone();
                break;
            } else {
                log::warn!("[install] Found directory but no valid source files, skipping: {}", candidate.display());
            }
        }
    }

    if bundled_found {
        log::info!("[install] Copying bundled hermes-agent source from: {}", found_path.display());
        copy_dir_recursive(&found_path, std::path::Path::new(&hermes_dir))
            .map_err(|e| format!("Failed to copy source: {}", e))?;
        log::info!("[install] Source copy complete");
    } else {
        return Err("Bundled hermes-agent source not found. Please build the application with 'node scripts/download-hermes-source.cjs' first, or reinstall.".to_string());
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Source code ready".to_string(), done: false, success: false,
    });

    let python = find_windows_python()
        .or_else(|| try_install_python_via_uv(app))
        .ok_or("Python not found, please install Python 3.11 or higher")?;

    let _ = app.emit("install-progress", InstallProgress {
        line: format!("Using Python: {}", python), done: false, success: false,
    });

    let _ = app.emit("install-progress", InstallProgress {
        line: "Creating virtual environment...".to_string(), done: false, success: false,
    });

    let venv = command(&python)
        .args(["-m", "venv", &venv_dir])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to create venv: {}", e))?;

    if !venv.status.success() {
        let stderr = String::from_utf8_lossy(&venv.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&venv.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Unknown error".to_string()
        };
        log::error!("[install] venv creation failed: {}", detail);
        return Err(format!(
            "Failed to create virtual environment with Python '{}': {}. Please ensure Python 3.11+ is installed from python.org (not Microsoft Store stub)",
            python, detail
        ));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Virtual environment created, installing dependencies (Tsinghua mirror)...".to_string(), done: false, success: false,
    });

    let python_exe = format!("{}\\Scripts\\python.exe", venv_dir);
    let install = command(&python_exe)
        .args(["-m", "pip", "install", "--upgrade", "pip",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let install = command(&python_exe)
        .args(["-m", "pip", "install", "-e", &hermes_dir,
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("pip install failed: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        return Err(format!("pip install failed: {}", stderr.trim()));
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: "Installing gateway dependencies...".to_string(), done: false, success: false,
    });

    let _ = command(&python_exe)
        .args(["-m", "pip", "install", "aiohttp",
               "-i", "https://pypi.tuna.tsinghua.edu.cn/simple/",
               "--trusted-host", "pypi.tuna.tsinghua.edu.cn"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let _ = app.emit("install-progress", InstallProgress {
        line: "Dependencies installed, verifying...".to_string(), done: false, success: false,
    });

    let venv_hermes_bin = format!("{}\\Scripts\\hermes.exe", venv_dir);
    let version_check = command(&venv_hermes_bin)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !version_check {
        return Err("Hermes Agent installation verification failed. The bundled source may be incomplete or corrupted. Please reinstall the application.".to_string());
    }

    let actual_installed = hermes_command()
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if actual_installed {
        ensure_gateway_config(app);
        sync_hermes_providers_to_db(app).await;
        sync_api_keys_to_hermes_env(app).await;
    }

    let _ = app.emit("install-progress", InstallProgress {
        line: if actual_installed { "Installation complete".to_string() } else { "Installation failed".to_string() },
        done: true, success: actual_installed,
    });

    Ok(actual_installed)
}
