import assert from "node:assert/strict"
import test from "node:test"
import { CatalogUseCases } from "../src/modules/catalog/application/catalog-use-cases.js"

function createRepository(overrides = {}) {
  return {
    listCategories: async () => [],
    listProducts: async () => [],
    findProduct: async () => null,
    listCorporateProducts: async () => [],
    listBranchProducts: async () => [],
    setBranchProductEnabled: async () => ({ success: true, changed: true }),
    createCategory: async (input) => input,
    createProduct: async (input) => input,
    ...overrides,
  }
}

const owner = { userId: "owner-id", role: "admin", activeBranchId: "branch-a" }

test("catalog branch reads pass authenticated branch context to the repository", async () => {
  let received
  const useCases = new CatalogUseCases(createRepository({
    listProducts: async (categoryId, actor) => {
      received = { categoryId, actor }
      return [{ id: "product-a" }]
    },
  }))

  const products = await useCases.listProducts("category-a", owner)
  assert.deepEqual(products, [{ id: "product-a" }])
  assert.deepEqual(received, { categoryId: "category-a", actor: owner })
})

test("branch catalog changes preserve requested scope and actor", async () => {
  let received
  const useCases = new CatalogUseCases(createRepository({
    setBranchProductEnabled: async (...args) => {
      received = args
      return { success: true, changed: false }
    },
  }))

  const result = await useCases.setBranchProductEnabled("branch-b", "product-a", false, owner)
  assert.deepEqual(received, ["branch-b", "product-a", false, owner])
  assert.deepEqual(result, { success: true, changed: false })
})

test("corporate catalog queries pass the actor through to authorization", async () => {
  let received
  const useCases = new CatalogUseCases(createRepository({
    listBranchProducts: async (branchId, actor) => {
      received = { branchId, actor }
      return []
    },
  }))

  await useCases.listBranchProducts("branch-b", owner)
  assert.deepEqual(received, { branchId: "branch-b", actor: owner })
})
