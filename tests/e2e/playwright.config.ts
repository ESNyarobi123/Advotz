import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journeys against an already-running local stack that uses the FAKE payment provider
 * and the FAKE Omada controller. Nothing here touches Snippe or Omada hardware.
 * Global setup re-runs the HTTP smoke test, which wipes and reseeds the `*_smoke` database.
 */
export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    timezoneId: "Africa/Dar_es_Salaam",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /portal/ },
    { name: "mobile-portal", use: { ...devices["Pixel 7"] }, testMatch: /portal/ },
  ],
});
