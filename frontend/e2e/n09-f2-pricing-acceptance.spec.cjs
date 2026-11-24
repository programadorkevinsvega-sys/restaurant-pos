const path = require("node:path")
const { createRequire } = require("node:module")

const requirePlaywright = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, "package.json"))
const { test, expect } = requirePlaywright("@playwright/test")
const { captureVisualEvidence } = require("./support/session.cjs")

const branchId = process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444"
const productName = "Producto E2E"
const suffix = "E2E " + Date.now()

function waitForMutation(page, endpoint, method, status) {
  return page.waitForResponse(async (response) =>
    response.url().endsWith(endpoint) &&
    response.request().method() === method &&
    response.status() === status,
  )
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByLabel("Sucursal activa")).toHaveValue(branchId)
  await page.getByRole("button", { name: "Precios e impuestos", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Precios, impuestos y promociones" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Crear lista de precios" })).toBeVisible()
})

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await captureVisualEvidence(page, testInfo)
})

test("N09-F2.3 administra listas, asignaciones, precios, impuestos y promociones desde la interfaz real", async ({ page }) => {
  const listForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear lista", exact: true }) })
  await listForm.getByLabel("Nombre").fill("Lista " + suffix)
  await listForm.getByLabel("Moneda").fill("COP")
  await listForm.getByLabel("Ámbito").selectOption("branch")
  const listResponse = waitForMutation(page, "/api/admin/pricing/price-lists", "POST", 201)
  await listForm.getByRole("button", { name: "Crear lista", exact: true }).click()
  const createdList = await (await listResponse).json()
  expect(createdList.id).toBeTruthy()

  const assignmentForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Asignar", exact: true }) })
  await expect(assignmentForm.getByLabel("Lista").locator('option[value="' + createdList.id + '"]')).toBeAttached()
  await assignmentForm.getByLabel("Lista").selectOption(createdList.id)
  await assignmentForm.getByLabel("Sucursal").selectOption(branchId)
  const entitySelect = assignmentForm.getByLabel("Entidad legal")
  await expect(entitySelect.locator("option")).not.toHaveCount(0)
  const entityId = await entitySelect.locator("option").nth(0).getAttribute("value")
  expect(entityId).toBeTruthy()
  await entitySelect.selectOption(entityId)
  const assignmentResponse = waitForMutation(page, "/api/admin/pricing/price-list-assignments", "PUT", 200)
  await assignmentForm.getByRole("button", { name: "Asignar", exact: true }).click()
  await assignmentResponse

  const priceForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar precio", exact: true }) })
  await priceForm.getByLabel("Lista").selectOption(createdList.id)
  await priceForm.getByLabel("Producto").selectOption({ label: productName })
  await priceForm.getByLabel("Precio").fill("12500")
  const priceResponse = waitForMutation(page, "/api/admin/pricing/product-prices", "PUT", 200)
  await priceForm.getByRole("button", { name: "Guardar precio", exact: true }).click()
  await priceResponse

  const taxForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear impuesto", exact: true }) })
  await taxForm.getByLabel("Entidad legal").selectOption(entityId)
  await taxForm.getByLabel("Código").fill("IVA-" + Date.now())
  await taxForm.getByLabel("Tipo").fill("VAT")
  await taxForm.getByLabel("Nombre").fill("Impuesto " + suffix)
  await taxForm.getByLabel(/Tasa decimal/).fill("0.19")
  const taxResponse = waitForMutation(page, "/api/admin/pricing/tax-rules", "POST", 201)
  await taxForm.getByRole("button", { name: "Crear impuesto", exact: true }).click()
  const taxRule = await (await taxResponse).json()
  expect(taxRule.id).toBeTruthy()

  const profileForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Guardar perfil fiscal", exact: true }) })
  await profileForm.getByLabel("Producto").selectOption({ label: productName })
  await profileForm.getByLabel("Entidad legal").selectOption(entityId)
  await profileForm.getByLabel("Precio").selectOption("exclusive")
  await profileForm.getByLabel(new RegExp("Impuesto " + suffix)).check()
  const profileResponse = waitForMutation(page, "/api/admin/pricing/product-tax-profiles", "PUT", 200)
  await profileForm.getByRole("button", { name: "Guardar perfil fiscal", exact: true }).click()
  await profileResponse

  const promotionForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear promoción", exact: true }) })
  await promotionForm.getByLabel("Nombre").fill("Promoción " + suffix)
  await promotionForm.getByLabel("Ámbito de la promoción").selectOption("corporate")
  await promotionForm.getByLabel("Tipo").selectOption("percentage")
  await promotionForm.getByLabel("Valor del descuento").fill("5")
  await promotionForm.getByLabel("E2E-BOG · Chili E2E Centro").check()
  await promotionForm.getByLabel("Producto objetivo (opcional si eliges categorías)").selectOption({ label: productName })
  await promotionForm.getByLabel("E2E Bebidas").check()
  const from = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
  const until = new Date(Date.now() + 172_800_000).toISOString().slice(0, 16)
  await promotionForm.getByLabel("Desde").fill(from)
  await promotionForm.getByLabel("Hasta").fill(until)
  const promotionResponse = waitForMutation(page, "/api/admin/pricing/promotions", "POST", 201)
  await promotionForm.getByRole("button", { name: "Crear promoción", exact: true }).click()
  const response = await promotionResponse
  const promotion = await response.json()
  expect(promotion.id).toBeTruthy()
  const promotionPayload = response.request().postDataJSON()
  expect(promotionPayload.scope).toBe("corporate")
  expect(promotionPayload.branch_ids).toEqual([branchId])
  expect(promotionPayload.product_ids).toHaveLength(1)
  expect(promotionPayload.category_ids).toHaveLength(1)

  await expect(page.getByRole("status")).toContainText("Promoción corporativa dirigida a 1 sucursal(es)")
  await expect(page.getByText(/1 listas|2 listas|3 listas/)).toBeVisible()
})
