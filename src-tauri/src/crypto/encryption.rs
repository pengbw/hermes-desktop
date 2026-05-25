use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

const NONCE_SIZE: usize = 12;
const ENCRYPTED_PREFIX: &str = "enc:v1:";

pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid key: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_SIZE];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut result = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

pub fn decrypt(encrypted: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if encrypted.len() < NONCE_SIZE {
        return Err("Encrypted data too short".to_string());
    }

    let (nonce_bytes, ciphertext) = encrypted.split_at(NONCE_SIZE);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Invalid key: {}", e))?;

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))
}

pub fn encrypt_string(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let encrypted = encrypt(plaintext.as_bytes(), key)?;
    Ok(format!("{}{}", ENCRYPTED_PREFIX, base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &encrypted)))
}

pub fn decrypt_string(encrypted_str: &str, key: &[u8; 32]) -> Result<String, String> {
    if !encrypted_str.starts_with(ENCRYPTED_PREFIX) {
        return Ok(encrypted_str.to_string());
    }
    let b64_data = &encrypted_str[ENCRYPTED_PREFIX.len()..];
    let encrypted = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_data)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    let decrypted = decrypt(&encrypted, key)?;
    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(ENCRYPTED_PREFIX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = b"Hello, encrypted world!";
        let encrypted = encrypt(plaintext, &key).unwrap();
        let decrypted = decrypt(&encrypted, &key).unwrap();
        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn test_different_nonce_per_encryption() {
        let key = [42u8; 32];
        let plaintext = b"same data";
        let enc1 = encrypt(plaintext, &key).unwrap();
        let enc2 = encrypt(plaintext, &key).unwrap();
        assert_ne!(enc1, enc2);
        assert_eq!(decrypt(&enc1, &key).unwrap(), plaintext.to_vec());
        assert_eq!(decrypt(&enc2, &key).unwrap(), plaintext.to_vec());
    }

    #[test]
    fn test_decrypt_tampered_data_fails() {
        let key = [42u8; 32];
        let encrypted = encrypt(b"secret", &key).unwrap();
        let mut tampered = encrypted.clone();
        tampered[NONCE_SIZE + 5] ^= 0xFF;
        assert!(decrypt(&tampered, &key).is_err());
    }

    #[test]
    fn test_decrypt_wrong_key_fails() {
        let key1 = [1u8; 32];
        let key2 = [2u8; 32];
        let encrypted = encrypt(b"secret", &key1).unwrap();
        assert!(decrypt(&encrypted, &key2).is_err());
    }

    #[test]
    fn test_decrypt_too_short_fails() {
        let key = [42u8; 32];
        assert!(decrypt(&[1u8, 2, 3], &key).is_err());
    }
}
