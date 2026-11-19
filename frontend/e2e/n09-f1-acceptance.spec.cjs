const path = require("node:path")
const { createRequire } = require("node:module")

const requirePlaywright = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, "package.json"))
const { test, expect } = requirePlaywright("@playwright/test")
const { captureVisualEvidence } = require("./support/session.cjs")

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
  await expect(page.getByText("Chili E2E Centro", { exact: true })).toBeVisible()

  const active = page.getByRole("button", { name: "Suspender" })
  const suspended = page.getByRole("button", { name: "Reactivar" })
  if (await suspended.count()) await suspended.click()
  await expect(active).toBeVisible()

  try {
    await active.click()
    await expect(page.getByText(/Estado: Suspendida/)).toBeVisible()
  } finally {
    const reactivate = page.getByRole("button", { name: "Reactivar" })
    if (await reactivate.count()) await reactivate.click()
  }
  await expect(page.getByText(/Estado: Activa/)).toBeVisible()
})

test("N09-F1.4: la configuración local se guarda y el calendario se consulta", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Sucursales" }).click()
  await page.getByRole("button", { name: "Configurar" }).click()

  await page.getByLabel("Dirección operativa del local").fill("Carrera 10 #20-30")
  await page.getByLabel("Ciudad / localidad").fill("Bogotá")
  await page.getByLabel("País (ISO alpha-2)").fill("CO")
  await page.getByLabel("Zona horaria IANA").fill("America/Bogota")
  await page.getByLabel("Moneda (ISO 4217)").fill("COP")
  await page.getByRole("button", { name: "Guardar configuración local" }).click()

  await expect(page.getByText(/America\/Bogota · COP/)).toBeVisible()
  await expect(page.getByText("Excepciones del calendario")).toBeVisible()
  await expect(page.getByText("No hay excepciones registradas en el rango consultado.")).toBeVisible()
})

test("N09-F1.5: el historial organizacional muestra actor y snapshots del perfil", async ({ page }) => {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Historial" }).click()
  await expect(page.getByRole("heading", { name: "Historial organizacional" })).toBeVisible()

  await page.getByLabel("Tipo de recurso").selectOption("organization")
  const snapshot = page.getByText("Ver estado anterior y nuevo").first()
  await expect(snapshot).toBeVisible()
  await snapshot.click()
  await expect(page.getByText("Chili E2E Group")).toBeVisible()
  await expect(page.getByText(/Organización · e2e\.owner@chili\.test/)).toBeVisible()
})

test("N09-F1.6: las mesas y reservas se consultan desde las pantallas operativas", async ({ page }) => {
  await page.getByRole("button", { name: "Mesas" }).click()
  await expect(page.getByRole("heading", { name: "Gestión de mesas" })).toBeVisible()
  await expect(page.getByText("Mesa E2E-01")).toBeVisible()

  await page.getByRole("button", { name: "Reservaciones" }).click()
  await expect(page.getByRole("heading", { name: "Reservaciones" })).toBeVisible()
  await expect(page.getByText("Consulta de reservaciones")).toBeVisible()

  const suffix = String(Date.now())
  const customerName = `Cliente de aceptación E2E ${suffix}`
  const customerEmail = `cliente.${suffix}@chili.test`
  const futureDate = new Date(Date.now() + 86_400_000)
  const dateValue = [
    futureDate.getFullYear(),
    String(futureDate.getMonth() + 1).padStart(2, "0"),
    String(futureDate.getDate()).padStart(2, "0"),
  ].join("-")

  await page.locator('input[name="customer_name"]').fill(customerName)
  await page.locator('input[name="customer_phone"]').fill("+573001112233")
  await page.locator('input[name="customer_email"]').fill(customerEmail)
  await page.locator('select[name="table_id"]').selectOption("77777777-7777-4777-8777-777777777777")
  await page.locator('input[name="party_size"]').fill("2")
  await page.locator('input[name="reservation_date"]').fill(`${dateValue}T18:00`)
  await page.locator('textarea[name="notes"]').fill("Prueba automatizada de reserva")
  await page.getByRole("button", { name: "Crear reservación" }).click()

  await expect(page.getByText(`${customerName} · 2 personas`)).toBeVisible()
  await expect(page.getByText(customerEmail)).toBeVisible()
})

test("N09-F1: la navegación presenta las secciones principales sin errores de renderizado", async ({ page }) => {
  for (const label of ["Menú", "Mesas", "Nuevo producto", "Reservaciones", "Entregas", "Contabilidad", "Configuración"]) {
    await expect(page.getByRole("button", { name: label })).toBeVisible()
  }
  await expect(page.getByLabel("Sucursal activa")).toHaveValue(
    process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444",
  )
})

test("N09-F2.1: el catálogo maestro permite excluir y reactivar un producto por sucursal", async ({ page }, testInfo) => {
  const productLabel = "Disponible en sucursal: Producto E2E"
  const productOrderButton = page.getByRole("button", { name: "Agregar Producto E2E al pedido" })
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Menú" }).click()

  const branchSelect = page.getByLabel("Sucursal del catálogo corporativo")
  await expect(branchSelect).toHaveValue(
    process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444",
  )

  let checkbox = page.getByRole("checkbox", { name: productLabel })
  await expect(checkbox).toBeVisible()
  if (!(await checkbox.isChecked())) await checkbox.check()

  try {
    await checkbox.uncheck()
    await expect(page.getByText("Excluido de esta sucursal")).toBeVisible()
    await page.getByRole("button", { name: "Menú", exact: true }).click()
    await expect(productOrderButton).toHaveCount(0)
    await testInfo.attach("catalogo-excluido-en-la-sucursal", {
      body: await page.screenshot({ fullPage: true, animations: "disabled" }),
      contentType: "image/png",
    })
  } finally {
    await page.getByRole("button", { name: "Configuración" }).click()
    await page.getByRole("tab", { name: "Menú" }).click()
    checkbox = page.getByRole("checkbox", { name: productLabel })
    await expect(checkbox).toBeVisible()
    if (!(await checkbox.isChecked())) await checkbox.check()
    await expect(page.getByText("Heredado y habilitado")).toBeVisible()
  }
  await page.getByRole("button", { name: "Menú", exact: true }).click()
  await expect(productOrderButton).toBeVisible()
  await testInfo.attach("catalogo-reactivado-en-la-sucursal", {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  })
})
