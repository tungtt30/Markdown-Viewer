// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

/// Path to the workspace root (the `mdTool` dir containing `src/cli.ts`).
/// Used in dev, where the binary lives under `tauri-app/src-tauri/target/{debug,release}`.
/// In a bundled release the binary lives inside the `.app` and has no access to the
/// workspace, so we use `bundled_core_dir()` (computed from the exe path) instead.
fn workspace_root() -> PathBuf {
    let exe = std::env::current_exe().expect("cannot resolve current exe");
    let mut dir = exe.parent().expect("exe has no parent").to_path_buf();
    // Step up past build dirs (`target`/`debug`/`release`).
    while dir
        .file_name()
        .map(|n| n == "target" || n == "debug" || n == "release")
        .unwrap_or(false)
    {
        dir = dir.parent().expect("walked past filesystem root").to_path_buf();
    }
    // Now at `src-tauri`; the workspace root is two levels up
    // (`src-tauri` -> `tauri-app` -> workspace root).
    dir.parent()
        .expect("no tauri-app dir")
        .parent()
        .expect("no workspace root")
        .to_path_buf()
}

/// The render core directory for a bundled release, derived from the binary path.
/// On macOS the binary is at `mdTool.app/Contents/MacOS/mdTool`, so the staged
/// core lives at `mdTool.app/Contents/Resources/mdTool`. On Windows/Linux Tauri
/// places resources at `resources/` next to the binary.
/// Returns `None` when the bundle layout can't be detected (dev builds).
fn bundled_core_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let exe_dir = exe.parent()?;

    #[cfg(target_os = "macos")]
    {
        // exe_dir = .../Contents/MacOS  -> Resources
        let resources = exe_dir.parent()?.join("Resources");
        let core = resources.join("mdTool");
        if core.exists() {
            return Some(core);
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let resources = exe_dir.parent()?.join("resources");
        let core = resources.join("mdTool");
        if core.exists() {
            return Some(core);
        }
    }

    None
}

/// The directory that holds the render core at runtime.
///
/// - **Bundled release**: `bundled_core_dir()` -> `<Resources>/mdTool`, a
///   self-contained core (Node binary at `bin/node`, compiled `dist/`, `node_modules/`).
/// - **Dev**: the workspace root, where `src/cli.ts` and `node_modules/` live.
fn core_root() -> PathBuf {
    bundled_core_dir().unwrap_or_else(workspace_root)
}

/// Locate the Node interpreter and the mdTool CLI entry.
///
/// In a bundled release we use the shipped Node binary (`$CORE/bin/node`) and the
/// compiled entry (`$CORE/dist/src/cli.js`). In dev we fall back to the system
/// `node` running the TypeScript entry through `tsx`.
///
/// Override either via env: `NODE_BIN` (node interpreter) and `MDTOOL_CLI`
/// (CLI entry path). Relative `MDTOOL_CLI` paths are resolved against `core_root()`.
fn core_cli() -> (String, Vec<String>) {
    let root = core_root();
    let bundled_node = if root.join("bin").join("node").exists() {
        root.join("bin").join("node")
    } else if root.join("bin").join("node.exe").exists() {
        root.join("bin").join("node.exe")
    } else {
        root.join("bin").join("node")
    };
    let node = std::env::var("NODE_BIN").unwrap_or_else(|_| {
        if bundled_node.exists() {
            bundled_node.to_string_lossy().into_owned()
        } else {
            "node".to_string()
        }
    });

    let cli = std::env::var("MDTOOL_CLI").unwrap_or_else(|_| {
        if bundled_node.exists() {
            // Bundled release: run the compiled core directly (no tsx needed).
            root.join("dist")
                .join("src")
                .join("cli.js")
                .to_string_lossy()
                .into_owned()
        } else {
            // Dev: run the TypeScript entry through tsx.
            root.join("src").join("cli.ts").to_string_lossy().into_owned()
        }
    });

    let cli_path = if cli.starts_with('/') {
        cli
    } else {
        root.join(&cli).to_string_lossy().into_owned()
    };

    if bundled_node.exists() {
        (node, vec![cli_path])
    } else {
        (node, vec!["--import".into(), "tsx".into(), cli_path])
    }
}

#[tauri::command]
fn render_file(path: String, theme: String) -> Result<String, String> {
    let (node, base) = core_cli();
    let mut args = base.clone();
    args.push(path.clone());
    args.push("--theme".into());
    args.push(theme);
    args.push("--preview".into());

    let output = Command::new(node)
        .args(&args)
        .output()
        .map_err(|e| format!("failed to launch mdTool core: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "render failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn export_pdf(path: String, out: String, theme: String) -> Result<(), String> {
    let (node, base) = core_cli();
    let mut args = base.clone();
    args.push(path.clone());
    args.push("--theme".to_string());
    args.push(theme);
    args.push("--out".to_string());
    args.push(out.clone());

    let output = Command::new(node)
        .args(&args)
        .output()
        .map_err(|e| format!("failed to launch mdTool core: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "export failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![render_file, export_pdf])
        .run(tauri::generate_context!())
        .expect("error while running mdTool tauri application");
}
