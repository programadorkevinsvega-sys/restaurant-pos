import assert from "node:assert/strict"
import express from "express"
import test from "node:test"
import { createAdminProductOptionRoutes, createPosProductOptionRoutes } from "../src/modules/product-options/presentation/routes.js"
import { AppError } from "../src/shared/domain/app-error.js"
import { errorHandler } from "../src/shared/presentation/http/error-handler.js"
import { requestContext } from "../src/shared/presentation/http/request-context.js"

const productId = "22222222-2222-4222-8222-222222222222"
const groupId = "33333333-3333-4333-8333-333333333333"
const optionId = "44444444-4444-4444-8444-444444444444"
const branchId = "55555555-5555-4555-8555-555555555555"

function authenticate(request, response, next) {
  const userId = request.get("X-Test-User")
  if (!userId) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar."))
  request.auth = { userId, role: "staff", activeBranchId: branchId }
  next()
}

function authorize(...roles) {
  return (request, response, next) => roles.includes(request.auth?.role)
    ? next()
    : next(new AppError(403, "FORBIDDEN", "No tienes permiso para operar."))
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

function createFakeOptions(calls) {
  return {
    listProductOptions: async (...args) => { calls.push(["listProduct", ...args]); return { product_id: productId, groups: [] } },
    createGroup: async (...args) => { calls.push(["createGroup", ...args]); return { id: groupId, ...args[1] } },
    updateGroup: async (...args) => { calls.push(["updateGroup", ...args]); return { id: groupId, ...args[1] } },
    createOption: async (...args) => { calls.push(["createOption", ...args]); return { id: optionId, ...args[1] } },
    updateOption: async (...args) => { calls.push(["updateOption", ...args]); return { id: optionId, ...args[1] } },
    listBranchOptions: async (...args) => { calls.push(["listBranch", ...args]); return { branch: { id: branchId }, options: [], events: [] } },
    setBranchOptionAvailability: async (...args) => { calls.push(["setBranch", ...args]); return { success: true, changed: true } },
    clearBranchOptionOverride: async (...args) => { calls.push(["clearBranch", ...args]); return { success: true, changed: true } },
    listForActiveBranch: async (...args) => { calls.push(["listPos", ...args]); return { product_id: productId, groups: [] } },
  }
}

test("product option administration validates contracts and keeps branch exception actor and reason", async () => {
  const calls = []
  const options = createFakeOptions(calls)
  const app = express()
  app.use(requestContext)
  app.use(express.json())
  app.use("/api/admin/product-options", createAdminProductOptionRoutes(
    options, authenticate, (request, response, next) => next(),
  ))
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(baseUrl + "/api/admin/product-options/products/" + productId)
    assert.equal(unauthenticated.status, 401)

    const headers = { "X-Test-User": "owner-id", "Content-Type": "application/json" }
    const invalidPresentation = await fetch(baseUrl + "/api/admin/product-options/products/" + productId + "/groups", {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "presentation", name: "Tamaño", min_selections: 0, max_selections: 1 }),
    })
    assert.equal(invalidPresentation.status, 400)

    const createdGroup = await fetch(baseUrl + "/api/admin/product-options/products/" + productId + "/groups", {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: "presentation", name: "Tamaño", min_selections: 1, max_selections: 1 }),
    })
    assert.equal(createdGroup.status, 201)
    assert.equal((await createdGroup.json()).is_active, false)
    assert.equal(calls.find((call) => call[0] === "createGroup")[3].userId, "owner-id")

    const createdOption = await fetch(baseUrl + "/api/admin/product-options/groups/" + groupId + "/options", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Mediana" }),
    })
    assert.equal(createdOption.status, 201)
    assert.equal(calls.find((call) => call[0] === "createOption")[2].is_active, true)

    const branchList = await fetch(baseUrl + "/api/admin/product-options/branches/" + branchId + "/options", { headers })
    assert.equal(branchList.status, 200)
    assert.deepEqual((await branchList.json()).events, [])

    const restricted = await fetch(baseUrl + "/api/admin/product-options/branches/" + branchId + "/options/" + optionId, {
      method: "PUT",
      headers,
      body: JSON.stringify({ enabled: false, reason: "No disponible por mantenimiento" }),
    })
    assert.equal(restricted.status, 200)
    assert.equal(calls.find((call) => call[0] === "setBranch")[3].reason, "No disponible por mantenimiento")

    const inherited = await fetch(baseUrl + "/api/admin/product-options/branches/" + branchId + "/options/" + optionId, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ reason: "Restablecer catálogo corporativo" }),
    })
    assert.equal(inherited.status, 200)
    assert.equal(calls.find((call) => call[0] === "clearBranch")[3], "Restablecer catálogo corporativo")
  })
})

test("POS option listing requires an authenticated staff or admin actor", async () => {
  const calls = []
  const app = express()
  app.use(requestContext)
  app.use("/api/products", createPosProductOptionRoutes(createFakeOptions(calls), authenticate, authorize))
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const denied = await fetch(baseUrl + "/api/products/" + productId + "/options")
    assert.equal(denied.status, 401)

    const allowed = await fetch(baseUrl + "/api/products/" + productId + "/options", {
      headers: { "X-Test-User": "staff-id" },
    })
    assert.equal(allowed.status, 200)
    assert.equal(calls[0][0], "listPos")
    assert.equal(calls[0][2].activeBranchId, branchId)
  })
})
