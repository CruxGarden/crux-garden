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
use tauri::Manager;
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
                "Migration’s local service did not respond".to_string()
            })?;
        if reply.len() > 2_000_000 {
            return Err("Local service reply exceeded its limit".into());
        }
        let value: Value = serde_json::from_str(&reply)
            .map_err(|_| "Migration’s local service stopped or returned an invalid response")?;
        if value["id"] != id {
            return Err("Unexpected local service reply".into());
        }
        if let Some(error) = value["error"].as_str() {
            return Err(error.to_string());
        }
        Ok(value["result"].clone())
    }
}
impl Drop for Service {
    fn drop(&mut self) {
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
type Shared = Arc<Mutex<Service>>;
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
    ]
    .contains(&command.as_str())
    {
        return Err("Operation unavailable in Migration".into());
    }
    call(service.inner().clone(), command, args).await
}
#[tauri::command]
async fn migration_pick(
    app: tauri::AppHandle,
    service: tauri::State<'_, Shared>,
    id: String,
    kind: String,
) -> Result<(), String> {
    if kind != "source" && kind != "destination" && kind != "archive" {
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
            json!({ "id": id, "path": path }),
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
                .map_err(|_| "Migration is already open with this profile")?;
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            migration_request,
            migration_pick,
            migration_reveal
        ])
        .run(tauri::generate_context!())
        .expect("Could not start Crux Garden Migration");
}
