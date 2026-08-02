import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "4322";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const localAppData = process.env.LOCALAPPDATA ?? "";
const executableCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  path.join(localAppData, "ms-playwright", "chromium-1223", "chrome-win64", "chrome.exe"),
  path.join(localAppData, "ms-playwright", "chromium-1200", "chrome-win64", "chrome.exe")
].filter((candidate): candidate is string => Boolean(candidate));
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: executablePath
      ? {
          executablePath
        }
      : undefined
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000
      }
});
