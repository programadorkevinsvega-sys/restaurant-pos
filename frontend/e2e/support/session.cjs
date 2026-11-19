const path = require("node:path")
const { createRequire } = require("node:module")

const nodeModules = process.env.PLAYWRIGHT_NODE_MODULES
if (!nodeModules) throw new Error("PLAYWRIGHT_NODE_MODULES no está configurado.")

const requirePlaywright = createRequire(path.join(nodeModules, "package.json"))
const { expect } = requirePlaywright("@playwright/test")

async function captureVisualEvidence(page, testInfo) {
  if (page.isClosed()) return
  const metrics = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    documentHeight: document.documentElement.scrollHeight,
  }))
  await testInfo.attach(`layout-${testInfo.project.name}`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  })
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)

  const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" })
  await testInfo.attach(`aceptacion-visual-${testInfo.project.name}`, {
    body: screenshot,
    contentType: "image/png",
  })
}

module.exports = { captureVisualEvidence }
