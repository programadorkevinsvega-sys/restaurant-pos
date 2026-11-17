import assert from "node:assert/strict"
import test from "node:test"
import { RedisCachedCatalogRepository } from "../src/modules/catalog/infrastructure/redis-cached-catalog-repository.js"

const namespace = "restaurant-pos:test:cache:v1:catalog"

function createRepository({ repository = {}, values = new Map(), redisOverrides = {}, logger = {} } = {}) {
  const setCalls = []
  const redisClient = {
    isReady: true,
    get: async (key) => values.get(key) ?? null,
    set: async (...args) => { setCalls.push(args) },
    incr: async (key) => {
      const versionKey = key
      const nextVersion = Number(values.get(versionKey) ?? 0) + 1
      values.set(versionKey, String(nextVersion))
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

test("catalog reads return cached JSON without querying PostgreSQL", async () => {
  const expected = [{ id: "product-id", name: "Soup" }]
  const values = new Map([
    [`${namespace}:version`, "3"],
    [`${namespace}:3:products:all`, JSON.stringify(expected)],
  ])
  let databaseCalls = 0
  const { repository } = createRepository({
    values,
    repository: {
      listProducts: async () => {
        databaseCalls += 1
        return []
      },
    },
  })

  assert.deepEqual(await repository.listProducts(), expected)
  assert.equal(databaseCalls, 0)
})

test("catalog cache misses query PostgreSQL and write values with a bounded TTL", async () => {
  const expected = [{ id: "product-id", name: "Soup" }]
  let databaseCalls = 0
  const { repository, setCalls } = createRepository({
    repository: {
      listProducts: async (categoryId) => {
        databaseCalls += 1
        assert.equal(categoryId, "category-id")
        return expected
      },
    },
  })

  assert.deepEqual(await repository.listProducts("category-id"), expected)
  assert.equal(databaseCalls, 1)
  assert.equal(setCalls.length, 1)
  assert.equal(setCalls[0][0], `${namespace}:0:products:category:category-id`)
  assert.deepEqual(setCalls[0][2], { EX: 60 })
})

test("catalog writes increment the version after PostgreSQL succeeds", async () => {
  const order = []
  const { repository, values } = createRepository({
    repository: {
      createProduct: async (product) => {
        order.push("postgres")
        return product
      },
    },
    redisOverrides: {
      incr: async (key) => {
        order.push("invalidate")
        values.set(key, "1")
        return 1
      },
    },
  })

  const product = { id: "product-id" }
  assert.deepEqual(await repository.createProduct(product), product)
  assert.deepEqual(order, ["postgres", "invalidate"])
  assert.equal(values.get(`${namespace}:version`), "1")
})

test("Redis read failures are logged and fall back to PostgreSQL", async () => {
  const warnings = []
  const expected = [{ id: "category-id", name: "Food" }]
  let databaseCalls = 0
  const { repository, setCalls } = createRepository({
    repository: {
      listCategories: async () => {
        databaseCalls += 1
        return expected
      },
    },
    redisOverrides: {
      get: async () => { throw Object.assign(new Error("Redis unavailable"), { code: "ECONNREFUSED" }) },
    },
    logger: { warn: (...args) => warnings.push(args) },
  })

  assert.deepEqual(await repository.listCategories(), expected)
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
    repository: {
      listProducts: async () => expected,
    },
    redisOverrides: {
      set: async () => { throw Object.assign(new Error("Redis unavailable"), { code: "ECONNRESET" }) },
    },
    logger: { warn: (...args) => warnings.push(args) },
  })

  assert.deepEqual(await repository.listProducts(), expected)
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][0].operation, "write-value")
})
