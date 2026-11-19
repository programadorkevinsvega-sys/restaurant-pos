const path = require("node:path")
const fs = require("node:fs/promises")
const { createRequire } = require("node:module")

module.exports = async function globalSetup() {
  const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES
  const statePath = process.env.PLAYWRIGHT_STORAGE_STATE
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3002"
  const password = process.env.E2E_PASSWORD

  if (!nodeModules || !statePath || !password) {
    throw new Error("PLAYWRIGHT_NODE_MODULES, PLAYWRIGHT_STORAGE_STATE y E2E_PASSWORD son obligatorios.")
  }

  const requirePlaywright = createRequire(path.join(nodeModules, "package.json"))
  const { chromium, expect } = requirePlaywright("@playwright/test")
  const browser = await chromium.launch()

  try {
    const context = await browser.newContext({ baseURL })
    const page = await context.newPage()
    await page.goto("/")
    await page.getByLabel("Correo electrónico").fill(
      process.env.E2E_EMAIL || "e2e.owner@chili.test",
    )
    await page.getByLabel("Contraseña").fill(password)
    await page.getByRole("button", { name: "Iniciar sesión" }).click()
    await expect(page.getByLabel("Sucursal activa")).toHaveValue(
      process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444",
    )

    await fs.mkdir(path.dirname(statePath), { recursive: true })
    await context.storageState({ path: statePath })
    await context.close()
  } finally {
    await browser.close()
  }
}
