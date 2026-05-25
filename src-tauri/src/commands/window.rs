use tauri::{AppHandle, Manager};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::HWND;

#[tauri::command]
pub fn set_titlebar_theme(app: AppHandle, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let label = "main";
        let win = app.get_webview_window(label)
            .ok_or_else(|| format!("Window '{}' not found", label))?;

        let hwnd_value = win.hwnd()
            .map_err(|e| format!("Failed to get hwnd: {}", e))?;

        let hwnd = hwnd_value.0 as HWND;

        let value: i32 = if dark { 1 } else { 0 };
        let result = unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
                &value as *const i32 as *const _,
                std::mem::size_of::<i32>() as u32,
            )
        };

        if result != 0 {
            log::warn!("DwmSetWindowAttribute(DWMWA_USE_IMMERSIVE_DARK_MODE) failed: {}", result);
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, dark);
        Ok(())
    }
}

#[tauri::command]
pub async fn toggle_avatar_window(app: AppHandle) -> Result<bool, String> {
    let avatar = match app.get_webview_window("avatar") {
        Some(w) => w,
        None => return Err("Avatar window not found".into()),
    };

    let visible = avatar.is_visible().map_err(|e| e.to_string())?;
    if visible {
        avatar.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        avatar.show().map_err(|e| e.to_string())?;
        avatar.set_focus().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn close_chat_window(app: AppHandle) -> Result<(), String> {
    if let Some(chat_win) = app.get_webview_window("chat") {
        chat_win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_avatar_window(app: AppHandle) -> Result<(), String> {
    if let Some(avatar_win) = app.get_webview_window("avatar") {
        avatar_win.hide().map_err(|e| e.to_string())?;
    }
    if let Some(chat_win) = app.get_webview_window("chat") {
        chat_win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn sync_chat_window(app: AppHandle) -> Result<bool, String> {
    let avatar_win = app.get_webview_window("avatar").ok_or("avatar window not found")?;
    let chat_win = match app.get_webview_window("chat") {
        Some(w) => w,
        None => return Ok(false),
    };

    let pos = avatar_win.outer_position().map_err(|e| e.to_string())?;
    let size = avatar_win.outer_size().map_err(|e| e.to_string())?;
    let monitor = avatar_win.primary_monitor().map_err(|e| e.to_string())?;
    let monitor = match monitor {
        Some(m) => m,
        None => return Err("no monitor".into()),
    };

    let sf = monitor.scale_factor();
    let chat_w_phys = (300.0 * sf) as i32;
    let screen_w = monitor.size().width as i32;
    let avatar_right = pos.x as i32 + size.width as i32;
    let space_right = screen_w - avatar_right;
    let space_left = pos.x as i32;

    let chat_x = if space_right >= chat_w_phys {
        avatar_right
    } else if space_left >= chat_w_phys {
        pos.x as i32 - chat_w_phys
    } else if space_right >= space_left {
        avatar_right
    } else {
        pos.x as i32 - chat_w_phys
    };

    chat_win
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
            chat_x,
            pos.y as i32,
        )))
        .map_err(|e| e.to_string())?;

    Ok(true)
}
