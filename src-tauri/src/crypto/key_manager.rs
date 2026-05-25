use std::sync::Mutex;
use rand::RngCore;

static KEY_STORE: Mutex<Option<[u8; 32]>> = Mutex::new(None);

const KEY_FILE_NAME: &str = "master.key";

fn default_storage_dir() -> std::path::PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("hermes-desktop")
        .join("keys")
}

fn key_file_path(custom_dir: Option<&str>) -> std::path::PathBuf {
    if let Some(dir) = custom_dir {
        let base = if dir.starts_with("~/") || dir.starts_with("~\\") {
            dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from(".")).join(&dir[2..])
        } else {
            std::path::PathBuf::from(dir)
        };
        base.join("keys").join(KEY_FILE_NAME)
    } else {
        default_storage_dir().join(KEY_FILE_NAME)
    }
}

pub fn generate_random_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    key
}

pub fn derive_key_from_password(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    use argon2::{Algorithm, Argon2, Params, Version};

    let params = Params::new(65536, 3, 4, Some(32))
        .map_err(|e| format!("Argon2 params error: {}", e))?;

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Key derivation failed: {}", e))?;

    Ok(key)
}

pub fn init_or_load_key(custom_dir: Option<&str>) -> Result<[u8; 32], String> {
    {
        let store = KEY_STORE.lock().map_err(|e| e.to_string())?;
        if let Some(key) = *store {
            return Ok(key);
        }
    }

    let path = key_file_path(custom_dir);
    let dir = path.parent().ok_or("Invalid key file path")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create key dir: {}", e))?;

    let key = if path.exists() {
        let data = std::fs::read(&path).map_err(|e| format!("Failed to read key file: {}", e))?;
        if data.len() != 32 {
            return Err("Key file corrupted: invalid length".to_string());
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&data);
        key
    } else {
        let key = generate_random_key();
        std::fs::write(&path, &key).map_err(|e| format!("Failed to write key file: {}", e))?;
        key
    };

    {
        let mut store = KEY_STORE.lock().map_err(|e| e.to_string())?;
        *store = Some(key);
    }

    Ok(key)
}

pub fn init_key_from_password(password: &str, custom_dir: Option<&str>) -> Result<[u8; 32], String> {
    let path = key_file_path(custom_dir);
    let dir = path.parent().ok_or("Invalid key file path")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create key dir: {}", e))?;

    let salt_path = path.with_extension("salt");

    let key = if salt_path.exists() && path.exists() {
        let salt = std::fs::read(&salt_path).map_err(|e| format!("Failed to read salt: {}", e))?;
        derive_key_from_password(password, &salt)?
    } else {
        let mut salt = [0u8; 16];
        rand::rngs::OsRng.fill_bytes(&mut salt);
        let key = derive_key_from_password(password, &salt)?;
        std::fs::write(&salt_path, &salt).map_err(|e| format!("Failed to write salt: {}", e))?;
        std::fs::write(&path, &key).map_err(|e| format!("Failed to write key file: {}", e))?;
        key
    };

    {
        let mut store = KEY_STORE.lock().map_err(|e| e.to_string())?;
        *store = Some(key);
    }

    Ok(key)
}

pub fn get_cached_key() -> Option<[u8; 32]> {
    KEY_STORE.lock().ok().and_then(|store| *store)
}

pub fn clear_cached_key() {
    if let Ok(mut store) = KEY_STORE.lock() {
        *store = None;
    }
}

pub fn migrate_key_to_new_dir(old_dir: Option<&str>, new_dir: Option<&str>) -> Result<(), String> {
    let old_path = key_file_path(old_dir);
    let new_path = key_file_path(new_dir);

    if !old_path.exists() || new_path.exists() {
        return Ok(());
    }

    if let Some(parent) = new_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create key dir: {}", e))?;
    }

    std::fs::copy(&old_path, &new_path).map_err(|e| format!("Copy key failed: {}", e))?;

    let old_salt = old_path.with_extension("salt");
    let new_salt = new_path.with_extension("salt");
    if old_salt.exists() && !new_salt.exists() {
        std::fs::copy(&old_salt, &new_salt).map_err(|e| format!("Copy salt failed: {}", e))?;
    }

    Ok(())
}
