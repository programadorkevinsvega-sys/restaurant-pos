const path = require("node:path")
const { createRequire } = require("node:module")

const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES
if (!nodeModules) throw new Error("PLAYWRIGHT_NODE_MODULES no está configurado.")

const requirePlaywright = createRequire(path.join(nodeModules, "package.json"))
const { expect } = requirePlaywright("@playwright/test")

const credentials = {
  email: process.env.E2E_EMAIL || "e2e.owner@chili.test",
  password: process.env.E2E_PASSWORD,
}

async function signIn(page) {
  if (!credentials.password) throw new Error("E2E_PASSWORD no está configurado.")
  await page.goto("/")
  await page.getByLabel("Correo electrónico").fill(credentials.email)
  await page.getByLabel("Contraseña").fill(credentials.password)
  await page.getByRole("button", { name: "Iniciar sesión" }).click()
  await expect(page.getByLabel("Sucursal activa")).toHaveValue(
    process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444",
  )
}

async function captureVisualEvidence(page, testInfo) {
  const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" })
  await testInfo.attach("aceptacion-visual", {
    body: screenshot,
    contentType: "image/png",
  })
}

module.exports = { signIn, captureVisualEvidence }
