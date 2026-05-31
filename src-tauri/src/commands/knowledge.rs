use crate::database::models as db;
use crate::commands::provider::decrypt_api_key;
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter, Manager};

fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let state = app.state::<crate::commands::helpers::AppState>();
    Ok(state.db_pool.clone())
}

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeChunk {
    pub content: String,
    pub file_name: Option<String>,
    pub file_path: Option<String>,
    pub score: Option<f32>,
    pub kb_name: Option<String>,
    pub source_type: String,
}

#[tauri::command]
pub async fn list_knowledge_bases(app: AppHandle) -> Result<Vec<db::KnowledgeBase>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases ORDER BY created_at DESC"
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn create_knowledge_base(app: AppHandle, req: db::CreateKnowledgeBaseRequest) -> Result<db::KnowledgeBase, String> {
    let pool = get_pool(&app)?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let description = req.description.unwrap_or_default();
    let icon = req.icon.unwrap_or_else(|| "📚".to_string());
    let directories = req.directories.unwrap_or_else(|| "[]".to_string());
    let embedding_model = req.embedding_model.unwrap_or_else(|| "local".to_string());
    let retrieval_mode = req.retrieval_mode.unwrap_or_else(|| "off".to_string());
    let max_context_chunks = req.max_context_chunks.unwrap_or(8);
    let auto_retrieve = req.auto_retrieve.unwrap_or(false);

    sqlx::query("INSERT INTO knowledge_bases (id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', 0, 0, ?, ?)")
        .bind(&id)
        .bind(&req.name)
        .bind(&description)
        .bind(&icon)
        .bind(&directories)
        .bind(&embedding_model)
        .bind(&retrieval_mode)
        .bind(max_context_chunks)
        .bind(auto_retrieve as i64)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(db::KnowledgeBase {
        id, name: req.name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status: "ready".to_string(), file_count: 0, chunk_count: 0, created_at: now, updated_at: now,
    })
}

#[tauri::command]
pub async fn update_knowledge_base(app: AppHandle, req: db::UpdateKnowledgeBaseRequest) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let now = chrono::Utc::now().timestamp_millis();

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&req.id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let name = req.name.unwrap_or(kb.name);
    let description = req.description.unwrap_or(kb.description);
    let icon = req.icon.unwrap_or(kb.icon);
    let directories = req.directories.unwrap_or(kb.directories);
    let embedding_model = req.embedding_model.unwrap_or(kb.embedding_model);
    let retrieval_mode = req.retrieval_mode.unwrap_or(kb.retrieval_mode);
    let max_context_chunks = req.max_context_chunks.unwrap_or(kb.max_context_chunks);
    let auto_retrieve = req.auto_retrieve.unwrap_or(kb.auto_retrieve);

    sqlx::query("UPDATE knowledge_bases SET name = ?, description = ?, icon = ?, directories = ?, embedding_model = ?, retrieval_mode = ?, max_context_chunks = ?, auto_retrieve = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(&description)
        .bind(&icon)
        .bind(&directories)
        .bind(&embedding_model)
        .bind(&retrieval_mode)
        .bind(max_context_chunks)
        .bind(auto_retrieve as i64)
        .bind(now)
        .bind(&req.id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_knowledge_base(app: AppHandle, id: String) -> Result<(), String> {
    let pool = get_pool(&app)?;
    sqlx::query("DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM knowledge_files WHERE knowledge_base_id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM knowledge_bases WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_knowledge_files(app: AppHandle, knowledge_base_id: String) -> Result<Vec<db::KnowledgeFile>, String> {
    let pool = get_pool(&app)?;
    let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
        "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ? ORDER BY file_name ASC"
    )
    .bind(&knowledge_base_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
        id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
    }).collect())
}

#[tauri::command]
pub async fn export_knowledge_base(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let files: Vec<db::KnowledgeFile> = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
        "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map(|rows| rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
        id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
    }).collect())
    .map_err(|e| e.to_string())?;

    let chunks: Vec<(String, String, String, i64, Option<Vec<u8>>, i64)> = sqlx::query_as(
        "SELECT id, knowledge_base_id, content, chunk_index, vector, token_count FROM knowledge_chunks WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let chunks_json: Vec<serde_json::Value> = chunks.into_iter().map(|(id, kb_id, content, chunk_index, vector, token_count)| {
        serde_json::json!({
            "id": id,
            "knowledge_base_id": kb_id,
            "content": content,
            "chunk_index": chunk_index,
            "has_vector": vector.is_some(),
            "token_count": token_count,
        })
    }).collect();

    Ok(serde_json::json!({
        "version": "1.0",
        "knowledge_base": {
            "name": kb.name,
            "description": kb.description,
            "icon": kb.icon,
            "directories": kb.directories,
            "embedding_model": kb.embedding_model,
            "retrieval_mode": kb.retrieval_mode,
            "max_context_chunks": kb.max_context_chunks,
            "auto_retrieve": kb.auto_retrieve,
        },
        "files": files.iter().map(|f| serde_json::json!({
            "file_path": f.file_path,
            "file_name": f.file_name,
            "file_ext": f.file_ext,
            "file_size": f.file_size,
            "chunk_count": f.chunk_count,
            "index_status": f.index_status,
        })).collect::<Vec<_>>(),
        "chunks": chunks_json,
        "exported_at": chrono::Utc::now().to_rfc3339(),
    }))
}

#[tauri::command]
pub async fn import_knowledge_base(app: AppHandle, data: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let import_data: serde_json::Value = serde_json::from_str(&data).map_err(|e| format!("解析导入数据失败: {}", e))?;

    let kb_info = &import_data["knowledge_base"];
    let name = kb_info["name"].as_str().unwrap_or("导入的知识库");
    let description = kb_info["description"].as_str().unwrap_or("");
    let icon = kb_info["icon"].as_str().unwrap_or("📚");
    let directories = kb_info["directories"].as_str().unwrap_or("[]");

    let new_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO knowledge_bases (id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&new_id)
        .bind(name)
        .bind(description)
        .bind(icon)
        .bind(directories)
        .bind(kb_info["embedding_model"].as_str().unwrap_or("local"))
        .bind(kb_info["retrieval_mode"].as_str().unwrap_or("auto"))
        .bind(kb_info["max_context_chunks"].as_i64().unwrap_or(8))
        .bind(if kb_info["auto_retrieve"].as_bool().unwrap_or(false) { 1i64 } else { 0i64 })
        .bind("ready")
        .bind(import_data["files"].as_array().map(|a| a.len() as i64).unwrap_or(0))
        .bind(import_data["chunks"].as_array().map(|a| a.len() as i64).unwrap_or(0))
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .map_err(|e| format!("创建知识库失败: {}", e))?;

    Ok(serde_json::json!({
        "id": new_id,
        "name": name,
    }))
}

#[tauri::command]
pub async fn preview_knowledge_file(app: AppHandle, file_id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;
    let row: Option<(String, String, String)> = sqlx::query_as(
        "SELECT file_path, file_name, file_ext FROM knowledge_files WHERE id = ?"
    )
    .bind(&file_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (file_path, file_name, file_ext) = row.ok_or("文件不存在")?;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在于磁盘".to_string());
    }

    let text_exts = ["md", "txt", "json", "csv", "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "c", "cpp", "h", "html", "css", "yaml", "yml", "toml", "xml", "properties", "sh", "bat", "sql", "rb", "php", "swift", "kt", "scala", "lua", "r", "dart", "vue", "svelte"];

    if text_exts.contains(&file_ext.to_lowercase().as_str()) {
        let content = std::fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))?;
        let preview: String = content.chars().take(5000).collect();
        Ok(serde_json::json!({
            "file_name": file_name,
            "file_path": file_path,
            "file_ext": file_ext,
            "type": "text",
            "content": preview,
            "truncated": content.len() > 5000
        }))
    } else {
        Ok(serde_json::json!({
            "file_name": file_name,
            "file_path": file_path,
            "file_ext": file_ext,
            "type": "binary",
            "content": null,
            "truncated": false
        }))
    }
}

#[tauri::command]
pub async fn get_file_chunks(app: AppHandle, file_id: String) -> Result<Vec<serde_json::Value>, String> {
    let pool = get_pool(&app)?;
    let rows: Vec<(String, i64, String)> = sqlx::query_as(
        "SELECT id, chunk_index, content FROM knowledge_chunks WHERE file_id = ? ORDER BY chunk_index ASC"
    )
    .bind(&file_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(|(id, chunk_index, content)| {
        serde_json::json!({
            "id": id,
            "chunk_index": chunk_index,
            "content": content
        })
    }).collect())
}

#[tauri::command]
fn chunk_text(text: &str, max_chars: usize, overlap: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = text.chars().collect();
    let total = chars.len();
    if total <= max_chars {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < total {
        let end = std::cmp::min(start + max_chars, total);
        let slice: String = chars[start..end].iter().collect();
        chunks.push(slice);
        if end >= total {
            break;
        }
        start += max_chars - overlap;
    }
    chunks
}

fn read_file_content(path: &std::path::Path) -> Option<String> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let binary_exts = ["pdf", "docx", "doc", "xlsx", "xls", "pptx", "ppt", "zip", "rar", "7z", "gz", "tar", "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "mp3", "mp4", "avi", "mov", "wav", "exe", "dll", "so", "dylib", "wasm"];
    if binary_exts.contains(&ext.as_str()) {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

async fn embed_text_cloud(base_url: &str, api_key: &str, model: &str, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let url = format!("{}/embeddings", base_url.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "input": texts,
        "encoding_format": "float"
    });
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("嵌入请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("嵌入API返回错误 ({}): {}", status, body));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析嵌入响应失败: {}", e))?;
    let data = json["data"].as_array().ok_or("嵌入响应缺少data字段")?;
    let mut vectors = Vec::new();
    for item in data {
        let embedding = item["embedding"].as_array().ok_or("嵌入响应缺少embedding字段")?;
        let vec: Vec<f32> = embedding.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect();
        vectors.push(vec);
    }
    Ok(vectors)
}

async fn embed_text_ollama(endpoint: &str, model: &str, text: &str) -> Result<Vec<f32>, String> {
    let url = format!("{}/api/embed", endpoint.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "input": text
    });
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("Ollama嵌入请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama嵌入API返回错误 ({}): {}", status, body));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| format!("解析Ollama嵌入响应失败: {}", e))?;

    if let Some(embeddings_arr) = json["embeddings"].as_array() {
        if let Some(first) = embeddings_arr.first() {
            if let Some(vec) = first.as_array() {
                return Ok(vec.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect());
            }
        }
        return Err("Ollama嵌入响应embeddings格式错误".to_string());
    }

    if let Some(embedding) = json["embedding"].as_array() {
        return Ok(embedding.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect());
    }

    Err("Ollama嵌入响应缺少embeddings或embedding字段".to_string())
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

fn vec_to_blob(vec: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vec.len() * 4);
    for &f in vec {
        bytes.extend_from_slice(&f.to_le_bytes());
    }
    bytes
}

fn blob_to_vec(blob: &[u8]) -> Vec<f32> {
    let len = blob.len() / 4;
    let mut vec = Vec::with_capacity(len);
    for i in 0..len {
        let start = i * 4;
        if start + 4 <= blob.len() {
            let bytes: [u8; 4] = [blob[start], blob[start + 1], blob[start + 2], blob[start + 3]];
            vec.push(f32::from_le_bytes(bytes));
        }
    }
    vec
}

#[tauri::command]
pub async fn index_knowledge_base(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE knowledge_bases SET status = 'indexing', updated_at = ? WHERE id = ?")
        .bind(now)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "scanning", "current": 0, "total": 0, "file": ""
    }));

    let dirs: Vec<String> = serde_json::from_str(&kb.directories).unwrap_or_default();
    let mut all_files: Vec<(std::path::PathBuf, String, String, i64, i64)> = Vec::new();

    let supported_exts = ["md", "txt", "pdf", "docx", "json", "csv", "py", "rs", "ts", "tsx", "js", "jsx", "go", "java", "c", "cpp", "h", "html", "css", "yaml", "yml", "toml", "xml", "properties", "sh", "bat", "sql", "rb", "php", "swift", "kt", "scala", "lua", "r", "dart", "vue", "svelte"];

    let skip_dirs = ["node_modules", ".git", ".svn", ".hg", "target", "build", "dist", ".idea", ".vscode", "__pycache__", ".gradle", ".mvn", "vendor", "Pods", ".next", ".nuxt", "out", "bin", "obj"];

    fn scan_dir(path: &std::path::Path, supported: &[&str], skip: &[&str], files: &mut Vec<(std::path::PathBuf, String, String, i64, i64)>, depth: u32) {
        if depth > 20 {
            return;
        }
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let file_path = entry.path();
                if file_path.is_dir() {
                    let dir_name = file_path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if dir_name.starts_with('.') || skip.contains(&dir_name.as_str()) {
                        continue;
                    }
                    let is_symlink = std::fs::symlink_metadata(&file_path).map(|m| m.file_type().is_symlink()).unwrap_or(false);
                    if is_symlink {
                        continue;
                    }
                    scan_dir(&file_path, supported, skip, files, depth + 1);
                } else if file_path.is_file() {
                    let ext = file_path.extension()
                        .map(|e| e.to_string_lossy().to_lowercase())
                        .unwrap_or_default();
                    if !supported.contains(&ext.as_str()) {
                        continue;
                    }
                    let file_name = file_path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let (file_size, modified_at): (i64, i64) = std::fs::metadata(&file_path)
                        .or_else(|_| std::fs::symlink_metadata(&file_path))
                        .map(|m| {
                            (m.len() as i64,
                             m.modified()
                                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64)
                                .unwrap_or(0))
                        })
                        .unwrap_or((0, 0));
                    files.push((file_path, file_name, ext, file_size, modified_at));
                }
            }
        }
    }

    for dir_path in &dirs {
        let path = std::path::Path::new(dir_path);
        if !path.exists() || !path.is_dir() {
            continue;
        }
        scan_dir(path, &supported_exts, &skip_dirs, &mut all_files, 0);
    }

    let total = all_files.len();
    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "indexing", "current": 0, "total": total, "file": ""
    }));

    let kb_config: serde_json::Value = {
        let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        config_val.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or(serde_json::json!({}))
    };
    let embedding_model = kb_config["defaultEmbeddingModel"].as_str().unwrap_or("local").to_string();

    let mut total_files: i64 = 0;
    let mut total_chunks: i64 = 0;

    let mut all_existing: std::collections::HashMap<String, String> = sqlx::query_as::<_, (String, String)>(
        "SELECT file_path, id FROM knowledge_files WHERE knowledge_base_id = ?"
    )
    .bind(&id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .collect();

    let cloud_provider_info: Option<(String, String, String)> = if embedding_model == "cloud" {
        let provider_name = kb_config["cloudProvider"].as_str().unwrap_or("");
        let embed_model = kb_config["cloudEmbeddingModel"].as_str().unwrap_or("text-embedding-3-small").to_string();
        if !provider_name.is_empty() {
            let provider: Option<(String, String)> = sqlx::query_as(
                "SELECT base_url, api_key FROM providers WHERE value = ? AND api_key != '' LIMIT 1"
            )
            .bind(provider_name)
            .fetch_optional(&pool)
            .await
            .map_err(|e| e.to_string())?;
            provider.map(|(base_url, api_key)| (base_url, decrypt_api_key(&api_key), embed_model))
        } else {
            None
        }
    } else {
        None
    };

    let ollama_info: Option<(String, String)> = if embedding_model == "ollama" {
        let endpoint = kb_config["ollamaEndpoint"].as_str().unwrap_or("http://localhost:11434").to_string();
        let ollama_model = kb_config["ollamaModel"].as_str().unwrap_or("nomic-embed-text").to_string();
        Some((endpoint, ollama_model))
    } else {
        None
    };

    let use_local_embedding = embedding_model == "local";

    for (idx, (file_path, file_name, ext, file_size, modified_at)) in all_files.iter().enumerate() {
        let _ = app.emit("kb-index-progress", serde_json::json!({
            "id": &id, "status": "indexing", "current": idx + 1, "total": total, "file": file_name
        }));

        let file_path_str = file_path.to_string_lossy().to_string();

        // 每个文件使用独立事务，避免长时间锁定整个数据库
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        let actual_file_id = if let Some(eid) = all_existing.remove(&file_path_str) {
            sqlx::query("DELETE FROM knowledge_chunks WHERE file_id = ?")
                .bind(&eid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            sqlx::query("UPDATE knowledge_files SET file_name = ?, file_ext = ?, file_size = ?, modified_at = ?, index_status = 'indexed', updated_at = ? WHERE id = ?")
                .bind(file_name)
                .bind(ext)
                .bind(file_size)
                .bind(modified_at)
                .bind(now)
                .bind(&eid)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            eid
        } else {
            let file_id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO knowledge_files (id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'indexed', ?, ?, ?)")
                .bind(&file_id)
                .bind(&id)
                .bind(&file_path_str)
                .bind(file_name)
                .bind(ext)
                .bind(file_size)
                .bind(modified_at)
                .bind(now)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            file_id
        };

        let content = read_file_content(file_path);
        let file_chunk_count = if let Some(text) = content {
            let chunks = chunk_text(&text, 200, 50);
            let chunk_count = chunks.len() as i64;

            if !chunks.is_empty() {
                let _ = app.emit("kb-index-progress", serde_json::json!({
                    "id": &id, "status": "embedding", "current": idx + 1, "total": total, "file": file_name
                }));

                let mut vectors: Vec<Option<Vec<f32>>> = vec![None; chunks.len()];

                if !use_local_embedding {
                    if let Some((ref base_url, ref api_key, ref embed_model)) = cloud_provider_info {
                        let batch_size = 20;
                        let mut batch_futures = Vec::new();
                        let mut batch_ranges = Vec::new();

                        for batch_start in (0..chunks.len()).step_by(batch_size) {
                            let batch_end = std::cmp::min(batch_start + batch_size, chunks.len());
                            let batch: Vec<String> = chunks[batch_start..batch_end].to_vec();
                            batch_ranges.push((batch_start, batch_end));
                            let bu = base_url.clone();
                            let ak = api_key.clone();
                            let em = embed_model.clone();
                            batch_futures.push(async move {
                                embed_text_cloud(&bu, &ak, &em, &batch).await
                            });
                        }

                        let results = futures_util::future::join_all(batch_futures).await;
                        for (i, result) in results.into_iter().enumerate() {
                            let (start, end) = batch_ranges[i];
                            match result {
                                Ok(embeddings) => {
                                    for (j, emb) in embeddings.iter().enumerate() {
                                        if start + j < vectors.len() {
                                            vectors[start + j] = Some(emb.clone());
                                        }
                                    }
                                }
                                Err(e) => {
                                    log::warn!("[kb_index] Cloud batch {} embedding failed: {}", i, e);
                                    for ci in start..end {
                                        match embed_text_cloud(base_url, api_key, embed_model, &[chunks[ci].clone()]).await {
                                            Ok(emb) => { if let Some(v) = emb.first() { vectors[ci] = Some(v.clone()); } }
                                            Err(e2) => { log::warn!("[kb_index] Single embedding also failed for chunk {}: {}", ci, e2); }
                                        }
                                    }
                                }
                            }
                        }
                    } else if let Some((ref endpoint, ref ollama_model)) = ollama_info {
                        let mut embed_futures = Vec::new();
                        for chunk in chunks.iter() {
                            let ep = endpoint.clone();
                            let om = ollama_model.clone();
                            let c = chunk.clone();
                            embed_futures.push(async move {
                                embed_text_ollama(&ep, &om, &c).await
                            });
                        }
                        let results = futures_util::future::join_all(embed_futures).await;
                        for (ci, result) in results.into_iter().enumerate() {
                            match result {
                                Ok(vec) => { vectors[ci] = Some(vec); }
                                Err(e) => { log::warn!("[kb_index] Ollama embedding failed for chunk {}: {}", ci, e); }
                            }
                        }
                    }
                }

                if use_local_embedding {
                    let local_state = app.state::<crate::commands::helpers::AppState>();
                    let batch_size = 32;
                    let total_batches = (chunks.len() + batch_size - 1) / batch_size;
                    log::info!("[kb_index] Local embedding file={}, chunks={}, batches={}", file_name, chunks.len(), total_batches);
                    for batch_start in (0..chunks.len()).step_by(batch_size) {
                        let batch_end = std::cmp::min(batch_start + batch_size, chunks.len());
                        let batch_num = batch_start / batch_size;
                        let _ = app.emit("kb-index-progress", serde_json::json!({
                            "id": &id, "status": "embedding", "current": idx + 1, "total": total,
                            "file": file_name, "chunk": batch_start, "chunkTotal": chunks.len()
                        }));
                        log::info!("[kb_index] Local embedding batch {}/{} (chunks {}-{})", batch_num + 1, total_batches, batch_start, batch_end);
                        let batch: Vec<String> = chunks[batch_start..batch_end].to_vec();
                        match crate::services::local_embedding::embed_text_local(&local_state.local_embedding, &batch) {
                            Ok(embeddings) => {
                                log::info!("[kb_index] Local embedding batch {} done, got {} vectors", batch_num + 1, embeddings.len());
                                for (j, emb) in embeddings.iter().enumerate() {
                                    if batch_start + j < vectors.len() {
                                        vectors[batch_start + j] = Some(emb.clone());
                                    }
                                }
                            }
                            Err(e) => {
                                log::warn!("[kb_index] Local embedding batch {} failed: {}", batch_num + 1, e);
                            }
                        }
                    }
                }

                for (ci, chunk_content) in chunks.iter().enumerate() {
                    let chunk_id = uuid::Uuid::new_v4().to_string();
                    let vector_blob = vectors.get(ci).and_then(|v| v.as_ref()).map(|v| vec_to_blob(v));

                    sqlx::query("INSERT INTO knowledge_chunks (id, knowledge_base_id, file_id, content, chunk_index, vector, token_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                        .bind(&chunk_id)
                        .bind(&id)
                        .bind(&actual_file_id)
                        .bind(chunk_content)
                        .bind(ci as i64)
                        .bind(vector_blob.as_ref())
                        .bind(chunk_content.len() as i64 / 4)
                        .bind(now)
                        .bind(now)
                        .execute(&mut *tx)
                        .await
                        .map_err(|e| e.to_string())?;
                }

                sqlx::query("UPDATE knowledge_files SET chunk_count = ? WHERE id = ?")
                    .bind(chunk_count)
                    .bind(&actual_file_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| e.to_string())?;

                chunk_count
            } else {
                0
            }
        } else {
            0
        };

        total_files += 1;
        total_chunks += file_chunk_count;

        // 每个文件处理完后提交事务，释放数据库锁
        tx.commit().await.map_err(|e| e.to_string())?;
    }

    // 清理已删除的陈旧文件（独立事务）
    if !all_existing.is_empty() {
        let mut cleanup_tx = pool.begin().await.map_err(|e| e.to_string())?;
        for (_, stale_id) in &all_existing {
            let _ = sqlx::query("DELETE FROM knowledge_chunks WHERE file_id = ?")
                .bind(stale_id)
                .execute(&mut *cleanup_tx)
                .await;
            let _ = sqlx::query("DELETE FROM knowledge_files WHERE id = ?")
                .bind(stale_id)
                .execute(&mut *cleanup_tx)
                .await;
        }
        cleanup_tx.commit().await.map_err(|e| e.to_string())?;
    }

    let now2 = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE knowledge_bases SET status = 'ready', file_count = ?, chunk_count = ?, updated_at = ? WHERE id = ?")
        .bind(total_files)
        .bind(total_chunks)
        .bind(now2)
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app.emit("kb-index-progress", serde_json::json!({
        "id": &id, "status": "done", "current": total, "total": total, "file": ""
    }));

    let fw_state = app.state::<crate::commands::helpers::AppState>();
    let dirs_vec: Vec<String> = serde_json::from_str::<Vec<String>>(&kb.directories).unwrap_or_default();
    if let Err(e) = crate::services::file_watcher::start_watching(&fw_state.file_watcher, app.clone(), &id, &dirs_vec) {
        log::warn!("[kb_index] 启动文件监控失败: {}", e);
    }

    Ok(serde_json::json!({
        "fileCount": total_files,
        "chunkCount": total_chunks
    }))
}

#[tauri::command]
pub async fn search_knowledge_base(app: AppHandle, id: String, query: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let _kb: db::KnowledgeBase = sqlx::query_as::<_, (String, String, String, String, String, String, String, i64, i64, String, i64, i64, i64, i64)>(
        "SELECT id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at FROM knowledge_bases WHERE id = ?"
    )
    .bind(&id)
    .fetch_one(&pool)
    .await
    .map(|(id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve, status, file_count, chunk_count, created_at, updated_at)| db::KnowledgeBase {
        id, name, description, icon, directories, embedding_model, retrieval_mode, max_context_chunks, auto_retrieve: auto_retrieve != 0, status, file_count, chunk_count, created_at, updated_at,
    })
    .map_err(|e| e.to_string())?;

    let mut bin = crate::commands::helpers::command(&crate::commands::helpers::hermes_bin());
    let output = bin
        .args(&["workspace", "search", &query])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout).to_string();
            Ok(serde_json::json!({
                "source": "hermes_workspace",
                "results": stdout
            }))
        }
        _ => {
            let limit_val = limit.unwrap_or(20);
            let pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
            let rows = sqlx::query_as::<_, (String, String, String, String, String, i64, i64, String, i64, i64, i64)>(
                "SELECT id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at FROM knowledge_files WHERE knowledge_base_id = ? AND (file_name LIKE ? OR file_path LIKE ?) LIMIT ?"
            )
            .bind(&id)
            .bind(&pattern)
            .bind(&pattern)
            .bind(limit_val)
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

            let files: Vec<db::KnowledgeFile> = rows.into_iter().map(|(id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at)| db::KnowledgeFile {
                id, knowledge_base_id, file_path, file_name, file_ext, file_size, chunk_count, index_status, modified_at, created_at, updated_at,
            }).collect();

            Ok(serde_json::json!({
                "source": "local_fts",
                "results": files
            }))
        }
    }
}

#[tauri::command]
pub async fn retrieve_knowledge_internal(app: &AppHandle, id: &str, query: &str, limit: Option<i64>) -> Result<Vec<KnowledgeChunk>, String> {
    let limit_val = limit.unwrap_or(8);
    let pool = get_pool(app)?;

    let kb_exists: Option<String> = sqlx::query_scalar(
        "SELECT id FROM knowledge_bases WHERE id = ? AND status = 'ready'"
    )
    .bind(id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if kb_exists.is_none() {
        return Ok(Vec::new());
    }

    let kb_config: serde_json::Value = {
        let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
            .fetch_optional(&pool)
            .await
            .unwrap_or(None);
        config_val.and_then(|v| serde_json::from_str(&v).ok()).unwrap_or(serde_json::json!({}))
    };
    let embedding_model = kb_config["defaultEmbeddingModel"].as_str().unwrap_or("local");

    let query_vector: Option<Vec<f32>> = match embedding_model {
        "cloud" => {
            let provider_name = kb_config["cloudProvider"].as_str().unwrap_or("");
            let embed_model = kb_config["cloudEmbeddingModel"].as_str().unwrap_or("text-embedding-3-small");
            if !provider_name.is_empty() {
                let provider: Option<(String, String)> = sqlx::query_as(
                    "SELECT base_url, api_key FROM providers WHERE value = ? AND api_key != '' LIMIT 1"
                )
                .bind(provider_name)
                .fetch_optional(&pool)
                .await
                .map_err(|e| e.to_string())?;

                if let Some((base_url, api_key)) = provider {
                    let api_key = decrypt_api_key(&api_key);
                    match embed_text_cloud(&base_url, &api_key, embed_model, &[query.to_string()]).await {
                        Ok(mut vecs) => vecs.pop(),
                        Err(e) => {
                            log::warn!("[kb_retrieve] Cloud embedding query failed: {}", e);
                            None
                        }
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
        "ollama" => {
            let endpoint = kb_config["ollamaEndpoint"].as_str().unwrap_or("http://localhost:11434");
            let ollama_model = kb_config["ollamaModel"].as_str().unwrap_or("nomic-embed-text");
            match embed_text_ollama(endpoint, ollama_model, query).await {
                Ok(vec) => Some(vec),
                Err(e) => {
                    log::warn!("[kb_retrieve] Ollama embedding query failed: {}", e);
                    None
                }
            }
        }
        "local" => {
            let local_state = app.state::<crate::commands::helpers::AppState>();
            match crate::services::local_embedding::embed_text_local_single(&local_state.local_embedding, query) {
                Ok(vec) => Some(vec),
                Err(e) => {
                    log::warn!("[kb_retrieve] Local embedding query failed: {}", e);
                    None
                }
            }
        }
        _ => None,
    };

    if let Some(qvec) = query_vector {
        let rows: Vec<(String, Vec<u8>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT kc.content, kc.vector, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND kc.vector IS NOT NULL"
        )
        .bind(id)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut scored: Vec<(f32, String, Option<String>, Option<String>)> = rows.into_iter().map(|(content, blob, file_name, file_path)| {
            let vec = blob_to_vec(&blob);
            let score = cosine_similarity(&qvec, &vec);
            (score, content, file_name, file_path)
        }).collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(limit_val as usize);

        let min_score = 0.3;
        let results: Vec<KnowledgeChunk> = scored.into_iter()
            .filter(|(score, _, _, _)| *score > min_score)
            .map(|(score, content, file_name, file_path)| KnowledgeChunk {
                content,
                file_name,
                file_path,
                score: Some(score),
                kb_name: None,
                source_type: "vector".to_string(),
            })
            .collect();

        if !results.is_empty() {
            return Ok(results);
        }
    }

    let keywords: Vec<&str> = query.split(|c: char| !c.is_alphanumeric() && c as u32 > 127)
        .filter(|s| s.len() >= 2)
        .collect();

    if !keywords.is_empty() {
        let conditions: Vec<&str> = keywords.iter().map(|_| "content LIKE ?").collect();
        let where_clause = conditions.join(" OR ");

        let sql = format!(
            "SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND ({}) LIMIT ?",
            where_clause
        );
        let mut sql_query = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(&sql).bind(&id);
        for kw in &keywords {
            sql_query = sql_query.bind(format!("%{}%", kw.replace('%', "\\%").replace('_', "\\_")));
        }
        sql_query = sql_query.bind(limit_val);

        let rows: Vec<(String, Option<String>, Option<String>)> = sql_query
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;

        if !rows.is_empty() {
            return Ok(rows.into_iter().map(|(content, file_name, file_path)| KnowledgeChunk {
                content,
                file_name,
                file_path,
                score: None,
                kb_name: None,
                source_type: "keyword".to_string(),
            }).collect());
        }
    }

    let like_pattern = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
    let rows: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? AND kc.content LIKE ? LIMIT ?"
    )
    .bind(id)
    .bind(&like_pattern)
    .bind(limit_val)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if !rows.is_empty() {
        return Ok(rows.into_iter().map(|(content, file_name, file_path)| KnowledgeChunk {
            content,
            file_name,
            file_path,
            score: None,
            kb_name: None,
            source_type: "like".to_string(),
        }).collect());
    }

    let file_rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT file_name, file_path FROM knowledge_files WHERE knowledge_base_id = ? AND (file_name LIKE ? OR file_path LIKE ?) LIMIT ?"
    )
    .bind(id)
    .bind(&like_pattern)
    .bind(&like_pattern)
    .bind(limit_val)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if !file_rows.is_empty() {
        return Ok(file_rows.iter().map(|(name, path)| KnowledgeChunk {
            content: format!("文件: {} (路径: {})", name, path),
            file_name: Some(name.clone()),
            file_path: Some(path.clone()),
            score: None,
            kb_name: None,
            source_type: "filename".to_string(),
        }).collect());
    }

    let file_list: Vec<(String, i64)> = sqlx::query_as(
        "SELECT file_name, chunk_count FROM knowledge_files WHERE knowledge_base_id = ? LIMIT 20"
    )
    .bind(id)
    .fetch_all(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let chunk_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM knowledge_chunks WHERE knowledge_base_id = ?")
        .bind(id)
        .fetch_one(&pool)
        .await
        .unwrap_or(0);

    if !file_list.is_empty() {
        let mut parts = vec![format!("知识库包含 {} 个文件，共 {} 个文本片段：", file_list.len(), chunk_count)];
        for (name, cc) in &file_list {
            parts.push(format!("- {} ({} 个片段)", name, cc));
        }
        let top_chunks: Vec<(String, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT kc.content, kf.file_name, kf.file_path FROM knowledge_chunks kc LEFT JOIN knowledge_files kf ON kc.file_id = kf.id WHERE kc.knowledge_base_id = ? ORDER BY kc.created_at DESC LIMIT ?"
        )
        .bind(id)
        .bind(limit_val)
        .fetch_all(&pool)
        .await
        .map_err(|e| e.to_string())?;
        if !top_chunks.is_empty() {
            parts.push("\n部分内容预览：".to_string());
            for (content, _, _) in top_chunks {
                let preview: String = content.chars().take(200).collect();
                parts.push(format!("---\n{}", preview));
            }
        }
        return Ok(vec![KnowledgeChunk {
            content: parts.join("\n"),
            file_name: None,
            file_path: None,
            score: None,
            kb_name: None,
            source_type: "overview".to_string(),
        }]);
    }

    Ok(Vec::new())
}

#[tauri::command]
pub async fn retrieve_knowledge(app: AppHandle, id: String, query: String, limit: Option<i64>) -> Result<serde_json::Value, String> {
    let chunks = retrieve_knowledge_internal(&app, &id, &query, limit).await?;
    if chunks.is_empty() {
        Ok(serde_json::json!({
            "source": "local_fts",
            "chunks": [],
            "message": "No relevant content found"
        }))
    } else {
        let source_type = chunks.first().map(|c| c.source_type.as_str()).unwrap_or("unknown");
        Ok(serde_json::json!({
            "source": source_type,
            "chunks": chunks
        }))
    }
}

#[tauri::command]
pub async fn get_knowledge_config(app: AppHandle) -> Result<serde_json::Value, String> {
    let pool = get_pool(&app)?;

    let config_val: Option<String> = sqlx::query_scalar("SELECT value FROM app_config WHERE key = 'knowledge_settings'")
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;

    match config_val {
        Some(v) => Ok(serde_json::from_str(&v).unwrap_or(serde_json::json!({}))),
        None => Ok(serde_json::json!({
            "defaultEmbeddingModel": "local",
            "defaultRetrievalMode": "off",
            "defaultMaxContextChunks": 8,
            "globalAutoRetrieve": false
        })),
    }
}

#[tauri::command]
pub async fn set_knowledge_config(app: AppHandle, config: serde_json::Value) -> Result<(), String> {
    let pool = get_pool(&app)?;
    let config_str = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO app_config (key, value) VALUES ('knowledge_settings', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
        .bind(&config_str)
        .bind(&config_str)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(model) = config.get("defaultEmbeddingModel").and_then(|v| v.as_str()) {
        let _ = crate::commands::helpers::hermes_config_set("knowledgebase.embedding_model", model);
    }
    if let Some(auto) = config.get("globalAutoRetrieve").and_then(|v| v.as_bool()) {
        let _ = crate::commands::helpers::hermes_config_set("knowledgebase.auto_retrieve", &auto.to_string());
    }
    if let Some(chunks) = config.get("defaultMaxContextChunks").and_then(|v| v.as_i64()) {
        let _ = crate::commands::helpers::hermes_config_set("knowledgebase.max_context_chunks", &chunks.to_string());
    }

    let _ = now;
    Ok(())
}

pub(crate) fn is_valid_file(path: &std::path::Path) -> bool {
    path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

#[tauri::command]
pub async fn check_local_embedding_model() -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let onnx_file = data_dir.join("model.onnx");
    let model_file = data_dir.join("model.safetensors");
    let config_file = data_dir.join("config.json");
    let tokenizer_file = data_dir.join("tokenizer.json");

    let has_tokenizer = tokenizer_file.exists();

    if is_valid_file(&onnx_file) && has_tokenizer {
        return Ok("onnx_ready".to_string());
    }

    if model_file.exists() && config_file.exists() && has_tokenizer {
        Ok("ready".to_string())
    } else {
        Ok("missing".to_string())
    }
}

#[tauri::command]
pub async fn install_local_embedding_model(app: AppHandle) -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let _ = std::fs::create_dir_all(&data_dir);

    let model_path = data_dir.join("model.safetensors");
    let config_path = data_dir.join("config.json");
    let tokenizer_path = data_dir.join("tokenizer.json");
    let special_tokens_path = data_dir.join("special_tokens_map.json");

    let mirror_base = "https://hf-mirror.com/sentence-transformers/all-MiniLM-L6-v2/resolve/main";
    let origin_base = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

    let onnx_exists = is_valid_file(&data_dir.join("model.onnx"));

    let file_names = vec!["config.json", "special_tokens_map.json", "tokenizer.json", "model.safetensors"];
    let file_paths: Vec<std::path::PathBuf> = vec![config_path, special_tokens_path, tokenizer_path, model_path];

    let skip_names: Vec<&str> = if onnx_exists { vec!["model.safetensors"] } else { vec![] };

    let total = file_names.len();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    for (i, (name, path)) in file_names.iter().zip(file_paths.iter()).enumerate() {
        if skip_names.contains(name) || path.exists() {
            continue;
        }
        let file_name = name.to_string();
        let _ = app.emit("local-embedding-model-progress", (i as f64 / total as f64 * 100.0) as u8);

        let mirror_url = format!("{}/{}", mirror_base, name);
        let origin_url = format!("{}/{}", origin_base, name);

        let resp = match client.get(&mirror_url).send().await {
            Ok(r) if r.status().is_success() => {
                log::info!("[embedding] Downloading {} from mirror", file_name);
                r
            }
            Ok(r) => {
                log::warn!("[embedding] Mirror returned status {}, trying origin for {}", r.status(), file_name);
                drop(r);
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed: {}", file_name, e))?
            }
            Err(e) => {
                log::warn!("[embedding] Mirror failed for {}: {}, trying origin", file_name, e);
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed (mirror & origin): {}", file_name, e))?
            }
        };

        if !resp.status().is_success() {
            return Err(format!("Download {} failed with status: {}", file_name, resp.status()));
        }

        let total_size: u64 = resp.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
        let mut stream = resp.bytes_stream();
        use futures_util::StreamExt;
        use tokio::io::AsyncWriteExt;

        let mut file = tokio::fs::File::create(&path).await.map_err(|e| format!("Failed to create {}: {}", file_name, e))?;

        let base_pct = i as f64 / total as f64 * 100.0;
        let file_pct = 100.0 / total as f64;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download {} stream error: {}", file_name, e))?;
            file.write_all(&chunk).await.map_err(|e| format!("Write {} error: {}", file_name, e))?;
            downloaded += chunk.len() as u64;
            if total_size > 0 {
                let pct = (base_pct + (downloaded as f64 / total_size as f64) * file_pct) as u8;
                let _ = app.emit("local-embedding-model-progress", pct);
            }
        }
        file.flush().await.map_err(|e| format!("Flush {} error: {}", file_name, e))?;
    }

    let _ = app.emit("local-embedding-model-progress", 100u8);
    let _ = app.emit("local-embedding-model-installed", ());
    if onnx_exists {
        return Ok("onnx_ready".to_string());
    }
    Ok("ready".to_string())
}

#[tauri::command]
pub async fn install_onnx_model(app: AppHandle) -> Result<String, String> {
    let data_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("models")
        .join("all-MiniLM-L6-v2");

    let _ = std::fs::create_dir_all(&data_dir);

    let tokenizer_path = data_dir.join("tokenizer.json");
    let config_path = data_dir.join("config.json");
    let special_tokens_path = data_dir.join("special_tokens_map.json");

    let mirror_base = "https://hf-mirror.com/sentence-transformers/all-MiniLM-L6-v2/resolve/main";
    let origin_base = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

    let small_files = vec![
        ("tokenizer.json", &tokenizer_path),
        ("config.json", &config_path),
        ("special_tokens_map.json", &special_tokens_path),
    ];

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    for (name, path) in &small_files {
        if path.exists() {
            continue;
        }
        let mirror_url = format!("{}/{}", mirror_base, name);
        let origin_url = format!("{}/{}", origin_base, name);

        let resp = match client.get(&mirror_url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                drop(r);
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed: {}", name, e))?
            }
            Err(_) => {
                client.get(&origin_url).send().await
                    .map_err(|e| format!("Download {} failed: {}", name, e))?
            }
        };

        if !resp.status().is_success() {
            return Err(format!("Download {} failed with status: {}", name, resp.status()));
        }

        let bytes = resp.bytes().await.map_err(|e| format!("Download {} read error: {}", name, e))?;
        std::fs::write(path, &bytes).map_err(|e| format!("Write {} error: {}", name, e))?;
        log::info!("[onnx] Downloaded {}", name);
    }

    let onnx_dest = data_dir.join("model.onnx");
    if is_valid_file(&onnx_dest) {
        log::info!("[onnx] ONNX模型已存在: {}", onnx_dest.display());
        return Ok("already_exists".to_string());
    }
    if onnx_dest.exists() {
        log::warn!("[onnx] ONNX模型文件为空，删除后重新安装");
        let _ = std::fs::remove_file(&onnx_dest);
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;
    let bundled_onnx = resource_dir.join("models/all-MiniLM-L6-v2/model.onnx");

    let tmp_onnx = std::env::temp_dir().join("all-MiniLM-L6-v2-onnx/model.onnx");

    let onnx_src = if bundled_onnx.exists() {
        log::info!("[onnx] 从应用资源目录安装ONNX模型");
        bundled_onnx
    } else if tmp_onnx.exists() {
        log::info!("[onnx] 从临时目录安装ONNX模型");
        tmp_onnx
    } else {
        return Err("ONNX模型文件不存在，请先运行 scripts/export_onnx.py 导出模型".to_string());
    };

    log::info!("[onnx] 复制ONNX模型: {} -> {}", onnx_src.display(), onnx_dest.display());
    std::fs::copy(&onnx_src, &onnx_dest)
        .map_err(|e| format!("复制ONNX模型失败: {}", e))?;

    log::info!("[onnx] ONNX模型安装成功");
    Ok("installed".to_string())
}

#[tauri::command]
pub async fn test_cloud_embedding(app: AppHandle, provider: String, model: String) -> Result<String, String> {
    log::debug!("[test_cloud_embedding] provider={}, model={}", provider, model);
    let pool = get_pool(&app)?;

    let (base_url, api_key): (String, String) = sqlx::query_as::<_, (String, String)>(
        "SELECT base_url, api_key FROM providers WHERE value = ?"
    )
    .bind(&provider)
    .fetch_one(&pool)
    .await
    .map_err(|e| format!("Provider not found: {}", e))?;

    let api_key = decrypt_api_key(&api_key);

    log::debug!("[test_cloud_embedding] base_url={}, api_key_len={}", base_url, api_key.len());

    if base_url.is_empty() {
        return Err("Provider has no API Base URL configured".to_string());
    }
    if api_key.is_empty() {
        return Err("Provider has no API Key configured".to_string());
    }
    if model.is_empty() {
        return Err("No embedding model specified".to_string());
    }

    let embed_url = format!("{}/embeddings", base_url.trim_end_matches('/'));
    log::debug!("[test_cloud_embedding] embed_url={}", embed_url);

    let body = serde_json::json!({
        "model": model,
        "input": "test"
    });

    let response = reqwest::Client::new()
        .post(&embed_url)
        .bearer_auth(&api_key)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if status.as_u16() == 404 {
            return Err("该供应商不支持嵌入模型 API (404)，请选择支持嵌入模型的供应商，如 OpenAI、硅基流动等".to_string());
        }
        if status.as_u16() == 401 {
            return Err("API Key 无效或已过期 (401)，请检查供应商配置".to_string());
        }
        return Err(format!("API error ({}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if result.get("data").is_some() {
        Ok("ok".to_string())
    } else {
        Err("Unexpected response format".to_string())
    }
}

#[tauri::command]
pub async fn test_ollama_embedding(endpoint: String, model: String) -> Result<String, String> {
    if endpoint.is_empty() {
        return Err("Ollama endpoint is empty".to_string());
    }
    if model.is_empty() {
        return Err("Ollama model name is empty".to_string());
    }

    let embed_url = format!("{}/api/embed", endpoint.trim_end_matches('/'));

    let body = serde_json::json!({
        "model": model,
        "input": "test"
    });

    let response = reqwest::Client::new()
        .post(&embed_url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_body = response.text().await.unwrap_or_default();
        if status.as_u16() == 404 {
            return Err(format!("Model '{}' not found in Ollama. Please pull it first: ollama pull {}", model, model));
        }
        return Err(format!("API error ({}): {}", status, error_body));
    }

    let result: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if result.get("embeddings").is_some() {
        Ok("ok".to_string())
    } else {
        Err("Unexpected response format from Ollama".to_string())
    }
}



