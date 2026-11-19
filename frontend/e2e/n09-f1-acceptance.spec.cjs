const path = require("node:path")
const { createRequire } = require("node:module")

const requirePlaywright = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, "package.json"))
const { test, expect } = requirePlaywright("@playwright/test")
const { signIn, captureVisualEvidence } = require("./support/session.cjs")

test.beforeEach(async ({ page }) => {
  await signIn(page)
})

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await captureVisualEvidence(page, testInfo)
})

test("N09-F1.1: el perfil corporativo se consulta y presenta en Configuración", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Organización" }).click()

  await expect(page.getByLabel("Nombre corporativo de la organización")).toHaveValue("Chili E2E Group")
  await expect(page.getByLabel("Nombre comercial")).toHaveValue("Chili E2E")
  await expect(page.getByLabel("Correo de contacto")).toHaveValue("owner@chili.test")
})

test("N09-F1.2: las entidades legales y la asociación con sucursales son visibles", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Entidades legales" }).click()

  await expect(page.getByText("Chili E2E S.A.S.")).toBeVisible()
  await expect(page.getByText(/NIT: 900123456-7/)).toBeVisible()
  await page.getByText("Ver datos de contacto y domicilio").click()
  await expect(page.getByText("fiscal@chili.test")).toBeVisible()
})

test("N09-F1.3: una sucursal puede suspenderse y reactivarse desde su ficha", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Sucursales" }).click()

  await expect(page.getByText("Chili E2E Centro")).toBeVisible()
  await page.getByRole("button", { name: "Suspender" }).click()
  await expect(page.getByText(/Estado: Suspendida/)).toBeVisible()
  await page.getByRole("button", { name: "Reactivar" }).click()
  await expect(page.getByText(/Estado: Activa/)).toBeVisible()
})

test("N09-F1.4: la configuración local y el calendario son accesibles en la ficha de sucursal", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Sucursales" }).click()
  await page.getByRole("button", { name: "Configurar" }).click()

  await expect(page.getByLabel("Dirección operativa del local")).toBeVisible()
  await expect(page.getByLabel("Zona horaria IANA")).toBeVisible()
  await expect(page.getByLabel("Moneda (ISO 4217)")).toBeVisible()
  await expect(page.getByText("Excepciones del calendario")).toBeVisible()
})

test("N09-F1.5: el historial organizacional muestra actor, acción y snapshots", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Historial" }).click()

  await expect(page.getByRole("heading", { name: "Historial organizacional" })).toBeVisible()
  await page.getByText("Ver estado anterior y nuevo").first().click()
  await expect(page.getByText("Chili E2E Group")).toBeVisible()
  await expect(page.getByText("e2e.owner@chili.test")).toBeVisible()
})

test("N09-F1.6: las mesas y reservas se consultan desde las pantallas operativas", async ({ page }) => {
  await page.getByRole("button", { name: "Mesas" }).click()
  await expect(page.getByRole("heading", { name: "Gestión de mesas" })).toBeVisible()
  await expect(page.getByText("Mesa E2E-01")).toBeVisible()

  await page.getByRole("button", { name: "Reservaciones" }).click()
  await expect(page.getByRole("heading", { name: "Reservaciones" })).toBeVisible()
  await expect(page.getByText("Consulta de reservaciones")).toBeVisible()

  const futureDate = new Date(Date.now() + 86_400_000)
  const dateValue = [
    futureDate.getFullYear(),
    String(futureDate.getMonth() + 1).padStart(2, "0"),
    String(futureDate.getDate()).padStart(2, "0"),
  ].join("-")

  await page.locator('input[name="customer_name"]').fill("Cliente de aceptación E2E")
  await page.locator('input[name="customer_phone"]').fill("+573001112233")
  await page.locator('input[name="customer_email"]').fill("cliente.e2e@chili.test")
  await page.locator('select[name="table_id"]').selectOption("77777777-7777-4777-8777-777777777777")
  await page.locator('input[name="party_size"]').fill("2")
  await page.locator('input[name="reservation_date"]').fill(`${dateValue}T18:00`)
  await page.locator('textarea[name="notes"]').fill("Prueba automatizada de reserva")
  await page.getByRole("button", { name: "Crear reservación" }).click()

  await expect(page.getByText("Cliente de aceptación E2E · 2 personas")).toBeVisible()
  await expect(page.getByText("cliente.e2e@chili.test")).toBeVisible()
})

test("N09-F1: la navegación presenta las secciones principales sin errores de renderizado", async ({ page }) => {
  for (const label of ["Menú", "Mesas", "Nuevo producto", "Reservaciones", "Entregas", "Contabilidad", "Configuración"]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible()
  }
  await expect(page.getByLabel("Sucursal activa")).toHaveValue(
    process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444",
  )
})
