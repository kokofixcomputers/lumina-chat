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

/// Exchange an OAuth auth code for tokens using pure Rust/reqwest.
/// This avoids any webview Origin header that would trigger AADSTS90023.
#[tauri::command]
async fn ms_token_exchange(params: std::collections::HashMap<String, String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://login.microsoftonline.com/common/oauth2/v2.0/token")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
}

/// POST JSON to the Anthropic OAuth token endpoint from Rust to avoid CORS/Origin restrictions.
#[tauri::command]
async fn anthropic_oauth_token(body: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let res = client
        .post("https://console.anthropic.com/v1/oauth/token")
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    res.text().await.map_err(|e| e.to_string())
}

/// Make a native Rust HTTP request to the Anthropic API, bypassing CORS entirely.
#[tauri::command]
async fn anthropic_request(
    method: String,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        _ => return Err(format!("Unsupported method: {method}")),
    };
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    if status >= 400 {
        return Err(format!("HTTP {status}: {text}"));
    }
    Ok(text)
}

/// Stream a POST request to the Anthropic API, emitting SSE chunks as Tauri events.
/// Emits "anthropic-stream-chunk" with each raw SSE line, and "anthropic-stream-done" or "anthropic-stream-error" when finished.
#[tauri::command]
async fn anthropic_stream_request(
    app: tauri::AppHandle,
    url: String,
    headers: std::collections::HashMap<String, String>,
    body: String,
) -> Result<(), String> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let mut req = client.post(&url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let res = req.body(body).send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    if status >= 400 {
        let text = res.text().await.map_err(|e| e.to_string())?;
        return Err(format!("HTTP {status}: {text}"));
    }

    let mut stream = res.bytes_stream();
    let mut buffer = String::new();

    use tauri::Emitter;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Emit complete lines
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();
            if !line.is_empty() {
                let _ = app.emit("anthropic-stream-chunk", line);
            }
        }
    }

    let _ = app.emit("anthropic-stream-done", ());
    Ok(())
}

// Some OAuth providers (e.g. Pollinations) reject custom URI-scheme redirect_uris outright —
// they require https://, or http:// specifically for a loopback host (127.0.0.1/localhost),
// since a custom scheme can be registered by any app on the system. This starts a one-shot
// local HTTP server on a fixed port (17540, falling back to 5317 — both must be registered as
// redirect URIs on the app key), accepts exactly one request (the OAuth redirect), extracts its
// path+query, and emits it back to the frontend as an event — the frontend builds the
// redirect_uri from the returned port, opens the system browser, and awaits the emitted event
// instead of a custom-scheme deep link.
const OAUTH_LOOPBACK_PORTS: [u16; 2] = [17540, 5317];

#[tauri::command]
async fn start_oauth_loopback(app: tauri::AppHandle, event_name: String) -> Result<u16, String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use tauri::Emitter;

    let mut bound: Option<(TcpListener, u16)> = None;
    for port in OAUTH_LOOPBACK_PORTS {
        if let Ok(listener) = TcpListener::bind(("127.0.0.1", port)) {
            bound = Some((listener, port));
            break;
        }
    }
    let (listener, port) = bound.ok_or_else(|| {
        format!(
            "Neither port {} nor {} is available for the OAuth callback server",
            OAUTH_LOOPBACK_PORTS[0], OAUTH_LOOPBACK_PORTS[1]
        )
    })?;

    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buf = [0u8; 8192];
            let n = stream.read(&mut buf).unwrap_or(0);
            let request = String::from_utf8_lossy(&buf[..n]);
            let path_and_query = request
                .lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(1))
                .unwrap_or("")
                .to_string();

            let body = "<html><body style=\"font-family: sans-serif; text-align: center; padding-top: 4rem;\">You can close this window and return to the app.</body></html>";
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            let _ = app.emit(&event_name, path_and_query);
        }
    });

    Ok(port)
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
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            take_screenshot,
            move_mouse,
            click_mouse,
            type_text,
            key_press,
            scroll_mouse,
            check_accessibility,
            open_accessibility_settings,
            ms_token_exchange,
            anthropic_oauth_token,
            anthropic_request,
            anthropic_stream_request,
            start_oauth_loopback,
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
