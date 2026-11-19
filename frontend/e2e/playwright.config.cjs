const path = require("node:path")
const { createRequire } = require("node:module")

const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES
if (!nodeModules) {
  throw new Error("PLAYWRIGHT_NODE_MODULES debe señalar la instalación efímera de @playwright/test.")
}
const requirePlaywright = createRequire(path.join(nodeModules, "package.json"))
const { defineConfig, devices } = requirePlaywright("@playwright/test")
const desktop = devices["Desktop Chrome"]

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: "**/*.spec.cjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(__dirname, "playwright-report"), open: "never" }],
  ],
  outputDir: path.join(__dirname, "test-results"),
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...desktop },
    },
    {
      name: "mobile-chromium",
      use: {
        ...desktop,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
})
