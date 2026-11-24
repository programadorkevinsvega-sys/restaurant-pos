import assert from "node:assert/strict"
import express from "express"
import test from "node:test"
import { createPricingRoutes } from "../src/modules/pricing/presentation/routes.js"
import { AppError } from "../src/shared/domain/app-error.js"
import { errorHandler } from "../src/shared/presentation/http/error-handler.js"
import { requestContext } from "../src/shared/presentation/http/request-context.js"

const branchId = "11111111-1111-4111-8111-111111111111"
const entityId = "22222222-2222-4222-8222-222222222222"
const productId = "33333333-3333-4333-8333-333333333333"
const listId = "44444444-4444-4444-8444-444444444444"
const taxId = "55555555-5555-4555-8555-555555555555"

function authenticate(request, response, next) {
  const userId = request.get("X-Test-User")
  if (!userId) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar."))
  request.auth = { userId, role: "admin" }
  next()
}

function authorize(role) {
  return (request, response, next) => request.auth?.role === role
    ? next()
    : next(new AppError(403, "FORBIDDEN", "No tienes permisos para administrar precios."))
}

async function withServer(app, execute) {
  const server = app.listen(0)
  try {
    await new Promise((resolve) => server.once("listening", resolve))
    await execute("http://127.0.0.1:" + server.address().port)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function createApp(pricing) {
  const app = express()
  app.use(requestContext)
  app.use(express.json())
  app.use("/api/admin/pricing", createPricingRoutes(pricing, authenticate, authorize, (request, response, next) => next()))
  app.use(errorHandler)
  return app
}

test("pricing HTTP contract authenticates and delegates every configuration command with the actor", async () => {
  const calls = []
  const pricing = {
    list: async (actor) => { calls.push(["list", actor]); return { price_lists: [], tax_rules: [], promotions: [] } },
    createPriceList: async (input, actor) => { calls.push(["list-create", input, actor]); return { id: listId } },
    assignPriceList: async (input, actor) => { calls.push(["assign", input, actor]); return { assigned: true } },
    setPrice: async (input, actor) => { calls.push(["price", input, actor]); return { saved: true } },
    createTaxRule: async (input, actor) => { calls.push(["tax-create", input, actor]); return { id: taxId } },
    setProductTax: async (input, actor) => { calls.push(["tax-profile", input, actor]); return { saved: true } },
    createPromotion: async (input, actor) => { calls.push(["promotion", input, actor]); return { id: "promotion-id" } },
  }

  await withServer(createApp(pricing), async (baseUrl) => {
    const unauthenticated = await fetch(baseUrl + "/api/admin/pricing")
    assert.equal(unauthenticated.status, 401)

    const headers = { "X-Test-User": "owner-id", "Content-Type": "application/json" }
    const listed = await fetch(baseUrl + "/api/admin/pricing", { headers })
    assert.equal(listed.status, 200)

    const list = await fetch(baseUrl + "/api/admin/pricing/price-lists", {
      method: "POST", headers,
      body: JSON.stringify({ name: "Lista corporativa", currency_code: "COP", scope: "corporate" }),
    })
    assert.equal(list.status, 201)
    assert.equal((await list.json()).id, listId)

    const assignment = await fetch(baseUrl + "/api/admin/pricing/price-list-assignments", {
      method: "PUT", headers,
      body: JSON.stringify({ price_list_id: listId, branch_id: branchId, legal_entity_id: entityId }),
    })
    assert.equal(assignment.status, 200)

    const price = await fetch(baseUrl + "/api/admin/pricing/product-prices", {
      method: "PUT", headers,
      body: JSON.stringify({ price_list_id: listId, product_id: productId, unit_price: 12500.25 }),
    })
    assert.equal(price.status, 200)

    const tax = await fetch(baseUrl + "/api/admin/pricing/tax-rules", {
      method: "POST", headers,
      body: JSON.stringify({ legal_entity_id: entityId, code: "VAT", name: "IVA", tax_type: "VAT", rate: 0.19 }),
    })
    assert.equal(tax.status, 201)

    const profile = await fetch(baseUrl + "/api/admin/pricing/product-tax-profiles", {
      method: "PUT", headers,
      body: JSON.stringify({ product_id: productId, legal_entity_id: entityId, price_tax_mode: "inclusive", tax_rule_ids: [taxId] }),
    })
    assert.equal(profile.status, 200)

    const promotion = await fetch(baseUrl + "/api/admin/pricing/promotions", {
      method: "POST", headers,
      body: JSON.stringify({
        name: "Promoción dirigida", scope: "corporate", discount_type: "percentage", discount_value: 10,
        valid_from: "2026-11-24T00:00:00.000Z", valid_until: "2026-11-25T00:00:00.000Z",
        branch_ids: [branchId], product_ids: [productId], category_ids: [],
      }),
    })
    assert.equal(promotion.status, 201)
    assert.deepEqual(calls.map((call) => call[0]), [
      "list", "list-create", "assign", "price", "tax-create", "tax-profile", "promotion",
    ])
    for (const call of calls.slice(1)) assert.equal(call.at(-1).userId, "owner-id")
  })
})

test("pricing HTTP contract rejects invalid dates, duplicate tax components and duplicate promotion targets", async () => {
  const calls = []
  const pricing = {
    list: async () => ({ price_lists: [], tax_rules: [], promotions: [] }),
    setProductTax: async (...args) => { calls.push(args); return { saved: true } },
    createPromotion: async (...args) => { calls.push(args); return { id: "promotion-id" } },
    createPriceList: async (...args) => { calls.push(args); return { id: listId } },
  }

  await withServer(createApp(pricing), async (baseUrl) => {
    const headers = { "X-Test-User": "owner-id", "Content-Type": "application/json" }
    const duplicateTaxes = await fetch(baseUrl + "/api/admin/pricing/product-tax-profiles", {
      method: "PUT", headers,
      body: JSON.stringify({
        product_id: productId, legal_entity_id: entityId, price_tax_mode: "exclusive",
        tax_rule_ids: [taxId, taxId],
      }),
    })
    assert.equal(duplicateTaxes.status, 400)

    const duplicateBranches = await fetch(baseUrl + "/api/admin/pricing/promotions", {
      method: "POST", headers,
      body: JSON.stringify({
        name: "Promoción inválida", scope: "corporate", discount_type: "percentage", discount_value: 10,
        valid_from: "2026-11-25T00:00:00.000Z", valid_until: "2026-11-24T00:00:00.000Z",
        branch_ids: [branchId, branchId], product_ids: [], category_ids: [],
      }),
    })
    assert.equal(duplicateBranches.status, 400)

    const invalidDateRange = await fetch(baseUrl + "/api/admin/pricing/price-lists", {
      method: "POST", headers,
      body: JSON.stringify({
        name: "Lista con vigencia inválida", currency_code: "COP", scope: "branch",
        valid_from: "2026-11-25T00:00:00.000Z", valid_until: "2026-11-24T00:00:00.000Z",
      }),
    })
    assert.equal(invalidDateRange.status, 400)
    assert.equal(calls.length, 0)
  })
})
