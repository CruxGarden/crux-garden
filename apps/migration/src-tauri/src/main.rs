#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use fs2::FileExt;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        mpsc::{self, Receiver},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

struct Service {
    child: Child,
    input: Option<ChildStdin>,
    output: Receiver<String>,
    sequence: u64,
    _profile_lock: std::fs::File,
}
impl Service {
    fn request(&mut self, command: &str, args: Value) -> Result<Value, String> {
        self.sequence += 1;
        let id = self.sequence;
        let input = self.input.as_mut().ok_or("Local service has stopped")?;
        writeln!(
            input,
            "{}",
            json!({ "id": id, "command": command, "args": args })
        )
        .map_err(|e| e.to_string())?;
        input.flush().map_err(|e| e.to_string())?;
        let reply = self
            .output
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| {
                let _ = self.child.kill();
                "Migrate’s local service did not respond".to_string()
            })?;
        if reply.len() > 2_000_000 {
            return Err("Local service reply exceeded its limit".into());
        }
        let value: Value = serde_json::from_str(&reply)
            .map_err(|_| "Migrate’s local service stopped or returned an invalid response")?;
        if value["id"] != id {
            return Err("Unexpected local service reply".into());
        }
        if let Some(error) = value["error"].as_str() {
            return Err(error.to_string());
        }
        Ok(value["result"].clone())
    }
    fn shutdown(&mut self) {
        self.input.take(); // EOF asks the API to pause its worker and close SQLite.
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(5) {
            if self.child.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for Service {
    fn drop(&mut self) {
        self.shutdown();
    }
}
type Shared = Arc<Mutex<Service>>;
fn show_migration(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
async fn call(service: Shared, command: String, args: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        service
            .lock()
            .map_err(|_| "Local service is unavailable".to_string())?
            .request(&command, args)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn migration_request(
    app: tauri::AppHandle,
    service: tauri::State<'_, Shared>,
    command: String,
    args: Value,
) -> Result<Value, String> {
    if command == "cloudAuthorize" {
        let mut result = call(service.inner().clone(), command, args).await?;
        let url = result
            .get("authorizationUrl")
            .and_then(Value::as_str)
            .ok_or("Missing authorization address")?;
        if !url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?") {
            return Err("Invalid authorization address".into());
        }
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|_| "Could not open authorization browser")?;
        if let Some(object) = result.as_object_mut() {
            object.remove("authorizationUrl");
        }
        return Ok(result);
    }
    if command == "help" {
        let link = call(service.inner().clone(), "guideLink".into(), args).await?;
        let url = link.as_str().ok_or("Invalid guide reference")?;
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string())?;
        return Ok(Value::Null);
    }
    if ![
        "info",
        "list",
        "create",
        "mood",
        "start",
        "pause",
        "inspect",
        "checklist",
        "cloudConnect",
        "cloudStatus",
        "cloudBrowse",
        "cloudCreate",
        "cloudStart",
        "cloudPause",
        "cloudImport",
        "cloudJobs",
        "cloudDisconnect",
        "downloads",
        "downloadCreate",
        "downloadStart",
        "downloadPause",
        "downloadRestart",
        "downloadImport",
    ]
    .contains(&command.as_str())
    {
        return Err("Operation unavailable in Migrate".into());
    }
    call(service.inner().clone(), command, args).await
}
#[tauri::command]
async fn migration_pick(
    app: tauri::AppHandle,
    service: tauri::State<'_, Shared>,
    id: String,
    kind: String,
    context: Option<Value>,
) -> Result<(), String> {
    if kind != "source"
        && kind != "destination"
        && kind != "archive"
        && kind != "downloadDestination"
        && kind != "cloudDestination"
        && kind != "cloudScanDirectory"
    {
        return Err("Invalid folder choice".into());
    }
    let archive = kind == "archive";
    let folder = tauri::async_runtime::spawn_blocking(move || {
        if archive {
            app.dialog()
                .file()
                .add_filter("Export archive", &["zip", "tar", "tgz", "gz"])
                .blocking_pick_file()
        } else {
            app.dialog().file().blocking_pick_folder()
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(folder) = folder {
        let path = folder.into_path().map_err(|e| e.to_string())?;
        call(
            service.inner().clone(),
            if kind == "archive" {
                "source".into()
            } else {
                kind
            },
            json!({ "id": id, "path": path, "connection": context.as_ref().and_then(|v| v.get("connection")).and_then(Value::as_str) }),
        )
        .await?;
    }
    Ok(())
}
#[tauri::command]
async fn migration_reveal(
    app: tauri::AppHandle,
    service: tauri::State<'_, Shared>,
    id: String,
) -> Result<(), String> {
    let folder = call(
        service.inner().clone(),
        "reportPath".into(),
        json!({ "id": id }),
    )
    .await?;
    app.opener()
        .open_path(
            folder.as_str().ok_or("Missing output folder")?,
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let runtime = app.path().resource_dir()?.join("runtime");
            let profile = app.path().app_data_dir()?;
            std::fs::create_dir_all(&profile)?;
            let profile_lock = std::fs::OpenOptions::new()
                .create(true)
                .truncate(false)
                .read(true)
                .write(true)
                .open(profile.join("migration.lock"))?;
            profile_lock
                .try_lock_exclusive()
                .map_err(|_| "Migrate is already open with this profile")?;
            let mut child =
                Command::new(runtime.join(if cfg!(windows) { "node.exe" } else { "node" }))
                    .arg(runtime.join("backend.cjs"))
                    .arg(profile)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::inherit())
                    .spawn()?;
            let input = child.stdin.take().ok_or("Missing service input")?;
            let stdout = child.stdout.take().ok_or("Missing service output")?;
            let (tx, output) = mpsc::channel();
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines() {
                    match line {
                        Ok(line) if line.len() <= 2_000_000 => {
                            if tx.send(line).is_err() {
                                break;
                            }
                        }
                        _ => break,
                    }
                }
            });
            app.manage(Arc::new(Mutex::new(Service {
                child,
                input: Some(input),
                output,
                sequence: 0,
                _profile_lock: profile_lock,
            })));
            let show = MenuItem::with_id(app, "show", "Open Migrate", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Pause work and quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("migration")
                .icon(
                    app.default_window_icon()
                        .ok_or("Missing Migrate icon")?
                        .clone(),
                )
                .tooltip("Crux Garden Migrate — running in the background")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_migration(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Only hide once the tray is available: there must be a way back.
                if window.app_handle().tray_by_id("migration").is_some() && window.hide().is_ok() {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            migration_request,
            migration_pick,
            migration_reveal
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Crux Garden Migrate")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => {
                // Explicit quit must flush the worker and SQLite before process exit.
                if let Some(service) = app.try_state::<Shared>() {
                    if let Ok(mut service) = service.lock() {
                        service.shutdown();
                    }
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_migration(app),
            _ => {}
        });
}
