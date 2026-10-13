import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:4173",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
