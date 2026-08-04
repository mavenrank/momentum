import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // The Tauri shell points a native window at a fixed dev URL, so the port
  // cannot be allowed to drift when 5173 is busy — a silent fallback to 5174
  // would leave the window staring at nothing. This is the port Vite picks by
  // default anyway; pinning it only removes the fallback.
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Rust build output churns constantly and is nothing to do with the
      // frontend. Watching it wastes a file handle per artefact.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Tauri's CLI prints its own progress; letting Vite wipe the terminal hides it.
  clearScreen: false,
});
