#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            {
                let sidecar = _app
                    .shell()
                    .sidecar("tauri-backend")?
                    .env("TAURI_BACKEND_BIND", "127.0.0.1:8180");
                let (_rx, _child) = sidecar.spawn()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
