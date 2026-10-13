import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative base so the build works from any static host or sub-path.
  base: "./",
  plugins: [react(), tailwindcss()],
  // The PDF.js worker is large by nature and only loads when a PDF calendar is read.
  build: { chunkSizeWarningLimit: 1500 },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
