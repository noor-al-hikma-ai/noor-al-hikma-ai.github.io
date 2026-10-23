import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps every asset path relative, so the same build works on
// https://<org>.github.io/ (org/user site) and https://<user>.github.io/<repo>/ (project site).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          d3: ["d3"],
          codemirror: [
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/language",
            "@codemirror/autocomplete",
            "@codemirror/lint",
            "@codemirror/commands",
            "@codemirror/search",
          ],
        },
      },
    },
  },
});
