use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};

use super::helpers::{hermes_command, hermes_home_dir, hermes_agent_dir, hermes_venv_python, hermes_env_file_path, path_with_local_bin, AgentProcess, get_ssl_cert_file, home_dir};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStatus {
    pub id: String,
    pub channel_type: String,
    pub display_name: String,
    pub status: String,
    pub is_home: bool,
    pub error_message: Option<String>,
    pub connected_at: Option<i64>,
    pub config_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QrCodeResult {
    pub qr_data: String,
    pub qr_type: String,
    pub expires_in: Option<i64>,
}

#[tauri::command]
pub async fn list_channel_statuses(
    app: AppHandle,
) -> Result<Vec<ChannelStatus>, String> {
    let pool = get_pool(&app)?;

    let env_path = get_hermes_env_path()?;

    let rows = sqlx::query_as::<_, (String, String, String, String, bool, Option<String>, Option<i64>, String, i64, i64)>(
        "SELECT id, channel_type, display_name, status, is_home, error_message, connected_at, config_json, created_at, updated_at FROM channel_configs ORDER BY created_at ASC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut statuses: Vec<ChannelStatus> = rows
        .into_iter()
        .map(|(id, channel_type, display_name, status, is_home, error_message, connected_at, config_json, created_at, updated_at)| {
            ChannelStatus {
                id,
                channel_type,
                display_name,
                status,
                is_home,
                error_message,
                connected_at,
                config_json,
                created_at,
                updated_at,
            }
        })
        .collect();

    sync_status_from_env(&env_path, &mut statuses, &pool).await?;

    Ok(statuses)
}

#[tauri::command]
pub async fn channel_setup_qr(
    app: AppHandle,
    channel_type: String,
) -> Result<QrCodeResult, String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    update_channel_status(&pool, &channel_type, "connecting", None).await?;
    let _ = app.emit("channel-status-changed", &channel_type);

    let qr_result = fetch_qr_code_and_poll(&app, &channel_type).await?;

    let display_name = get_display_name(&channel_type);

    upsert_channel_config(
        &pool,
        &channel_type,
        &display_name,
        "connecting",
        "{}",
        false,
        None,
        now,
    )
    .await?;

    let _ = app.emit("channel-status-changed", &channel_type);

    Ok(qr_result)
}

#[tauri::command]
pub async fn channel_setup_token(
    app: AppHandle,
    channel_type: String,
    config: serde_json::Value,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let config_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;

    let env_path = get_hermes_env_path()?;

    write_channel_env(&env_path, &channel_type, &config)?;

    let display_name = get_display_name(&channel_type);

    upsert_channel_config(
        &pool,
        &channel_type,
        &display_name,
        "connecting",
        &config_str,
        false,
        None,
        now,
    )
    .await?;

    let _ = app.emit("channel-status-changed", &channel_type);

    match restart_gateway_internal(&app).await {
        Ok(()) => {
            update_channel_status(&pool, &channel_type, "connected", None).await?;
            let _ = app.emit("channel-status-changed", &channel_type);
            Ok(())
        }
        Err(e) => {
            update_channel_status(&pool, &channel_type, "error", Some(&format!("Gateway restart failed: {}", e))).await?;
            let _ = app.emit("channel-status-changed", &channel_type);
            Err(e)
        }
    }
}

#[tauri::command]
pub async fn channel_disconnect(
    app: AppHandle,
    channel_type: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;

    let env_path = get_hermes_env_path()?;

    remove_channel_env(&env_path, &channel_type)?;

    if channel_type == "weixin" {
        remove_weixin_account_files()?;
    }

    update_channel_status(&pool, &channel_type, "disconnected", None).await?;

    let _ = app.emit("channel-status-changed", &channel_type);

    let app_clone = app.clone();
    let ct = channel_type.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = restart_gateway_internal(&app_clone).await {
            log::warn!("Gateway restart failed after disconnect of {}: {}", ct, e);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn channel_set_home(
    app: AppHandle,
    channel_type: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;

    sqlx::query("UPDATE channel_configs SET is_home = 0")
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE channel_configs SET is_home = 1 WHERE channel_type = ?")
        .bind(&channel_type)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let env_path = get_hermes_env_path()?;
    write_env_key(&env_path, "HOME_CHANNEL", &channel_type)?;

    let _ = app.emit("channel-status-changed", &channel_type);

    Ok(())
}

#[tauri::command]
pub async fn channel_check_status(
    app: AppHandle,
    channel_type: String,
) -> Result<ChannelStatus, String> {
    let pool = get_pool(&app)?;

    let current_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM channel_configs WHERE channel_type = ?"
    )
    .bind(&channel_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?
    .flatten();

    if current_status.as_deref() == Some("connecting") {
        let row = sqlx::query_as::<_, (String, String, String, String, bool, Option<String>, Option<i64>, String, i64, i64)>(
            "SELECT id, channel_type, display_name, status, is_home, error_message, connected_at, config_json, created_at, updated_at FROM channel_configs WHERE channel_type = ?"
        )
        .bind(&channel_type)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let _ = app.emit("channel-status-changed", &channel_type);

        return match row {
            Some((id, ct, dn, st, ih, em, ca, cj, crat, upat)) => Ok(ChannelStatus {
                id, channel_type: ct, display_name: dn, status: st, is_home: ih,
                error_message: em, connected_at: ca, config_json: cj, created_at: crat, updated_at: upat,
            }),
            None => Err(format!("Channel {} not found in database", channel_type)),
        };
    }

    let configured = if channel_type == "weixin" {
        check_weixin_connected()
    } else {
        let env_path = get_hermes_env_path()?;
        check_env_configured(&env_path, &channel_type)
    };

    let new_status = if configured { "connected" } else { "disconnected" };
    let now = chrono::Utc::now().timestamp_millis();

    if new_status == "connected" {
        sqlx::query("UPDATE channel_configs SET status = ?, connected_at = ?, error_message = NULL, updated_at = ? WHERE channel_type = ?")
            .bind(new_status)
            .bind(now)
            .bind(now)
            .bind(&channel_type)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        update_channel_status(&pool, &channel_type, new_status, None).await?;
    }

    let row = sqlx::query_as::<_, (String, String, String, String, bool, Option<String>, Option<i64>, String, i64, i64)>(
        "SELECT id, channel_type, display_name, status, is_home, error_message, connected_at, config_json, created_at, updated_at FROM channel_configs WHERE channel_type = ?"
    )
    .bind(&channel_type)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let _ = app.emit("channel-status-changed", &channel_type);

    match row {
        Some((id, ct, dn, st, ih, em, ca, cj, crat, upat)) => Ok(ChannelStatus {
            id,
            channel_type: ct,
            display_name: dn,
            status: st,
            is_home: ih,
            error_message: em,
            connected_at: ca,
            config_json: cj,
            created_at: crat,
            updated_at: upat,
        }),
        None => Err(format!("Channel {} not found in database", channel_type)),
    }
}

#[tauri::command]
pub async fn restart_gateway(app: AppHandle) -> Result<(), String> {
    restart_gateway_internal(&app).await
}

#[tauri::command]
pub async fn channel_confirm_qr(
    app: AppHandle,
    channel_type: String,
) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let configured = if channel_type == "weixin" {
        check_weixin_connected()
    } else {
        let env_path = get_hermes_env_path()?;
        check_env_configured(&env_path, &channel_type)
    };

    if !configured {
        update_channel_status(&pool, &channel_type, "disconnected", Some("QR login not completed")).await?;
        let _ = app.emit("channel-status-changed", &channel_type);
        return Err("QR login was not completed. Please try again.".to_string());
    }

    update_channel_status(&pool, &channel_type, "connected", None).await?;

    let display_name = get_display_name(&channel_type);
    upsert_channel_config(
        &pool,
        &channel_type,
        &display_name,
        "connected",
        "{}",
        false,
        None,
        now,
    )
    .await?;

    let _ = app.emit("channel-status-changed", &channel_type);

    match restart_gateway_internal(&app).await {
        Ok(()) => Ok(()),
        Err(e) => {
            update_channel_status(&pool, &channel_type, "error", Some(&format!("Gateway restart failed: {}", e))).await?;
            let _ = app.emit("channel-status-changed", &channel_type);
            Err(e)
        }
    }
}

pub(crate) async fn restart_gateway_internal(app: &AppHandle) -> Result<(), String> {
    // 1. Gracefully stop the old gateway via hermes CLI
    let new_path = path_with_local_bin();
    let env_path = get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default());
    let ssl_cert_file = get_ssl_cert_file();

    let mut stop_cmd = hermes_command();
    stop_cmd
        .args(["gateway", "stop"])
        .env("PATH", &new_path)
        .env("HERMES_HOME", hermes_home_dir())
        .env("HERMES_ENV_FILE", &env_path);
    if let Some(ref cert) = ssl_cert_file {
        stop_cmd.env("SSL_CERT_FILE", cert);
    }

    let stop_output = tokio::task::spawn_blocking(move || stop_cmd.output())
        .await
        .map_err(|e| format!("hermes gateway stop spawn failed: {}", e))?
        .map_err(|e| format!("hermes gateway stop failed: {}", e))?;

    if stop_output.status.success() {
        log::info!("Old gateway stopped gracefully");
    } else {
        // Fallback: kill our tracked child process
        if let Some(state) = app.try_state::<AgentProcess>() {
            let child = {
                let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
                guard.take()
            };
            if let Some(mut child) = child {
                let _ = child.kill();
                let _ = tokio::time::timeout(
                    std::time::Duration::from_secs(5),
                    tokio::task::spawn_blocking(move || child.wait()),
                )
                .await;
                log::info!("Old gateway process killed (fallback)");
            }
        } else {
            log::warn!("hermes gateway stop failed and no tracked child to kill: {}",
                String::from_utf8_lossy(&stop_output.stderr).trim());
        }
    }

    // Wait for port release
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    // 2. Start new gateway as background child
    let workspace_root = {
        let pool = get_pool(app)?;
        sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| {
                #[cfg(not(target_os = "windows"))]
                { format!("{}/hermes-workspace", home_dir()) }
                #[cfg(target_os = "windows")]
                { format!("{}\\hermes-workspace", std::env::var("USERPROFILE").unwrap_or_default()) }
            })
    };
    let _ = std::fs::create_dir_all(&workspace_root);

    let env_path2 = get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default());
    let new_path2 = path_with_local_bin();
    let ssl_cert_file2 = get_ssl_cert_file();
    let mut gateway_cmd = hermes_command();
    gateway_cmd
        .args(["gateway", "run", "--accept-hooks"])
        .env("PATH", &new_path2)
        .env("HERMES_HOME", hermes_home_dir())
        .env("HERMES_ENV_FILE", &env_path2)
        .current_dir(&workspace_root)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Some(ref cert) = ssl_cert_file2 {
        gateway_cmd.env("SSL_CERT_FILE", cert);
    }

    match gateway_cmd.spawn() {
        Ok(child) => {
            log::info!("Hermes Gateway restarted (+API Server)");
            if let Some(state) = app.try_state::<AgentProcess>() {
                let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
                *guard = Some(child);
            }
        }
        Err(e) => {
            log::error!("Failed to restart Hermes Gateway: {}", e);
            return Err(format!("Failed to restart gateway: {}", e));
        }
    }

    let _ = app.emit("gateway-restarted", ());
    Ok(())
}

async fn update_channel_status(
    pool: &SqlitePool,
    channel_type: &str,
    status: &str,
    error_message: Option<&str>,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();
    if status == "disconnected" || status == "error" {
        sqlx::query("UPDATE channel_configs SET status = ?, error_message = ?, connected_at = NULL, updated_at = ? WHERE channel_type = ?")
            .bind(status)
            .bind(error_message)
            .bind(now)
            .bind(channel_type)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        sqlx::query("UPDATE channel_configs SET status = ?, error_message = ?, updated_at = ? WHERE channel_type = ?")
            .bind(status)
            .bind(error_message)
            .bind(now)
            .bind(channel_type)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn upsert_channel_config(
    pool: &SqlitePool,
    channel_type: &str,
    display_name: &str,
    status: &str,
    config_json: &str,
    is_home: bool,
    error_message: Option<&str>,
    now: i64,
) -> Result<(), String> {
    let id = format!("ch_{}", channel_type);

    sqlx::query(
        "INSERT INTO channel_configs (id, channel_type, display_name, config_json, status, is_home, error_message, created_at, updated_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) \
         ON CONFLICT(channel_type) DO UPDATE SET \
         display_name = excluded.display_name, \
         status = excluded.status, \
         config_json = excluded.config_json, \
         is_home = excluded.is_home, \
         error_message = excluded.error_message, \
         updated_at = excluded.updated_at"
    )
    .bind(&id)
    .bind(channel_type)
    .bind(display_name)
    .bind(config_json)
    .bind(status)
    .bind(is_home)
    .bind(error_message)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

async fn fetch_qr_code_and_poll(app: &AppHandle, channel_type: &str) -> Result<QrCodeResult, String> {
    let python_path = get_hermes_python()?;
    let project_root = get_hermes_project_root()?;

    let (qr_url, poll_script, poll_env_vars): (String, String, Vec<(String, String)>) = match channel_type {
        "weixin" => {
            let (url, qrcode_value) = fetch_weixin_qr_data(&python_path, &project_root)?;
            let script = r#"
import asyncio, json, sys, os, time, traceback, aiohttp
async def main():
    try:
        from gateway.platforms.weixin import (
            _api_get, _make_ssl_connector, save_weixin_account,
            ILINK_BASE_URL, EP_GET_QR_STATUS, QR_TIMEOUT_MS
        )
        from hermes_constants import get_hermes_home

        qrcode_value = os.environ["WEIXIN_QRCODE_VALUE"]
        hermes_home = str(get_hermes_home())

        async with aiohttp.ClientSession(trust_env=True, connector=_make_ssl_connector()) as session:
            deadline = time.monotonic() + 480
            current_base_url = ILINK_BASE_URL

            while time.monotonic() < deadline:
                try:
                    status_resp = await _api_get(
                        session,
                        base_url=current_base_url,
                        endpoint=f"{EP_GET_QR_STATUS}?qrcode={qrcode_value}",
                        timeout_ms=QR_TIMEOUT_MS,
                    )
                except asyncio.TimeoutError:
                    await asyncio.sleep(1)
                    continue
                except Exception:
                    await asyncio.sleep(1)
                    continue

                status = str(status_resp.get("status") or "wait")
                if status == "scaned_but_redirect":
                    redirect_host = str(status_resp.get("redirect_host") or "")
                    if redirect_host:
                        current_base_url = f"https://{redirect_host}"
                elif status == "expired":
                    print("QR_LOGIN_FAILED:", flush=True)
                    return
                elif status == "confirmed":
                    account_id = str(status_resp.get("ilink_bot_id") or "")
                    token = str(status_resp.get("bot_token") or "")
                    base_url = str(status_resp.get("baseurl") or ILINK_BASE_URL)
                    user_id = str(status_resp.get("ilink_user_id") or "")
                    if not account_id or not token:
                        print("QR_LOGIN_FAILED:", flush=True)
                        return
                    save_weixin_account(
                        hermes_home,
                        account_id=account_id,
                        token=token,
                        base_url=base_url,
                        user_id=user_id,
                    )
                    from hermes_cli.config import save_env_value
                    save_env_value("WEIXIN_ACCOUNT_ID", account_id)
                    result = {
                        "account_id": account_id,
                        "token": token,
                        "base_url": base_url,
                        "user_id": user_id,
                    }
                    print("QR_LOGIN_SUCCESS:" + json.dumps(result, ensure_ascii=False), flush=True)
                    return
                await asyncio.sleep(1)

            print("QR_LOGIN_FAILED:", flush=True)
    except Exception as e:
        print("QR_LOGIN_ERROR:" + str(e), flush=True)
        traceback.print_exc()
asyncio.run(main())
"#.to_string();
            (url, script, vec![("WEIXIN_QRCODE_VALUE".to_string(), qrcode_value)])
        }
        "qqbot" => {
            let url = fetch_qqbot_qr_url(&python_path, &project_root)?;
            let script = r#"
import json, sys, os, time, traceback, tempfile
try:
    from gateway.platforms.qqbot.onboard import _poll_bind_result, decrypt_secret, BindStatus, ONBOARD_POLL_INTERVAL
    session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_qqbot.json")
    with open(session_file) as f:
        session = json.load(f)
    task_id = session["task_id"]
    aes_key = session["aes_key"]
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        try:
            status, app_id, encrypted_secret, user_openid = _poll_bind_result(task_id)
        except Exception:
            time.sleep(ONBOARD_POLL_INTERVAL)
            continue
        if status == BindStatus.COMPLETED:
            client_secret = decrypt_secret(encrypted_secret, aes_key)
            from hermes_cli.config import save_env_value
            save_env_value("QQ_APP_ID", app_id)
            save_env_value("QQ_CLIENT_SECRET", client_secret)
            result = {"app_id": app_id, "client_secret": client_secret, "user_openid": user_openid}
            print("QR_LOGIN_SUCCESS:" + json.dumps(result, ensure_ascii=False), flush=True)
            sys.exit(0)
        if status == BindStatus.EXPIRED:
            break
        time.sleep(ONBOARD_POLL_INTERVAL)
    print("QR_LOGIN_FAILED:", flush=True)
except Exception as e:
    print("QR_LOGIN_ERROR:" + str(e), flush=True)
    traceback.print_exc()
"#.to_string();
            (url, script, vec![])
        }
        "feishu" => {
            let url = fetch_feishu_qr_url(&python_path, &project_root)?;
            let script = r#"
import json, sys, os, ssl, traceback, tempfile
ssl._create_default_https_context = ssl._create_unverified_context
try:
    from gateway.platforms.feishu import _poll_registration, probe_bot
    session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_feishu.json")
    with open(session_file) as f:
        session = json.load(f)
    result = _poll_registration(
        device_code=session["device_code"],
        interval=session["interval"],
        expire_in=min(session["expire_in"], 600),
        domain=session["domain"],
    )
    if result:
        app_id = result.get("app_id", "")
        app_secret = result.get("app_secret", "")
        if app_id and app_secret:
            from hermes_cli.config import save_env_value
            save_env_value("FEISHU_APP_ID", app_id)
            save_env_value("FEISHU_APP_SECRET", app_secret)
            print("QR_LOGIN_SUCCESS:" + json.dumps(result, ensure_ascii=False), flush=True)
        else:
            print(f"QR_LOGIN_ERROR:Missing app_id or app_secret in poll result: {result}", flush=True)
    else:
        print("QR_LOGIN_FAILED:", flush=True)
except Exception as e:
    print("QR_LOGIN_ERROR:" + str(e), flush=True)
    traceback.print_exc()
"#.to_string();
            (url, script, vec![])
        }
        "wecom" => {
            let url = fetch_wecom_qr_url(&python_path, &project_root)?;
            let script = r#"
import json, sys, os, time, ssl, traceback, tempfile
ssl._create_default_https_context = ssl._create_unverified_context
try:
    import urllib.request
    import urllib.parse
    session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_wecom.json")
    with open(session_file) as f:
        session = json.load(f)
    scode = session["scode"]
    query_url = f"https://work.weixin.qq.com/ai/qc/query_result?scode={urllib.parse.quote(scode)}"
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        try:
            req = urllib.request.Request(query_url, headers={"User-Agent": "HermesAgent/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except Exception:
            time.sleep(3)
            continue
        if result.get("status") == 0:
            data = result.get("data", {})
            bot_id = data.get("bot_id", "")
            secret = data.get("secret", "")
            if bot_id and secret:
                from hermes_cli.config import save_env_value
                save_env_value("WECOM_BOT_ID", bot_id)
                save_env_value("WECOM_BOT_SECRET", secret)
                print("QR_LOGIN_SUCCESS:" + json.dumps({"bot_id": bot_id, "secret": secret}, ensure_ascii=False), flush=True)
                sys.exit(0)
        time.sleep(3)
    print("QR_LOGIN_FAILED:", flush=True)
except Exception as e:
    print("QR_LOGIN_ERROR:" + str(e), flush=True)
    traceback.print_exc()
"#.to_string();
            (url, script, vec![])
        }
        "whatsapp" => {
            return Ok(QrCodeResult {
                qr_data: "Open WhatsApp > Settings > Linked Devices > Link a Device, then run: hermes whatsapp".to_string(),
                qr_type: "instruction".to_string(),
                expires_in: None,
            });
        }
        _ => {
            return Err(format!("Channel {} does not support QR login. Use token-based setup instead.", channel_type));
        }
    };

    let app_clone = app.clone();
    let channel_type_clone = channel_type.to_string();
    let python_path_clone = python_path.clone();
    let project_root_clone = project_root.clone();
    let poll_env_vars_clone = poll_env_vars;

    tauri::async_runtime::spawn_blocking(move || {
            let mut cmd = std::process::Command::new(&python_path_clone);
            cmd.args(&["-c", &poll_script])
                .env("PYTHONPATH", &project_root_clone)
                .env("PYTHONUNBUFFERED", "1")
                .env("HERMES_HOME", hermes_home_dir())
                .env("HERMES_ENV_FILE", get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default()));
            if let Some(cert) = get_ssl_cert_file() {
                cmd.env("SSL_CERT_FILE", &cert);
            }
            for (key, value) in &poll_env_vars_clone {
                cmd.env(key, value);
            }
            let output = cmd
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output();

            let (stdout_str, stderr_str) = match &output {
                Ok(out) => (
                    String::from_utf8_lossy(&out.stdout).to_string(),
                    String::from_utf8_lossy(&out.stderr).to_string(),
                ),
                Err(e) => (String::new(), format!("Failed to run poll script: {}", e)),
            };

            log::info!("[channel] Poll script for {} completed. stdout: {}, stderr: {}",
                channel_type_clone,
                stdout_str.trim(),
                stderr_str.trim(),
            );

            let login_success = match output {
                Ok(ref out) => {
                    String::from_utf8_lossy(&out.stdout).contains("QR_LOGIN_SUCCESS:")
                }
                Err(_) => false,
            };

        let pool = match get_pool(&app_clone) {
            Ok(p) => p,
            Err(_) => return,
        };

        let env_path = match get_hermes_env_path() {
            Ok(p) => p,
            Err(_) => return,
        };

        let connected = if channel_type_clone == "weixin" {
            check_weixin_connected()
        } else {
            check_env_configured(&env_path, &channel_type_clone)
        };

        let new_status = if login_success || connected { "connected" } else { "disconnected" };
        let now = chrono::Utc::now().timestamp_millis();

        let rt = tokio::runtime::Handle::current();
        let _ = rt.block_on(async {
            let _ = sqlx::query("UPDATE channel_configs SET status = ?, connected_at = CASE WHEN ? = 'connected' THEN ? ELSE connected_at END, updated_at = ? WHERE channel_type = ?")
                .bind(new_status)
                .bind(new_status)
                .bind(now)
                .bind(now)
                .bind(&channel_type_clone)
                .execute(&pool)
                .await;
        });

        let _ = app_clone.emit("channel-status-changed", &channel_type_clone);
    });

    Ok(QrCodeResult {
        qr_data: qr_url,
        qr_type: "url".to_string(),
        expires_in: Some(600),
    })
}

fn fetch_weixin_qr_data(python_path: &str, project_root: &str) -> Result<(String, String), String> {
    let script = r#"
import asyncio, json, sys
async def main():
    import aiohttp
    ILINK_BASE_URL = "https://ilinkai.weixin.qq.com"
    ILINK_APP_ID = "bot"
    ILINK_APP_CLIENT_VERSION = (2 << 16) | (2 << 8) | 0
    EP_GET_BOT_QR = "ilink/bot/get_bot_qrcode"
    try:
        from gateway.platforms.weixin import _make_ssl_connector
        connector = _make_ssl_connector()
    except Exception:
        connector = None
    async with aiohttp.ClientSession(trust_env=True, connector=connector) as session:
        url = f"{ILINK_BASE_URL}/{EP_GET_BOT_QR}?bot_type=3"
        headers = {
            "iLink-App-Id": ILINK_APP_ID,
            "iLink-App-ClientVersion": str(ILINK_APP_CLIENT_VERSION),
        }
        timeout = aiohttp.ClientTimeout(total=35)
        async with session.get(url, headers=headers, timeout=timeout) as response:
            raw = await response.text()
            if not response.ok:
                print(f"QR_FETCH_ERROR:HTTP {response.status}")
                return
            data = json.loads(raw)
            qrcode_value = str(data.get("qrcode") or "")
            qrcode_url = str(data.get("qrcode_img_content") or "")
            if not qrcode_value:
                print("QR_FETCH_ERROR:Missing qrcode in response")
                return
            scan_url = qrcode_url if qrcode_url else qrcode_value
            print(f"QR_URL:{scan_url}")
            print(f"QR_VALUE:{qrcode_value}")
asyncio.run(main())
"#;

    let mut cmd = std::process::Command::new(python_path);
    cmd.args(&["-c", script])
        .env("PYTHONPATH", project_root)
        .env("HERMES_HOME", hermes_home_dir())
        .env("HERMES_ENV_FILE", get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default()));
    if let Some(cert) = get_ssl_cert_file() {
        cmd.env("SSL_CERT_FILE", &cert);
    }
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to fetch WeChat QR URL: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::info!("[channel] Weixin QR fetch stderr: {}", stderr.trim());

    let qr_url = stdout
        .lines()
        .find(|l| l.starts_with("QR_URL:"))
        .map(|l| l.trim_start_matches("QR_URL:").to_string());

    let qr_value = stdout
        .lines()
        .find(|l| l.starts_with("QR_VALUE:"))
        .map(|l| l.trim_start_matches("QR_VALUE:").to_string());

    match (qr_url, qr_value) {
        (Some(url), Some(value)) => Ok((url, value)),
        _ => {
            if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_FETCH_ERROR:")) {
                let msg = line.trim_start_matches("QR_FETCH_ERROR:").to_string();
                return Err(format!("Failed to fetch WeChat QR code: {}", msg));
            }
            Err(format!(
                "Failed to get WeChat QR data. stdout: {}, stderr: {}",
                stdout.trim(),
                stderr.trim()
            ))
        }
    }
}

fn fetch_qqbot_qr_url(python_path: &str, project_root: &str) -> Result<String, String> {
    let script = r#"
import json, sys, os, tempfile
try:
    from gateway.platforms.qqbot.onboard import _create_bind_task, build_connect_url
    task_id, aes_key = _create_bind_task()
    url = build_connect_url(task_id)
    session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_qqbot.json")
    with open(session_file, "w") as f:
        json.dump({"task_id": task_id, "aes_key": aes_key}, f)
    print(f"QR_URL:{url}")
except Exception as e:
    print(f"QR_FETCH_ERROR:{e}")
"#;

    let mut cmd = std::process::Command::new(python_path);
    cmd.args(&["-c", script])
        .env("PYTHONPATH", project_root)
        .env("HERMES_HOME", hermes_home_dir())
        .env("HERMES_ENV_FILE", get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default()));
    if let Some(cert) = get_ssl_cert_file() {
        cmd.env("SSL_CERT_FILE", &cert);
    }
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to fetch QQ Bot QR URL: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::info!("[channel] QQ Bot QR fetch stderr: {}", stderr.trim());

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_URL:")) {
        return Ok(line.trim_start_matches("QR_URL:").to_string());
    }

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_FETCH_ERROR:")) {
        let msg = line.trim_start_matches("QR_FETCH_ERROR:").to_string();
        return Err(format!("Failed to fetch QQ Bot QR code: {}", msg));
    }

    Err(format!(
        "Failed to get QQ Bot QR URL. stdout: {}, stderr: {}",
        stdout.trim(),
        stderr.trim()
    ))
}

fn fetch_feishu_qr_url(python_path: &str, project_root: &str) -> Result<String, String> {
    let script = r#"
import json, sys, os, ssl, tempfile
ssl._create_default_https_context = ssl._create_unverified_context
try:
    from gateway.platforms.feishu import _init_registration, _begin_registration
    _init_registration("feishu")
    begin = _begin_registration("feishu")
    qr_url = begin.get("qr_url", "")
    if qr_url:
        session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_feishu.json")
        with open(session_file, "w") as f:
            json.dump({
                "device_code": begin.get("device_code"),
                "interval": begin.get("interval", 5),
                "expire_in": begin.get("expire_in", 600),
                "domain": "feishu",
            }, f)
        print(f"QR_URL:{qr_url}")
    else:
        print("QR_FETCH_ERROR:No QR URL in response")
except Exception as e:
    print(f"QR_FETCH_ERROR:{e}")
"#;

    let mut cmd = std::process::Command::new(python_path);
    cmd.args(&["-c", script])
        .env("PYTHONPATH", project_root)
        .env("HERMES_HOME", hermes_home_dir());
    if let Some(cert) = get_ssl_cert_file() {
        cmd.env("SSL_CERT_FILE", &cert);
    }
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to fetch Feishu QR URL: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::info!("[channel] Feishu QR fetch stderr: {}", stderr.trim());

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_URL:")) {
        return Ok(line.trim_start_matches("QR_URL:").to_string());
    }

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_FETCH_ERROR:")) {
        let msg = line.trim_start_matches("QR_FETCH_ERROR:").to_string();
        return Err(format!("Failed to fetch Feishu QR code: {}", msg));
    }

    Err(format!(
        "Failed to get Feishu QR URL. stdout: {}, stderr: {}",
        stdout.trim(),
        stderr.trim()
    ))
}

fn fetch_wecom_qr_url(python_path: &str, project_root: &str) -> Result<String, String> {
    let script = r#"
import json, sys, os, ssl, tempfile
ssl._create_default_https_context = ssl._create_unverified_context
try:
    from gateway.platforms.wecom import _QR_CODE_PAGE, _QR_GENERATE_URL
    import urllib.request
    import urllib.parse
    import json as _json
    generate_url = f"{_QR_GENERATE_URL}?source=hermes"
    req = urllib.request.Request(generate_url, headers={"User-Agent": "HermesAgent/1.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = _json.loads(resp.read())
    scode = data.get("scode", "")
    if scode:
        page_url = f"{_QR_CODE_PAGE}{urllib.parse.quote(scode)}"
        session_file = os.path.join(tempfile.gettempdir(), "hermes_qr_wecom.json")
        with open(session_file, "w") as f:
            json.dump({"scode": scode}, f)
        print(f"QR_URL:{page_url}")
    else:
        print("QR_FETCH_ERROR:No scode in response")
except Exception as e:
    print(f"QR_FETCH_ERROR:{e}")
"#;

    let mut cmd = std::process::Command::new(python_path);
    cmd.args(&["-c", script])
        .env("PYTHONPATH", project_root)
        .env("HERMES_HOME", hermes_home_dir())
        .env("HERMES_ENV_FILE", get_hermes_env_path().unwrap_or_else(|_| hermes_env_file_path().unwrap_or_default()));
    if let Some(cert) = get_ssl_cert_file() {
        cmd.env("SSL_CERT_FILE", &cert);
    }
    let output = cmd
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to fetch WeCom QR URL: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    log::info!("[channel] WeCom QR fetch stderr: {}", stderr.trim());

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_URL:")) {
        return Ok(line.trim_start_matches("QR_URL:").to_string());
    }

    if let Some(line) = stdout.lines().find(|l| l.starts_with("QR_FETCH_ERROR:")) {
        let msg = line.trim_start_matches("QR_FETCH_ERROR:").to_string();
        return Err(format!("Failed to fetch WeCom QR code: {}", msg));
    }

    Err(format!(
        "Failed to get WeCom QR URL. stdout: {}, stderr: {}",
        stdout.trim(),
        stderr.trim()
    ))
}

fn get_hermes_python() -> Result<String, String> {
    hermes_venv_python()
}

fn get_hermes_project_root() -> Result<String, String> {
    hermes_agent_dir()
}

fn get_hermes_env_path() -> Result<String, String> {
    hermes_env_file_path()
}

fn get_hermes_home_path() -> Result<String, String> {
    Ok(hermes_home_dir())
}

fn check_weixin_connected() -> bool {
    let hermes_home = match get_hermes_home_path() {
        Ok(h) => h,
        Err(_) => return false,
    };
    let accounts_dir = std::path::Path::new(&hermes_home).join("weixin").join("accounts");
    if let Ok(mut entries) = std::fs::read_dir(&accounts_dir) {
        entries.any(|e| e.map_or(false, |e| e.path().extension().map_or(false, |ext| ext == "json")))
    } else {
        false
    }
}

fn check_env_configured(env_path: &str, channel_type: &str) -> bool {
    let prefix = get_env_prefix(channel_type);
    let required_keys = get_required_env_keys(channel_type);

    if required_keys.is_empty() {
        return false;
    }

    let content = match std::fs::read_to_string(env_path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let mut found_keys = std::collections::HashSet::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once('=') {
            let key = k.trim().to_uppercase();
            let val = v.trim();
            if !val.is_empty() && key.starts_with(&prefix) {
                found_keys.insert(key);
            }
        }
    }

    required_keys.iter().all(|key| found_keys.contains(key))
}

fn get_required_env_keys(channel_type: &str) -> Vec<String> {
    match channel_type {
        "weixin" => vec!["WEIXIN_ACCOUNT_ID".to_string()],
        "qqbot" => vec!["QQ_APP_ID".to_string(), "QQ_CLIENT_SECRET".to_string()],
        "wecom" => vec!["WECOM_BOT_ID".to_string(), "WECOM_SECRET".to_string()],
        "dingtalk" => vec!["DINGTALK_CLIENT_ID".to_string(), "DINGTALK_CLIENT_SECRET".to_string()],
        "feishu" => vec!["FEISHU_APP_ID".to_string(), "FEISHU_APP_SECRET".to_string()],
        "yuanbao" => vec!["YUANBAO_APP_ID".to_string(), "YUANBAO_APP_SECRET".to_string()],
        "telegram" => vec!["TELEGRAM_BOT_TOKEN".to_string()],
        "discord" => vec!["DISCORD_BOT_TOKEN".to_string()],
        "slack" => vec!["SLACK_BOT_TOKEN".to_string(), "SLACK_APP_TOKEN".to_string()],
        "whatsapp" => vec!["WHATSAPP_ENABLED".to_string()],
        "signal" => vec!["SIGNAL_ACCOUNT".to_string(), "SIGNAL_HTTP_URL".to_string()],
        "email" => vec!["EMAIL_ADDRESS".to_string(), "EMAIL_PASSWORD".to_string(), "EMAIL_SMTP_HOST".to_string(), "EMAIL_SMTP_PORT".to_string(), "EMAIL_IMAP_HOST".to_string(), "EMAIL_IMAP_PORT".to_string()],
        "sms" => vec!["TWILIO_ACCOUNT_SID".to_string(), "TWILIO_AUTH_TOKEN".to_string(), "TWILIO_PHONE_NUMBER".to_string()],
        "matrix" => vec!["MATRIX_HOMESERVER".to_string(), "MATRIX_ACCESS_TOKEN".to_string()],
        "mattermost" => vec!["MATTERMOST_URL".to_string(), "MATTERMOST_TOKEN".to_string()],
        "homeassistant" => vec!["HASS_URL".to_string(), "HASS_TOKEN".to_string()],
        "bluebubbles" => vec!["BLUEBUBBLES_SERVER_URL".to_string(), "BLUEBUBBLES_PASSWORD".to_string()],
        "open-webui" => vec!["OPENWEBUI_SERVER_URL".to_string(), "OPENWEBUI_API_KEY".to_string()],
        "webhooks" => vec!["WEBHOOK_ENABLED".to_string()],
        _ => vec![],
    }
}

async fn sync_status_from_env(
    env_path: &str,
    statuses: &mut [ChannelStatus],
    pool: &SqlitePool,
) -> Result<(), String> {
    let now = chrono::Utc::now().timestamp_millis();

    for status in statuses.iter_mut() {
        let configured = if status.channel_type == "weixin" {
            check_weixin_connected()
        } else {
            check_env_configured(env_path, &status.channel_type)
        };
        let new_status = if configured { "connected" } else { "disconnected" };

        if status.status != new_status {
            let old_status = status.status.clone();
            status.status = new_status.to_string();

            if new_status == "connected" && old_status != "connected" {
                status.connected_at = Some(now);
            } else if new_status == "disconnected" {
                status.connected_at = None;
            }

            sqlx::query("UPDATE channel_configs SET status = ?, connected_at = ?, updated_at = ? WHERE channel_type = ?")
                .bind(new_status)
                .bind(status.connected_at)
                .bind(now)
                .bind(&status.channel_type)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn write_channel_env(
    _env_path: &str,
    channel_type: &str,
    config: &serde_json::Value,
) -> Result<(), String> {
    let prefix = get_env_prefix(channel_type);

    if let Some(obj) = config.as_object() {
        let env_path_output = crate::commands::helpers::hermes_command()
            .args(&["config", "env-path"])
            .env("HERMES_HOME", hermes_home_dir())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .output()
            .map_err(|e| format!("Failed to get env path: {}", e))?;
        let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();
        if env_path.is_empty() {
            return Err("Cannot get Hermes env file path".to_string());
        }

        let prefix_upper = prefix.to_uppercase();
        if std::path::Path::new(&env_path).exists() {
            if let Ok(content) = std::fs::read_to_string(&env_path) {
                let mut existing_keys: std::collections::HashSet<String> = std::collections::HashSet::new();
                for line in content.lines() {
                    let trimmed = line.trim();
                    if let Some((k, _)) = trimmed.split_once('=') {
                        let key_upper = k.trim().to_uppercase();
                        if key_upper.starts_with(&prefix_upper) {
                            existing_keys.insert(key_upper);
                        }
                    }
                }
                if obj.contains_key("proxy") {
                    existing_keys.insert("HTTPS_PROXY".to_string());
                    existing_keys.insert("HTTP_PROXY".to_string());
                }

                let filtered: Vec<String> = content
                    .lines()
                    .filter(|line| {
                        let trimmed = line.trim();
                        if trimmed.is_empty() || trimmed.starts_with('#') {
                            return true;
                        }
                        if let Some((k, _)) = trimmed.split_once('=') {
                            let key_upper = k.trim().to_uppercase();
                            return !existing_keys.contains(&key_upper);
                        }
                        true
                    })
                    .map(String::from)
                    .collect();
                std::fs::write(&env_path, filtered.join("\n"))
                    .map_err(|e| format!("Failed to clean old channel env: {}", e))?;
            }
        }

        for (key, value) in obj {
            if key == "proxy" {
                continue;
            }
            let env_key = format!("{}_{}", prefix, key.to_uppercase().replace('-', "_"));
            let val_str = match value {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::Bool(b) => b.to_string(),
                _ => value.to_string(),
            };
            crate::commands::helpers::hermes_config_set(&env_key, &val_str)?;
        }

        if channel_type == "webhooks" {
            crate::commands::helpers::hermes_config_set("WEBHOOK_ENABLED", "true")?;
        }

        if channel_type == "whatsapp" {
            crate::commands::helpers::hermes_config_set("WHATSAPP_ENABLED", "true")?;
        }

        if let Some(proxy_val) = obj.get("proxy") {
            let proxy_str = match proxy_val {
                serde_json::Value::String(s) => s.clone(),
                _ => proxy_val.to_string(),
            };
            if !proxy_str.is_empty() {
                crate::commands::helpers::hermes_config_set("HTTPS_PROXY", &proxy_str)?;
                crate::commands::helpers::hermes_config_set("HTTP_PROXY", &proxy_str)?;
            }
        }
    }

    Ok(())
}

fn remove_channel_env(_env_path: &str, channel_type: &str) -> Result<(), String> {
    let env_path_output = crate::commands::helpers::hermes_command()
        .args(&["config", "env-path"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("Failed to get env path: {}", e))?;
    let env_path = String::from_utf8_lossy(&env_path_output.stdout).trim().to_string();
    if env_path.is_empty() || !std::path::Path::new(&env_path).exists() {
        return Ok(());
    }

    let prefix = get_env_prefix(channel_type).to_uppercase();

    let content = std::fs::read_to_string(&env_path).map_err(|e| format!("Failed to read .env: {}", e))?;

    let filtered: Vec<String> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                return true;
            }
            if let Some((k, _)) = trimmed.split_once('=') {
                let key_upper = k.trim().to_uppercase();
                if key_upper.starts_with(&prefix) {
                    return false;
                }
            }
            true
        })
        .map(String::from)
        .collect();

    std::fs::write(&env_path, filtered.join("\n"))
        .map_err(|e| format!("Failed to write .env: {}", e))?;

    Ok(())
}

fn write_env_key(_env_path: &str, key: &str, value: &str) -> Result<(), String> {
    crate::commands::helpers::hermes_config_set(key, value)
}

fn get_env_prefix(channel_type: &str) -> String {
    match channel_type {
        "weixin" => "WEIXIN".to_string(),
        "qqbot" => "QQ".to_string(),
        "wecom" => "WECOM".to_string(),
        "dingtalk" => "DINGTALK".to_string(),
        "feishu" => "FEISHU".to_string(),
        "yuanbao" => "YUANBAO".to_string(),
        "telegram" => "TELEGRAM".to_string(),
        "discord" => "DISCORD".to_string(),
        "slack" => "SLACK".to_string(),
        "whatsapp" => "WHATSAPP".to_string(),
        "signal" => "SIGNAL".to_string(),
        "email" => "EMAIL".to_string(),
        "sms" => "TWILIO".to_string(),
        "matrix" => "MATRIX".to_string(),
        "mattermost" => "MATTERMOST".to_string(),
        "homeassistant" => "HASS".to_string(),
        "bluebubbles" => "BLUEBUBBLES".to_string(),
        "open-webui" => "OPENWEBUI".to_string(),
        "webhooks" => "WEBHOOK".to_string(),
        _ => channel_type.to_uppercase().replace('-', "_"),
    }
}

fn get_display_name(channel_type: &str) -> String {
    match channel_type {
        "weixin" => "微信".to_string(),
        "qqbot" => "QQ Bot".to_string(),
        "wecom" => "企业微信".to_string(),
        "dingtalk" => "钉钉".to_string(),
        "feishu" => "飞书".to_string(),
        "yuanbao" => "元宝".to_string(),
        "telegram" => "Telegram".to_string(),
        "discord" => "Discord".to_string(),
        "slack" => "Slack".to_string(),
        "whatsapp" => "WhatsApp".to_string(),
        "signal" => "Signal".to_string(),
        "email" => "电子邮件".to_string(),
        "sms" => "SMS (Twilio)".to_string(),
        "matrix" => "Matrix".to_string(),
        "mattermost" => "Mattermost".to_string(),
        "homeassistant" => "Home Assistant".to_string(),
        "bluebubbles" => "iMessage (BlueBubbles)".to_string(),
        "open-webui" => "Open WebUI".to_string(),
        "webhooks" => "Webhooks".to_string(),
        _ => channel_type.to_string(),
    }
}

fn remove_weixin_account_files() -> Result<(), String> {
    let hermes_home = get_hermes_home_path()?;
    let accounts_dir = std::path::Path::new(&hermes_home).join("weixin").join("accounts");
    if accounts_dir.exists() {
        std::fs::remove_dir_all(&accounts_dir)
            .map_err(|e| format!("Failed to remove weixin account files: {}", e))?;
    }
    Ok(())
}
