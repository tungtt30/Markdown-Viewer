// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;

/// Path to the workspace root (the `mdTool` dir containing `src/cli.ts`).
/// The crate lives at `tauri-app/src-tauri/`, and the build binary at
/// `tauri-app/src-tauri/target/debug/`. We walk up past the build dirs to
/// `src-tauri`, then up through `tauri-app` to reach the workspace root that
/// holds `src/cli.ts`.
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

/// Locate the Node interpreter and the mdTool CLI entry, relative to the built
/// app. In dev the CLI is `src/cli.ts` at the workspace root; for a bundled
/// release set `MDTOOL_CLI` to the shipped compiled entry (e.g. `dist/cli.js`).
fn core_cli() -> (String, Vec<String>) {
    let node = std::env::var("NODE_BIN").unwrap_or_else(|_| "node".to_string());
    let cli = std::env::var("MDTOOL_CLI")
        .unwrap_or_else(|_| "src/cli.ts".to_string());
    // Resolve relative CLI paths against the workspace root so they don't
    // depend on the process's current directory (Tauri runs from `src-tauri`).
    let cli_path = if cli.starts_with('/') {
        cli
    } else {
        workspace_root().join(&cli).to_string_lossy().into_owned()
    };
    (node, vec!["--import".into(), "tsx".into(), cli_path])
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
