import assert from "node:assert/strict"
import express from "express"
import test from "node:test"
import { createCatalogRoutes } from "../src/modules/catalog/presentation/routes.js"
import { createAdminCatalogRoutes } from "../src/modules/catalog/presentation/admin-routes.js"
import { AppError } from "../src/shared/domain/app-error.js"
import { errorHandler } from "../src/shared/presentation/http/error-handler.js"
import { requestContext } from "../src/shared/presentation/http/request-context.js"

const branchId = "11111111-1111-4111-8111-111111111111"
const productId = "22222222-2222-4222-8222-222222222222"
const categoryId = "33333333-3333-4333-8333-333333333333"
const owner = { userId: "owner-id", role: "staff", activeBranchId: branchId }

function authenticate(request, response, next) {
  const userId = request.get("X-Test-User")
  if (!userId) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar."))
  request.auth = {
    userId,
    role: "staff",
    activeBranchId: request.get("X-Active-Branch-ID") || null,
  }
  next()
}

async function withServer(app, execute) {
  const server = app.listen(0)
  try {
    await new Promise((resolve) => server.once("listening", resolve))
    await execute(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function createApp() {
  const app = express()
  app.use(requestContext)
  app.use(express.json())
  return app
}

test("operational catalog reads require authentication and an assigned active branch", async () => {
  let receivedActor
  const catalog = {
    listCategories: async (actor) => {
      receivedActor = actor
      return [{ id: categoryId, name: "Bebidas", icon: "Coffee", item_count: 1 }]
    },
    listProducts: async (_categoryId, actor) => {
      receivedActor = actor
      return [{ id: productId, name: "Agua" }]
    },
    findProduct: async (_id, actor) => {
      receivedActor = actor
      return { id: productId, name: "Agua" }
    },
  }
  const routes = createCatalogRoutes(catalog, authenticate)
  const app = createApp()
  app.use("/api/categories", routes.categories)
  app.use("/api/products", routes.products)
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/api/categories`)
    assert.equal(unauthenticated.status, 401)

    const missingBranch = await fetch(`${baseUrl}/api/products`, {
      headers: { "X-Test-User": owner.userId },
    })
    assert.equal(missingBranch.status, 409)
    assert.equal((await missingBranch.json()).error.code, "ACTIVE_BRANCH_REQUIRED")

    const headers = {
      "X-Test-User": owner.userId,
      "X-Active-Branch-ID": branchId,
    }
    const categories = await fetch(`${baseUrl}/api/categories`, { headers })
    assert.equal(categories.status, 200)
    assert.equal((await categories.json())[0].id, categoryId)
    assert.deepEqual(receivedActor, { ...owner })

    const products = await fetch(`${baseUrl}/api/products?category_id=${categoryId}`, { headers })
    assert.equal(products.status, 200)
    assert.equal((await products.json())[0].id, productId)
    assert.deepEqual(receivedActor, { ...owner })

    const product = await fetch(`${baseUrl}/api/products/${productId}`, { headers })
    assert.equal(product.status, 200)
    assert.equal((await product.json()).id, productId)
  })
})

test("corporate category creation passes the authenticated actor to the owner-guarded use case", async () => {
  let received
  const routes = createCatalogRoutes({
    createCategory: async (input, actor) => {
      received = { input, actor }
      return { id: categoryId, ...input }
    },
  }, authenticate)
  const app = createApp()
  app.use("/api/categories", routes.categories)
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Test-User": owner.userId,
      },
      body: JSON.stringify({ name: "Bebidas", icon: "Coffee" }),
    })
    assert.equal(response.status, 201)
    assert.deepEqual(received, {
      input: { name: "Bebidas", icon: "Coffee" },
      actor: { userId: owner.userId, role: "staff", activeBranchId: null },
    })
  })
})

test("administrative branch catalog routes validate scope and pass the actor", async () => {
  const calls = []
  const catalog = {
    listCorporateProducts: async (actor) => {
      calls.push(["list-master", actor])
      return [{ id: productId }]
    },
    listBranchProducts: async (id, actor) => {
      calls.push(["list-branch", id, actor])
      return [{ id: productId, enabled: true }]
    },
    setBranchProductEnabled: async (...args) => {
      calls.push(["set-branch-product", ...args])
      return { success: true, changed: true }
    },
    createProduct: async (input, actor) => {
      calls.push(["create-product", input, actor])
      return { id: productId, ...input }
    },
    createCategory: async (input, actor) => {
      calls.push(["create-category", input, actor])
      return { id: categoryId, ...input }
    },
  }
  const limiter = (request, response, next) => next()
  const app = createApp()
  app.use("/api/admin", createAdminCatalogRoutes(catalog, authenticate, () => {}, limiter))
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const headers = {
      "X-Test-User": owner.userId,
      "Content-Type": "application/json",
    }
    const master = await fetch(`${baseUrl}/api/admin/catalog/products`, { headers })
    assert.equal(master.status, 200)

    const branchCatalog = await fetch(
      `${baseUrl}/api/admin/catalog/branches/${branchId}/products`,
      { headers },
    )
    assert.equal(branchCatalog.status, 200)

    const changed = await fetch(
      `${baseUrl}/api/admin/catalog/branches/${branchId}/products/${productId}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ enabled: false }),
      },
    )
    assert.equal(changed.status, 200)
    assert.deepEqual(await changed.json(), { success: true, changed: true })

    const invalid = await fetch(
      `${baseUrl}/api/admin/catalog/branches/${branchId}/products/${productId}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ enabled: "false" }),
      },
    )
    assert.equal(invalid.status, 400)

    assert.deepEqual(calls.slice(0, 3), [
      ["list-master", { userId: owner.userId, role: "staff", activeBranchId: null }],
      ["list-branch", branchId, { userId: owner.userId, role: "staff", activeBranchId: null }],
      ["set-branch-product", branchId, productId, false, { userId: owner.userId, role: "staff", activeBranchId: null }],
    ])
  })
})
