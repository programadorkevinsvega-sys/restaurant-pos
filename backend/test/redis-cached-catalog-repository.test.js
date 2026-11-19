import assert from "node:assert/strict"
import test from "node:test"
import { RedisCachedCatalogRepository } from "../src/modules/catalog/infrastructure/redis-cached-catalog-repository.js"

const namespace = "restaurant-pos:test:cache:v1:catalog"
const actor = { userId: "owner-id", activeBranchId: "branch-a" }

function createRepository({ repository = {}, values = new Map(), redisOverrides = {}, logger = {} } = {}) {
  const setCalls = []
  const redisClient = {
    isReady: true,
    get: async (key) => values.get(key) ?? null,
    set: async (...args) => { setCalls.push(args) },
    incr: async (key) => {
      const nextVersion = Number(values.get(key) ?? 0) + 1
      values.set(key, String(nextVersion))
      return nextVersion
    },
    del: async (key) => values.delete(key),
    ...redisOverrides,
  }
  return {
    repository: new RedisCachedCatalogRepository(repository, redisClient, {
      warn() {},
      ...logger,
    }, namespace),
    values,
    setCalls,
  }
}

function repositoryStub(overrides = {}) {
  return {
    assertBranchAccess: async () => {},
    listCategories: async () => [],
    listProducts: async () => [],
    findProduct: async () => null,
    listCorporateProducts: async () => [],
    listCorporateCategories: async () => [],
    listBranchProducts: async () => [],
    setBranchProductEnabled: async () => ({ success: true, changed: true }),
    createCategory: async (input) => input,
    createProduct: async (input) => input,
    updateProduct: async (id, input) => ({ id, ...input }),
    deactivateProduct: async (id) => ({ success: true, deactivated: true, id }),
    updateCategory: async (id, input) => ({ id, ...input }),
    deactivateCategory: async (id) => ({ success: true, deactivated: true, id }),
    ...overrides,
  }
}

test("catalog cache keys are scoped to the active branch", async () => {
  const values = new Map([
    [`${namespace}:version`, "3"],
    [`${namespace}:3:branch:branch-a:products:all`, JSON.stringify([{ id: "branch-a-product" }])],
  ])
  let databaseCalls = 0
  const { repository } = createRepository({
    values,
    repository: repositoryStub({
      listProducts: async (_categoryId, currentActor) => {
        databaseCalls += 1
        assert.equal(currentActor.activeBranchId, "branch-b")
        return [{ id: "branch-b-product" }]
      },
    }),
  })

  assert.deepEqual(await repository.listProducts(undefined, actor), [{ id: "branch-a-product" }])
  assert.deepEqual(await repository.listProducts(undefined, { ...actor, activeBranchId: "branch-b" }), [{ id: "branch-b-product" }])
  assert.equal(databaseCalls, 1)
})

test("catalog cache misses query PostgreSQL and use branch-specific keys with a bounded TTL", async () => {
  const expected = [{ id: "product-id", name: "Soup" }]
  let databaseCalls = 0
  const { repository, setCalls } = createRepository({
    repository: repositoryStub({
      listProducts: async (categoryId, currentActor) => {
        databaseCalls += 1
        assert.equal(categoryId, "category-id")
        assert.equal(currentActor.activeBranchId, "branch-a")
        return expected
      },
    }),
  })

  assert.deepEqual(await repository.listProducts("category-id", actor), expected)
  assert.equal(databaseCalls, 1)
  assert.equal(setCalls.length, 1)
  assert.equal(setCalls[0][0], `${namespace}:0:branch:branch-a:products:category-id`)
  assert.deepEqual(setCalls[0][2], { EX: 60 })
})

test("cache access validates branch assignment before serving a cached value", async () => {
  let authorized = 0
  const values = new Map([
    [`${namespace}:version`, "1"],
    [`${namespace}:1:branch:branch-a:products:all`, JSON.stringify([{ id: "product-id" }])],
  ])
  const { repository } = createRepository({
    values,
    repository: repositoryStub({
      assertBranchAccess: async () => { authorized += 1 },
    }),
  })

  assert.equal((await repository.listProducts(undefined, actor)).length, 1)
  assert.equal(authorized, 1)
})

test("catalog cache reads fall back to PostgreSQL when Redis is unavailable", async () => {
  const warnings = []
  const expected = [{ id: "category-id", name: "Food" }]
  let databaseCalls = 0
  const { repository, setCalls } = createRepository({
    repository: repositoryStub({
      listCategories: async (currentActor) => {
        databaseCalls += 1
        assert.equal(currentActor.activeBranchId, "branch-a")
        return expected
      },
    }),
    redisOverrides: {
      get: async () => { throw Object.assign(new Error("Redis unavailable"), { code: "ECONNREFUSED" }) },
    },
    logger: { warn: (...args) => warnings.push(args) },
  })

  assert.deepEqual(await repository.listCategories(actor), expected)
  assert.equal(databaseCalls, 1)
  assert.equal(setCalls.length, 0)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0].operation, "read-version")
  assert.equal(warnings[0][0].code, "ECONNREFUSED")
})

test("Redis write failures do not hide successful PostgreSQL reads", async () => {
  const warnings = []
  const expected = [{ id: "product-id", name: "Soup" }]
  const { repository } = createRepository({
    repository: repositoryStub({ listProducts: async () => expected }),
    redisOverrides: {
      set: async () => { throw Object.assign(new Error("Redis unavailable"), { code: "ECONNRESET" }) },
    },
    logger: { warn: (...args) => warnings.push(args) },
  })

  assert.deepEqual(await repository.listProducts(undefined, actor), expected)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0].operation, "write-value")
})

test("corporate category reads delegate to PostgreSQL without requiring a branch cache key", async () => {
  const expected = [{ id: "category-id", name: "Drinks", is_active: true, item_count: 2 }]
  let receivedActor
  const { repository } = createRepository({
    repository: repositoryStub({
      listCorporateCategories: async (currentActor) => {
        receivedActor = currentActor
        return expected
      },
    }),
  })

  assert.deepEqual(await repository.listCorporateCategories(actor), expected)
  assert.deepEqual(receivedActor, actor)
})

test("corporate product and category mutations invalidate branch catalog caches after persistence", async () => {
  const invalidations = []
  const { repository } = createRepository({
    repository: repositoryStub(),
    redisOverrides: {
      incr: async (key) => {
        invalidations.push(key)
        return invalidations.length
      },
    },
  })

  await repository.updateProduct("product-id", { name: "Updated product" }, actor)
  await repository.deactivateProduct("product-id", actor)
  await repository.updateCategory("category-id", { name: "Updated category" }, actor)
  await repository.deactivateCategory("category-id", actor)

  assert.equal(invalidations.length, 4)
  assert.ok(invalidations.every((key) => key === `${namespace}:version`))
})

test("failed corporate catalog mutations do not invalidate caches", async () => {
  let invalidations = 0
  const { repository } = createRepository({
    repository: repositoryStub({
      updateProduct: async () => { throw new Error("Persistence failed") },
    }),
    redisOverrides: {
      incr: async () => { invalidations += 1; return invalidations },
    },
  })

  await assert.rejects(repository.updateProduct("product-id", { name: "Updated product" }, actor), /Persistence failed/)
  assert.equal(invalidations, 0)
})

test("branch availability changes invalidate cached catalogs after PostgreSQL confirms a change", async () => {
  let invalidations = 0
  const { repository } = createRepository({
    repository: repositoryStub({
      setBranchProductEnabled: async () => ({ success: true, changed: true }),
    }),
    redisOverrides: {
      incr: async () => { invalidations += 1; return invalidations },
    },
  })

  await repository.setBranchProductEnabled("branch-a", "product-a", false, actor)
  assert.equal(invalidations, 1)
})

test("unchanged branch availability does not invalidate cached catalogs", async () => {
  let invalidations = 0
  const { repository } = createRepository({
    repository: repositoryStub({
      setBranchProductEnabled: async () => ({ success: true, changed: false }),
    }),
    redisOverrides: {
      incr: async () => { invalidations += 1; return invalidations },
    },
  })

  await repository.setBranchProductEnabled("branch-a", "product-a", false, actor)
  assert.equal(invalidations, 0)
})
