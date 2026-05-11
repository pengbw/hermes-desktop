use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct FileWatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_dirs: Mutex<HashMap<String, HashSet<PathBuf>>>,
}

impl FileWatcherState {
    pub fn new() -> Self {
        FileWatcherState {
            watcher: Mutex::new(None),
            watched_dirs: Mutex::new(HashMap::new()),
        }
    }
}

pub fn start_watching(
    state: &FileWatcherState,
    app: AppHandle,
    kb_id: &str,
    directories: &[String],
) -> Result<(), String> {
    let mut watched = state.watched_dirs.lock().map_err(|e| format!("获取监控目录锁失败: {}", e))?;

    let dirs_set: HashSet<PathBuf> = directories.iter().map(PathBuf::from).collect();
    watched.insert(kb_id.to_string(), dirs_set.clone());

    let mut watcher_guard = state.watcher.lock().map_err(|e| format!("获取监控器锁失败: {}", e))?;

    if watcher_guard.is_none() {
        let app_clone = app.clone();
        let watched_clone = {
            let watched = state.watched_dirs.lock().map_err(|e| format!("{}", e))?;
            watched.clone()
        };

        let mut watcher = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                match res {
                    Ok(event) => {
                        if matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)) {
                            let changed_paths: Vec<PathBuf> = event.paths;
                            for (kb_id, dirs) in &watched_clone {
                                let relevant = changed_paths.iter().any(|p| {
                                    dirs.iter().any(|d| p.starts_with(d))
                                });
                                if relevant {
                                    log::info!("[file_watcher] 检测到知识库 {} 目录变更: {:?}", kb_id, changed_paths);
                                    let _ = app_clone.emit("kb-file-changed", serde_json::json!({
                                        "kb_id": kb_id,
                                        "paths": changed_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
                                        "kind": format!("{:?}", event.kind),
                                    }));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("[file_watcher] 监控错误: {}", e);
                    }
                }
            },
            Config::default(),
        ).map_err(|e| format!("创建文件监控器失败: {}", e))?;

        for dir in dirs_set.iter() {
            if dir.exists() {
                watcher.watch(dir, RecursiveMode::Recursive)
                    .map_err(|e| format!("监控目录 {:?} 失败: {}", dir, e))?;
            }
        }

        for (_, other_dirs) in watched.iter() {
            for dir in other_dirs.iter() {
                if !dirs_set.contains(dir) && dir.exists() {
                    watcher.watch(dir, RecursiveMode::Recursive)
                        .map_err(|e| format!("监控目录 {:?} 失败: {}", dir, e))?;
                }
            }
        }

        *watcher_guard = Some(watcher);
    } else {
        let watcher = watcher_guard.as_mut().unwrap();
        for dir in dirs_set.iter() {
            if dir.exists() {
                watcher.watch(dir, RecursiveMode::Recursive)
                    .map_err(|e| format!("监控目录 {:?} 失败: {}", dir, e))?;
            }
        }
    }

    Ok(())
}

pub fn stop_watching(
    state: &FileWatcherState,
    kb_id: &str,
) -> Result<(), String> {
    let mut watched = state.watched_dirs.lock().map_err(|e| format!("获取监控目录锁失败: {}", e))?;
    watched.remove(kb_id);

    let mut watcher_guard = state.watcher.lock().map_err(|e| format!("获取监控器锁失败: {}", e))?;

    if let Some(ref mut watcher) = *watcher_guard {
        if watched.is_empty() {
            *watcher_guard = None;
        } else {
            let _ = watcher;
            let mut new_watcher = RecommendedWatcher::new(
                |_res: Result<Event, notify::Error>| {},
                Config::default(),
            ).map_err(|e| format!("创建文件监控器失败: {}", e))?;

            for (_, dirs) in watched.iter() {
                for dir in dirs.iter() {
                    if dir.exists() {
                        new_watcher.watch(dir, RecursiveMode::Recursive)
                            .map_err(|e| format!("监控目录 {:?} 失败: {}", dir, e))?;
                    }
                }
            }
            *watcher_guard = Some(new_watcher);
        }
    }

    Ok(())
}
