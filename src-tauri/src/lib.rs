#[tauri::command]
fn take_screenshot() -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    use screenshots::Screen;

    let screens = Screen::all().map_err(|e| e.to_string())?;
    let screen = screens.into_iter().next().ok_or("No screen found")?;
    let image = screen.capture().map_err(|e| e.to_string())?;
    let mut png: Vec<u8> = Vec::new();
    image
        .write_to(
            &mut std::io::Cursor::new(&mut png),
            screenshots::image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&png))
}

#[tauri::command]
fn move_mouse(x: i32, y: i32) -> Result<(), String> {
    use enigo::{Coordinate, Enigo, Mouse, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())
}

#[tauri::command]
fn click_mouse(x: i32, y: i32, button: String, double_click: bool) -> Result<(), String> {
    use enigo::{Button, Coordinate, Direction::Click, Enigo, Mouse, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
    let btn = match button.as_str() {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    enigo.button(btn, Click).map_err(|e| e.to_string())?;
    if double_click {
        enigo.button(btn, Click).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn type_text(text: String) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.text(&text).map_err(|e| e.to_string())
}

fn parse_key(s: &str) -> Result<enigo::Key, String> {
    use enigo::Key;
    match s.trim().to_lowercase().as_str() {
        "return" | "enter" => Ok(Key::Return),
        "escape" | "esc" => Ok(Key::Escape),
        "tab" => Ok(Key::Tab),
        "space" => Ok(Key::Space),
        "backspace" => Ok(Key::Backspace),
        "delete" | "del" => Ok(Key::Delete),
        "up" => Ok(Key::UpArrow),
        "down" => Ok(Key::DownArrow),
        "left" => Ok(Key::LeftArrow),
        "right" => Ok(Key::RightArrow),
        "cmd" | "command" | "meta" | "super" => Ok(Key::Meta),
        "ctrl" | "control" => Ok(Key::Control),
        "alt" | "option" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),
        ch if ch.chars().count() == 1 => Ok(Key::Unicode(ch.chars().next().unwrap())),
        other => Err(format!("Unknown key: {other}")),
    }
}

#[tauri::command]
fn key_press(key: String) -> Result<(), String> {
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Keyboard, Settings,
    };
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    // Support combos like "cmd+space", "ctrl+shift+t", "cmd+c", etc.
    let parts: Vec<&str> = key.split('+').collect();
    if parts.len() == 1 {
        let k = parse_key(parts[0])?;
        enigo.key(k, Click).map_err(|e| e.to_string())?;
    } else {
        // Hold all modifiers, tap the last key, release modifiers in reverse
        let modifiers: Vec<_> = parts[..parts.len() - 1]
            .iter()
            .map(|s| parse_key(s))
            .collect::<Result<Vec<_>, _>>()?;
        let main_key = parse_key(parts[parts.len() - 1])?;

        for &m in &modifiers {
            enigo.key(m, Press).map_err(|e| e.to_string())?;
        }
        enigo.key(main_key, Click).map_err(|e| e.to_string())?;
        for &m in modifiers.iter().rev() {
            enigo.key(m, Release).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn scroll_mouse(x: i32, y: i32, direction: String, amount: i32) -> Result<(), String> {
    use enigo::{Axis, Coordinate, Enigo, Mouse, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| e.to_string())?;
    let (axis, delta) = match direction.as_str() {
        "up" => (Axis::Vertical, -amount),
        "down" => (Axis::Vertical, amount),
        "left" => (Axis::Horizontal, -amount),
        "right" => (Axis::Horizontal, amount),
        _ => (Axis::Vertical, amount),
    };
    enigo.scroll(delta, axis).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        // Try a harmless enigo operation; if accessibility is denied, it will fail
        use enigo::{Enigo, Settings};
        Enigo::new(&Settings::default()).is_ok()
    }
    #[cfg(not(target_os = "macos"))]
    { true }
}

#[tauri::command]
fn open_accessibility_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            take_screenshot,
            move_mouse,
            click_mouse,
            type_text,
            key_press,
            scroll_mouse,
            check_accessibility,
            open_accessibility_settings,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
