import assert from "node:assert/strict"
import test from "node:test"
import { RecipesUseCases } from "../src/modules/recipes/application/recipes-use-cases.js"

test("recipe use cases delegate ingredient and recipe operations with the authenticated actor", async () => {
  const actor = { userId: "owner-id", role: "staff" }
  const calls = []
  const repository = {
    listIngredients: async (...args) => { calls.push(["list", ...args]); return [] },
    createIngredient: async (...args) => { calls.push(["create-ingredient", ...args]); return { id: "ingredient-id" } },
    updateIngredient: async (...args) => { calls.push(["update-ingredient", ...args]); return { id: "ingredient-id" } },
    deactivateIngredient: async (...args) => { calls.push(["deactivate-ingredient", ...args]); return { success: true } },
    getRecipe: async (...args) => { calls.push(["get-recipe", ...args]); return null },
    saveRecipe: async (...args) => { calls.push(["save-recipe", ...args]); return { id: "recipe-id" } },
  }
  const useCases = new RecipesUseCases(repository)
  await useCases.listIngredients(actor)
  await useCases.createIngredient({ name: "Harina", unit_code: "g" }, actor)
  await useCases.updateIngredient("ingredient-id", { name: "Harina", unit_code: "g" }, actor)
  await useCases.deactivateIngredient("ingredient-id", actor)
  await useCases.getRecipe("product-id", actor)
  await useCases.saveRecipe("product-id", { ingredients: [{ ingredient_id: "ingredient-id", quantity: "1.25" }] }, actor)

  assert.deepEqual(calls.map((call) => call[0]), [
    "list", "create-ingredient", "update-ingredient", "deactivate-ingredient", "get-recipe", "save-recipe",
  ])
  assert.ok(calls.every((call) => call.at(-1) === actor))
})
