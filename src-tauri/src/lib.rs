mod commands;
mod database;
mod services;

use commands::helpers::{
    hermes_command, ensure_gateway_config, kill_hermes_process,
    show_error_dialog, sync_api_keys_to_hermes_env, sync_hermes_providers_to_db,
    AppState, AgentProcess, home_dir, path_with_local_bin, get_ssl_cert_file,
};
use sqlx::SqlitePool;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::Manager;
use tauri::Listener;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AgentProcess(Mutex::new(None)))
        .setup(|app| {
            log::info!("Hermes Desktop started");

            if let Some(avatar_win) = app.get_webview_window("avatar") {
                let _ = avatar_win.set_decorations(false);
                let _ = avatar_win.set_shadow(false);
            }

            let db_path = database::models::db_path();
            log::info!("Database path: {}", db_path.display());

            if let Some(parent) = db_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    log::error!("Failed to create directory: {}", e);
                }
            }

            let app_handle = app.handle().clone();

            let wal_path = db_path.with_extension("db-wal");
            let shm_path = db_path.with_extension("db-shm");
            for stale in [&wal_path, &shm_path] {
                if stale.exists() {
                    log::info!("Cleaning up stale WAL/SHM files: {}", stale.display());
                    let _ = std::fs::remove_file(stale);
                }
            }

            let db_path_clone = db_path.clone();
            let connect_fn = || {
                db_path_clone.to_str()
                    .unwrap_or("hermes.db")
                    .parse::<sqlx::sqlite::SqliteConnectOptions>()
                    .unwrap_or_else(|_| sqlx::sqlite::SqliteConnectOptions::new().filename(&db_path_clone))
                    .create_if_missing(true)
                    .journal_mode(sqlx::sqlite::SqliteJournalMode::Delete)
                    .foreign_keys(true)
            };

            tauri::async_runtime::block_on(async {
                let result = SqlitePool::connect_with(connect_fn()).await;

                match result {
                    Ok(pool) => {
                        if let Err(e) = database::models::init_db(&pool).await {
                            log::error!("Failed to initialize database: {}", e);
                        }
                        app_handle.manage(AppState { db_pool: pool, local_embedding: services::local_embedding::LocalEmbeddingState::new(), file_watcher: services::file_watcher::FileWatcherState::new() });
                    }
                    Err(e) => {
                        log::warn!("Database connection failed: {}, attempting recovery...", e);

                        let _ = std::fs::remove_file(&db_path);
                        let _ = std::fs::remove_file(&wal_path);
                        let _ = std::fs::remove_file(&shm_path);

                        match SqlitePool::connect_with(connect_fn()).await {
                            Ok(pool) => {
                                log::info!("Database rebuilt successfully");
                                if let Err(e) = database::models::init_db(&pool).await {
                                    log::error!("Failed to initialize database: {}", e);
                                }
                                app_handle.manage(AppState { db_pool: pool, local_embedding: services::local_embedding::LocalEmbeddingState::new(), file_watcher: services::file_watcher::FileWatcherState::new() });
                            }
                            Err(e2) => {
                                log::error!("Database recovery failed: {}", e2);
                                show_error_dialog(&format!("Database connection failed\n\n{}\n\nApplication will exit", e2));
                                std::process::exit(1);
                            }
                        }
                    }
                }
            });

            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let bundled_onnx = resource_dir.join("models/all-MiniLM-L6-v2/model.onnx");
            if bundled_onnx.exists() {
                let data_dir = dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("."))
                    .join("hermes-desktop")
                    .join("models")
                    .join("all-MiniLM-L6-v2");
                let _ = std::fs::create_dir_all(&data_dir);
                let dest_onnx = data_dir.join("model.onnx");
                if !dest_onnx.exists() {
                    log::info!("[onnx] 首次启动，从资源目录安装ONNX模型");
                    if let Err(e) = std::fs::copy(&bundled_onnx, &dest_onnx) {
                        log::warn!("[onnx] 从资源目录复制ONNX模型失败: {}", e);
                    } else {
                        log::info!("[onnx] ONNX模型已安装到: {}", dest_onnx.display());
                    }
                }
            }

            let hermes_installed = hermes_command()
                .arg("version")
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);

            if hermes_installed {
                ensure_gateway_config(app.handle());
                let handle = app.handle().clone();
                tauri::async_runtime::block_on(async {
                    sync_hermes_providers_to_db(&handle).await;
                    sync_api_keys_to_hermes_env(&handle).await;
                });

                kill_hermes_process();
                std::thread::sleep(std::time::Duration::from_millis(300));

                let workspace_root = {
                    let state = app.handle().state::<AppState>();
                    let pool = state.db_pool.clone();
                    tauri::async_runtime::block_on(async {
                        sqlx::query_scalar::<_, String>("SELECT value FROM app_config WHERE key = 'workspace_root'")
                            .fetch_optional(&pool)
                            .await
                            .ok()
                            .flatten()
                            .filter(|v| !v.is_empty())
                            .unwrap_or_else(|| {
                                format!("{}/hermes-workspace", home_dir())
                            })
                    })
                };
                let _ = std::fs::create_dir_all(&workspace_root);

                let new_path = path_with_local_bin();
                let hermes_home = format!("{}/.hermes", home_dir());
                let hermes_env = format!("{}/.env", hermes_home);
                let mut gateway_cmd = hermes_command();
                gateway_cmd
                    .args(["gateway", "run", "--accept-hooks"])
                    .env("PATH", &new_path)
                    .env("HERMES_HOME", &hermes_home)
                    .env("HERMES_ENV_FILE", &hermes_env)
                    .current_dir(&workspace_root)
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null());

                // Resolve SSL cert bundle for hermes Python (cross-platform, any Python version)
                if let Some(cert) = get_ssl_cert_file() {
                    gateway_cmd.env("SSL_CERT_FILE", &cert);
                }

                match gateway_cmd.spawn() {
                    Ok(child) => {
                        log::info!("Hermes Gateway started (+API Server)");
                        app.manage(AgentProcess(Mutex::new(Some(child))));
                    }
                    Err(e) => {
                        log::error!("Failed to start Hermes Gateway: {}", e);
                        app.manage(AgentProcess(Mutex::new(None)));
                    }
                }
            } else {
                log::warn!("Hermes Agent not installed, skipping startup, waiting for frontend guide");
            }

            // Listen for workflow auto_push completion events and trigger next step
            let app_wf = app.handle().clone();
            app.listen("workflow_auto_push_completed", move |event| {
                let payload = event.payload().to_string();
                match serde_json::from_str::<serde_json::Value>(&payload) {
                    Ok(data) => {
                        let project_id = data["projectId"].as_str().unwrap_or("").to_string();
                        let role_id = data["roleId"].as_str().unwrap_or("").to_string();
                        if !project_id.is_empty() && !role_id.is_empty() {
                            let app_trigger = app_wf.clone();
                            let project_trigger = project_id.clone();
                            let role_trigger = role_id.clone();
                            tauri::async_runtime::spawn(async move {
                                let (wf_run_id, wf_step_index): (Option<String>, Option<i32>) = {
                                    let state = app_trigger.state::<AppState>();
                                    let pool = state.db_pool.clone();
                                    let run_info: Option<(String, i32)> = sqlx::query_as(
                                        "SELECT wr.id, wrs.step_index FROM workflow_runs wr \
                                         JOIN workflow_run_steps wrs ON wr.id = wrs.run_id \
                                         WHERE wr.project_id = ? AND wr.status = 'running' \
                                         AND wrs.status = 'running' \
                                         ORDER BY wrs.step_index ASC LIMIT 1"
                                    )
                                    .bind(&project_trigger)
                                    .fetch_optional(&pool)
                                    .await
                                    .unwrap_or(None);
                                    run_info.map(|(rid, si)| (Some(rid), Some(si))).unwrap_or((None, None))
                                };
                                log::info!("workflow_auto_push_completed: triggering next step for project_id={}, from_role_id={}, run_id={:?}, step={:?}", project_trigger, role_trigger, wf_run_id, wf_step_index);
                                match commands::project::trigger_workflow_execution(app_trigger, project_trigger, role_trigger, None, None, Some(true), wf_run_id, wf_step_index).await {
                                    Ok(result) => log::info!("workflow_auto_push_completed: triggered={}, pending={}", result.triggered_workflows.len(), result.pending_approvals.len()),
                                    Err(e) => log::error!("workflow_auto_push_completed: error={}", e),
                                }
                            });
                        }
                    }
                    Err(e) => {
                        log::error!("workflow_auto_push_completed: failed to parse payload: {}", e);
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::install::restart_hermes,
            commands::window::toggle_avatar_window,
            commands::window::sync_chat_window,
            commands::window::close_chat_window,
            commands::window::hide_avatar_window,
            commands::hermes_chat::chat_with_hermes_stream,
            commands::hermes_chat::chat_with_hermes_api,
            commands::install::open_log_dir,
            commands::install::get_hermes_info,
            commands::install::check_hermes_installed,
            commands::install::install_hermes_agent,
            commands::install::start_hermes_agent,
            commands::install::get_conversation_count,
            commands::skill::list_hermes_skills,
            commands::skill::browse_skills,
            commands::skill::search_skills,
            commands::skill::install_skill,
            commands::skill::uninstall_skill,
            commands::skill::inspect_skill,
            commands::skill::list_skill_catalog,
            commands::skill::add_skill_to_catalog,
            commands::skill::remove_skill_from_catalog,
            commands::skill::update_skill_in_catalog,
            commands::skill::batch_import_skills,
            commands::skill::save_skill_config,
            commands::skill::install_skill_from_catalog,
            commands::skill::load_skill_catalog_from_file,
            commands::skill::check_and_init_skill_catalog,
            commands::install::get_hermes_config,
            commands::install::set_hermes_config,
            commands::chat::create_conversation,
            commands::chat::list_conversations,
            commands::chat::delete_conversation,
            commands::chat::update_conversation_session_id,
            commands::chat::update_conversation_kb_ids,
            commands::chat::activate_conversation,
            commands::chat::rename_conversation,
            commands::chat::archive_stale_conversations,
            commands::chat::create_message,
            commands::chat::list_messages,
            commands::chat::update_message,
            commands::chat::delete_message,
            commands::config::get_config,
            commands::config::set_config,
            commands::config::list_models,
            commands::config::save_temp_file,
            commands::config::read_text_file,
            commands::config::read_binary_file,
            commands::avatar::get_avatar_conversation,
            commands::avatar::create_avatar_conversation,
            commands::avatar::get_avatar_messages,
            commands::avatar::get_avatar_gestures,
            commands::avatar::create_avatar_gesture,
            commands::avatar::update_avatar_gesture,
            commands::avatar::delete_avatar_gesture,
            commands::avatar::list_ai_roles,
            commands::avatar::create_ai_role,
            commands::avatar::update_ai_role,
            commands::avatar::upload_vrm_avatar,
            commands::avatar::delete_ai_role,
            commands::avatar::update_role_energy,
            commands::avatar::recover_role_energy,
            commands::provider::list_providers,
            commands::provider::create_provider,
            commands::provider::update_provider,
            commands::provider::delete_provider,
            commands::provider::sync_provider_keys,
            commands::provider::verify_provider_api_key,
            commands::project::list_projects,
            commands::project::create_project,
            commands::project::create_empty_project,
            commands::project::update_project,
            commands::project::delete_project,
            commands::project::list_project_members,
            commands::project::add_project_member,
            commands::project::remove_project_member,
            commands::project::update_member_equipment,
            commands::project::export_project,
            commands::project::import_project,
            commands::project::list_project_workflows,
            commands::project::add_project_workflow,
            commands::project::remove_project_workflow,
            commands::project::list_workflow_groups,
            commands::project::create_workflow_group,
            commands::project::update_workflow_group,
            commands::project::delete_workflow_group,
            commands::project::get_workflow_start_role,
            commands::project::assign_task,
            commands::project::get_task_progress,
            commands::project::list_pending_review_tasks,
            commands::project::list_project_artifacts,
            commands::project::get_project_artifact,
            commands::project::create_project_artifact,
            commands::project::update_project_artifact_status,
            commands::project::approve_project_artifact,
            commands::project::reject_project_artifact,
            commands::project::update_project_artifact,
            commands::project::execute_workflow_step,
            commands::project::trigger_workflow_execution,
            commands::project::get_project_role_context,
            commands::project::chat_with_project_role,
            commands::project::chat_with_project_roles,
            commands::project::auto_delegate_chat,
            commands::project::run_workflow_auto_chat,
            commands::project::list_project_messages,
            commands::project::create_project_message,
            commands::project::list_project_tasks,
            commands::project::create_project_task,
            commands::project::update_project_task,
            commands::project::delete_project_task,
            commands::project::claim_project_task,
            commands::project::heartbeat_task_claim,
            commands::project::release_task_claim,
            commands::project::add_task_comment,
            commands::project::list_task_comments,
            commands::project::link_tasks,
            commands::project::unlink_tasks,
            commands::project::list_task_links,
            commands::project::list_task_events,
            commands::project::start_workflow_run,
            commands::project::pause_workflow_run,
            commands::project::resume_workflow_run,
            commands::project::confirm_workflow_step,
            commands::project::list_workflow_runs,
            commands::project::get_workflow_run_status,
            commands::project::create_artifact_version,
            commands::project::list_artifact_versions,
            commands::project::get_artifact_version,
            commands::project::diff_artifact_versions,
            commands::project::bind_role_skill,
            commands::project::unbind_role_skill,
            commands::project::list_role_skills,
            commands::project::bind_member_skill,
            commands::project::unbind_member_skill,
            commands::project::list_member_skills,
            commands::project::list_project_activities,
            commands::project::get_project_stats,
            commands::project::create_project_memory,
            commands::project::list_project_memories,
            commands::project::delete_project_memory,
            commands::project::list_project_file_records,
            commands::project::create_project_file_record,
            commands::project::delete_project_file_record,
            commands::project::scan_project_files,
            commands::project::record_chat_files,
            commands::project::list_project_boards,
            commands::project::create_project_board,
            commands::project::update_project_board,
            commands::project::delete_project_board,
            commands::project::archive_project_task,
            commands::project::update_message_tokens,
            commands::project::preprocess_skill_template,
            commands::project::list_project_templates,
            commands::project::create_project_from_template,
            commands::project::sync_workflow_to_file,
            commands::project::load_workflow_from_file,
            commands::knowledge::list_knowledge_bases,
            commands::knowledge::create_knowledge_base,
            commands::knowledge::update_knowledge_base,
            commands::knowledge::delete_knowledge_base,
            commands::knowledge::list_knowledge_files,
            commands::knowledge::export_knowledge_base,
            commands::knowledge::import_knowledge_base,
            commands::knowledge::preview_knowledge_file,
            commands::knowledge::get_file_chunks,
            commands::knowledge::index_knowledge_base,
            commands::knowledge::search_knowledge_base,
            commands::knowledge::retrieve_knowledge,
            commands::knowledge::get_knowledge_config,
            commands::knowledge::set_knowledge_config,
            commands::knowledge::check_local_embedding_model,
            commands::knowledge::install_local_embedding_model,
            commands::knowledge::install_onnx_model,
            commands::knowledge::test_cloud_embedding,
            commands::knowledge::test_ollama_embedding,
            commands::channel::list_channel_statuses,
            commands::channel::channel_setup_qr,
            commands::channel::channel_setup_token,
            commands::channel::channel_disconnect,
            commands::channel::channel_set_home,
            commands::channel::channel_check_status,
            commands::channel::channel_confirm_qr,
            commands::channel::restart_gateway,
        ])
        .run(tauri::generate_context!())
        .expect("Hermes Desktop failed to start");
}
