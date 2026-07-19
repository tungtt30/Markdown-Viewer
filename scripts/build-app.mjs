// Cross-platform build step that runs before Tauri bundles the app.
// Replaces before-build.sh so the same command works on macOS, Windows, and Linux
// without relying on a bash interpreter in the system PATH.
//
// Steps:
//   1. Build the frontend (vite -> tauri-app/dist).
//   2. Compile the Node core and stage it into bundle-staging/ for embedding.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const FRONTEND = resolve(ROOT, "tauri-app");

function run(cwd, cmd, args) {
  console.log(`▶ ${cmd} ${args.join(" ")}  (cwd: ${cwd})`);
  // Use a shell so `npm` resolves to npm.cmd on Windows; without `shell: true`,
  // execFileSync("npm", ...) fails with ENOENT because npm isn't a real binary there.
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: true });
}

// 1) Frontend bundle.
run(FRONTEND, "npm", ["run", "build"]);

// 2) Compile core + stage into bundle-staging/.
run(ROOT, "npm", ["run", "bundle-core"]);
