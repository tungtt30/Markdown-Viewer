import { defineConfig } from "vite";

export default defineConfig({
  // Tauri expects a fixed port and the app served from root.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
