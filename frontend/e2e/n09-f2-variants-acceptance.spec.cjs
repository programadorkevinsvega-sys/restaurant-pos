const path = require("node:path")
const { createRequire } = require("node:module")

const requirePlaywright = createRequire(path.join(process.env.PLAYWRIGHT_NODE_MODULES, "package.json"))
const { test, expect } = requirePlaywright("@playwright/test")
const { captureVisualEvidence } = require("./support/session.cjs")

const productId = "66666666-6666-4666-8666-666666666666"
const branchId = process.env.E2E_BRANCH_ID || "44444444-4444-4444-8444-444444444444"
const presentationName = "Presentación E2E POS"
const modifierName = "Extras E2E POS"
const mediumName = "Mediana E2E POS"
const largeName = "Grande E2E POS"
const cheeseName = "Queso E2E POS"
const baconName = "Tocino E2E POS"

function waitForProductConfiguration(page) {
  return page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/products/" + productId) &&
    response.request().method() === "GET",
  )
}

async function reloadProductConfiguration(page, productSelect) {
  // The panel selects the first product on mount; force a real value change
  // when the E2E fixture is already selected before listening for the response.
  if (await productSelect.inputValue() === productId) {
    await productSelect.selectOption("")
  }
  const responsePromise = waitForProductConfiguration(page)
  await productSelect.selectOption(productId)
  const response = await responsePromise
  expect(response.status()).toBe(200)
  return response.json()
}

async function createGroup(page, kind, name, minimum, maximum) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Crear grupo" }) })
  await form.getByLabel("Tipo").selectOption(kind)
  await form.getByLabel("Nombre del grupo").fill(name)
  if (kind === "modifier") {
    await form.getByLabel("Mínimo de selecciones").fill(String(minimum))
    await form.getByLabel("Máximo de selecciones").fill(String(maximum))
  }
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/products/" + productId + "/groups") &&
    response.request().method() === "POST",
  )
  await form.getByRole("button", { name: "Crear grupo" }).click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  return response.json()
}

async function addOption(page, groupId, name) {
  const card = page.locator("article").filter({ has: page.locator("#option-group-name-" + groupId) })
  await expect(card).toBeVisible()
  await card.getByPlaceholder("Nombre de la opción").fill(name)
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/groups/" + groupId + "/options") &&
    response.request().method() === "POST",
  )
  await card.getByRole("button", { name: "Agregar opción" }).click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  return response.json()
}

async function ensureGroup(page, productSelect, configuration, kind, name, optionNames, minimum, maximum) {
  let group = configuration.groups.find((item) => item.name === name)
  if (!group) {
    group = await createGroup(page, kind, name, minimum, maximum)
  }
  let currentOptions = group.options ?? []
  for (const optionName of optionNames) {
    if (!currentOptions.some((option) => option.name === optionName)) {
      await addOption(page, group.id, optionName)
      currentOptions = [...currentOptions, { name: optionName, is_active: true }]
    }
  }
  configuration = await reloadProductConfiguration(page, productSelect)
  group = configuration.groups.find((item) => item.id === group.id)
  expect(group, "El grupo debe persistir en el catálogo corporativo").toBeTruthy()
  if (!group.is_active) {
    const card = page.locator("article").filter({ has: page.locator("#option-group-name-" + group.id) })
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/admin/product-options/groups/" + group.id) &&
      response.request().method() === "PATCH",
    )
    await card.getByRole("button", { name: "Habilitar", exact: true }).click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    configuration = await reloadProductConfiguration(page, productSelect)
    group = configuration.groups.find((item) => item.id === group.id)
  }
  expect(group.is_active).toBe(true)
  for (const optionName of optionNames) {
    const option = group.options.find((item) => item.name === optionName)
    expect(option?.is_active).toBe(true)
  }
  return { configuration, group }
}

async function ensureBranchActive(page) {
  await page.getByRole("button", { name: "Configuración" }).click()
  await page.getByRole("tab", { name: "Sucursales" }).click()
  const reactivate = page.getByRole("button", { name: "Reactivar" })
  if (await reactivate.count()) await reactivate.click()
  await expect(page.getByText(/Estado: Activa/)).toBeVisible()
}

async function ensureProductEnabledForBranch(page) {
  await page.getByRole("button", { name: "Catálogo", exact: true }).click()
  await page.getByRole("button", { name: "Surtido por sucursal", exact: true }).click()
  const checkbox = page.getByRole("checkbox", { name: "Disponible en sucursal: Producto E2E" })
  await expect(checkbox).toBeVisible()
  if (!(await checkbox.isChecked())) {
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/admin/catalog/branches/" + branchId + "/products/" + productId) &&
      response.request().method() === "PUT",
    )
    await checkbox.check()
    const response = await responsePromise
    expect(response.status()).toBe(200)
  }
  await expect(checkbox).toBeChecked()
}

async function setOptionInherited(page, optionName, reason) {
  const row = page.getByText(optionName, { exact: true }).locator("xpath=../..")
  if (await row.count()) {
    const inherit = row.getByRole("button", { name: "Heredar", exact: true })
    if (await inherit.isEnabled()) {
      await row.getByPlaceholder("Motivo obligatorio").fill(reason)
      const responsePromise = page.waitForResponse((response) =>
        response.url().includes("/api/admin/product-options/branches/" + branchId + "/options/") &&
        response.request().method() === "DELETE",
      )
      await inherit.click()
      const response = await responsePromise
      expect(response.status()).toBe(200)
      await expect(row.getByText("Heredado", { exact: true })).toBeVisible()
      return
    }
  }
  return null
}

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByLabel("Sucursal activa")).toHaveValue(branchId)
})

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed()) await captureVisualEvidence(page, testInfo)
})

test("N09-F2.2 incremento 2: configurar variantes, restringir por sucursal y conservar snapshot en el pedido", async ({ page }) => {
  await ensureBranchActive(page)
  await ensureProductEnabledForBranch(page)
  await page.getByRole("button", { name: "Variantes", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Variantes y modificadores" })).toBeVisible()
  const productSelect = page.getByLabel("Producto del catálogo maestro")
  await expect(productSelect.locator('option[value="' + productId + '"]')).toBeAttached()
  let configuration = await reloadProductConfiguration(page, productSelect)

  const presentation = await ensureGroup(
    page, productSelect, configuration, "presentation", presentationName, [mediumName, largeName], 1, 1,
  )
  configuration = presentation.configuration
  const modifiers = await ensureGroup(
    page, productSelect, configuration, "modifier", modifierName, [cheeseName, baconName], 0, 2,
  )
  const presentationOption = presentation.group.options.find((item) => item.name === mediumName)
  const cheeseOption = modifiers.group.options.find((item) => item.name === cheeseName)
  const baconOption = modifiers.group.options.find((item) => item.name === baconName)
  expect(presentationOption?.id).toBeTruthy()
  expect(cheeseOption?.id).toBeTruthy()
  expect(baconOption?.id).toBeTruthy()

  const branchResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/branches/" + branchId + "/options") &&
    response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "Excepciones por sucursal", exact: true }).click()
  const branchResponse = await branchResponsePromise
  expect(branchResponse.status()).toBe(200)

  await setOptionInherited(page, baconName, "Limpiar estado previo de aceptación automatizada")
  const baconRow = page.getByText(baconName, { exact: true }).locator("xpath=../..")
  await baconRow.getByPlaceholder("Motivo obligatorio").fill("Opción no ofrecida en la sucursal de aceptación")
  const restrictResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/branches/" + branchId + "/options/" + baconOption.id) &&
    response.request().method() === "PUT",
  )
  await baconRow.getByRole("button", { name: "Restringir", exact: true }).click()
  const restrictResponse = await restrictResponsePromise
  expect(restrictResponse.status()).toBe(200)
  await expect(page.getByText("Restringido localmente", { exact: true })).toBeVisible()

  await page.getByRole("button", { name: "Punto de venta", exact: true }).click()
  const addProduct = page.getByRole("button", { name: "Agregar Producto E2E al pedido", exact: true })
  await expect(addProduct).toBeVisible()
  const posOptionsResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/products/" + productId + "/options") &&
    response.request().method() === "GET",
  )
  await addProduct.click()
  const posOptionsResponse = await posOptionsResponsePromise
  expect(posOptionsResponse.status()).toBe(200)
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel(presentationName + ": " + mediumName)).toBeVisible()
  await expect(dialog.getByLabel(modifierName + ": " + cheeseName)).toBeVisible()
  await expect(dialog.getByLabel(modifierName + ": " + baconName)).toHaveCount(0)
  await dialog.getByLabel(presentationName + ": " + mediumName).check()
  await dialog.getByLabel(modifierName + ": " + cheeseName).check()
  await dialog.getByRole("button", { name: "Agregar al pedido" }).click()
  await expect(page.getByText(cheeseName + " · " + mediumName, { exact: true })).toBeVisible()
  await expect(page.getByText("Impuesto 5%", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("note")).toContainText("se calculan y validan en el servidor")
  const cart = page.locator("aside").filter({ hasText: "Pedido actual" })
  await expect(cart).toContainText("Precio final por confirmar")
  await expect(cart).not.toContainText("$12000.00")

  const orderResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/orders") && response.request().method() === "POST",
  )
  await page.getByRole("button", { name: "Realizar Pedido", exact: true }).click()
  const orderResponse = await orderResponsePromise
  expect(orderResponse.status()).toBe(201)
  const receipt = await orderResponse.json()
  expect(receipt.orderId).toBeTruthy()
  expect(receipt.currency_code.trim()).toBe("COP")
  expect(receipt.subtotal_before_discount).toBe("12500.0000")
  expect(receipt.discount_total).toBe("0.0000")
  expect(receipt.tax_total).toBe("2375.0000")
  expect(receipt.total_amount).toBe("14875.0000")
  expect(receipt.items[0].tax_breakdown).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: expect.stringMatching(/^IVA-/), price_mode: "exclusive", amount: 2375 }),
  ]))
  await expect(page.getByRole("status")).toContainText("Total COP 14875.0000")

  const listOrdersPromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith("/api/orders") &&
      url.searchParams.get("limit") === "100" &&
      response.request().method() === "GET"
  })
  await page.getByRole("button", { name: "Mesas", exact: true }).click()
  const listOrdersResponse = await listOrdersPromise
  expect(listOrdersResponse.status()).toBe(200)
  const orders = await listOrdersResponse.json()
  const createdOrder = orders.find((order) => order.id === receipt.orderId)
  expect(createdOrder).toBeTruthy()
  const snapshot = createdOrder.order_items[0].variant_selection_snapshot
  expect(snapshot).toEqual(expect.arrayContaining([
    expect.objectContaining({ option_id: presentationOption.id, name: mediumName, group_name: presentationName, group_kind: "presentation" }),
    expect.objectContaining({ option_id: cheeseOption.id, name: cheeseName, group_name: modifierName, group_kind: "modifier" }),
  ]))
  expect(snapshot.some((item) => item.option_id === baconOption.id)).toBe(false)

  const branchReloadPromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/product-options/branches/" + branchId + "/options") &&
    response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "Variantes", exact: true }).click()
  await page.getByRole("button", { name: "Excepciones por sucursal", exact: true }).click()
  const branchReload = await branchReloadPromise
  expect(branchReload.status()).toBe(200)
  await expect(page.getByText(baconName, { exact: true })).toBeVisible()
  await setOptionInherited(page, baconName, "Restaurar herencia al finalizar aceptación automatizada")
})
