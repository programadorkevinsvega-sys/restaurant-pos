import assert from "node:assert/strict"
import express from "express"
import test from "node:test"
import { createAdminRecipeRoutes } from "../src/modules/recipes/presentation/routes.js"
import { AppError } from "../src/shared/domain/app-error.js"
import { errorHandler } from "../src/shared/presentation/http/error-handler.js"
import { requestContext } from "../src/shared/presentation/http/request-context.js"

const productId = "22222222-2222-4222-8222-222222222222"
const ingredientId = "33333333-3333-4333-8333-333333333333"

function authenticate(request, response, next) {
  const userId = request.get("X-Test-User")
  if (!userId) return next(new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar."))
  request.auth = { userId, role: "staff", activeBranchId: null }
  next()
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

test("recipe administration requires authentication and passes the actor to ingredient use cases", async () => {
  const calls = []
  const recipes = {
    listIngredients: async (actor) => {
      calls.push(["list", actor])
      return [{ id: ingredientId, name: "Harina", unit_code: "g", is_active: true }]
    },
    createIngredient: async (input, actor) => {
      calls.push(["create", input, actor])
      return { id: ingredientId, ...input, is_active: true }
    },
    updateIngredient: async (id, input, actor) => {
      calls.push(["update", id, input, actor])
      return { id, ...input, is_active: true }
    },
    deactivateIngredient: async (id, actor) => {
      calls.push(["deactivate", id, actor])
      return { success: true, deactivated: true }
    },
  }
  const app = express()
  app.use(requestContext)
  app.use(express.json())
  app.use("/api/admin/recipes", createAdminRecipeRoutes(recipes, authenticate, (request, response, next) => next()))
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(baseUrl + "/api/admin/recipes/ingredients")
    assert.equal(unauthenticated.status, 401)

    const headers = { "X-Test-User": "owner-id", "Content-Type": "application/json" }
    const list = await fetch(baseUrl + "/api/admin/recipes/ingredients", { headers })
    assert.equal(list.status, 200)
    assert.equal((await list.json())[0].unit_code, "g")

    const created = await fetch(baseUrl + "/api/admin/recipes/ingredients", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Harina", description: null, unit_code: "g" }),
    })
    assert.equal(created.status, 201)
    assert.equal((await created.json()).id, ingredientId)

    const updated = await fetch(baseUrl + "/api/admin/recipes/ingredients/" + ingredientId, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: "Harina integral", description: "Molida", unit_code: "g" }),
    })
    assert.equal(updated.status, 200)
    assert.equal((await updated.json()).name, "Harina integral")

    const deactivated = await fetch(baseUrl + "/api/admin/recipes/ingredients/" + ingredientId, {
      method: "DELETE",
      headers,
    })
    assert.equal(deactivated.status, 200)
    assert.deepEqual(await deactivated.json(), { success: true, deactivated: true })

    const invalid = await fetch(baseUrl + "/api/admin/recipes/ingredients", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Unidad inválida", description: null, unit_code: "KG" }),
    })
    assert.equal(invalid.status, 400)
    assert.deepEqual(calls.map((call) => call[0]), ["list", "create", "update", "deactivate"])
    assert.equal(calls[1][2].userId, "owner-id")
    assert.equal(calls[2][3].userId, "owner-id")
    assert.equal(calls[3][2].userId, "owner-id")
  })
})

test("recipe contract rejects invalid decimal quantities and duplicate ingredients", async () => {
  let received
  const recipes = {
    getRecipe: async (id, actor) => ({ id: "recipe-id", product_id: id, ingredients: [] }),
    saveRecipe: async (id, input, actor) => {
      received = { id, input, actor }
      return { id: "recipe-id", product_id: id, ...input }
    },
  }
  const app = express()
  app.use(requestContext)
  app.use(express.json())
  app.use("/api/admin/recipes", createAdminRecipeRoutes(recipes, authenticate, (request, response, next) => next()))
  app.use(errorHandler)

  await withServer(app, async (baseUrl) => {
    const headers = { "X-Test-User": "owner-id", "Content-Type": "application/json" }
    const invalidQuantity = await fetch(baseUrl + "/api/admin/recipes/products/" + productId, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        preparation_instructions: "Mezclar",
        ingredients: [{ ingredient_id: ingredientId, quantity: "0" }],
      }),
    })
    assert.equal(invalidQuantity.status, 400)

    const duplicate = await fetch(baseUrl + "/api/admin/recipes/products/" + productId, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        preparation_instructions: "Mezclar",
        ingredients: [
          { ingredient_id: ingredientId, quantity: "1.250001" },
          { ingredient_id: ingredientId, quantity: "2" },
        ],
      }),
    })
    assert.equal(duplicate.status, 400)

    const saved = await fetch(baseUrl + "/api/admin/recipes/products/" + productId, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        preparation_instructions: "Mezclar en frío.",
        ingredients: [{ ingredient_id: ingredientId, quantity: "1.250001" }],
      }),
    })
    assert.equal(saved.status, 200)
    assert.equal(received.input.ingredients[0].quantity, "1.250001")
    assert.equal(received.actor.userId, "owner-id")
  })
})
