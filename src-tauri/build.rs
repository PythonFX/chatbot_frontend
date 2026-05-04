use std::{env, fs, path::PathBuf};

fn main() {
    ensure_dev_sidecar_placeholder();
    tauri_build::build()
}

fn ensure_dev_sidecar_placeholder() {
    let manifest_dir = match env::var("CARGO_MANIFEST_DIR") {
        Ok(value) => PathBuf::from(value),
        Err(_) => return,
    };
    let target_triple = match env::var("TAURI_ENV_TARGET_TRIPLE").or_else(|_| env::var("TARGET")) {
        Ok(value) => value,
        Err(_) => return,
    };

    let binaries_dir = manifest_dir.join("binaries");
    let placeholder_path = binaries_dir.join(format!("tauri-backend-{target_triple}"));

    if placeholder_path.exists() {
        return;
    }

    let _ = fs::create_dir_all(&binaries_dir);

    let script = "#!/bin/sh\nexit 0\n";
    if fs::write(&placeholder_path, script).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(metadata) = fs::metadata(&placeholder_path) {
                let mut permissions = metadata.permissions();
                permissions.set_mode(0o755);
                let _ = fs::set_permissions(&placeholder_path, permissions);
            }
        }
    }
}
