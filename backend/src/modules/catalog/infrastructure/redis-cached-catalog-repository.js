const cacheMiss = Symbol("cache-miss")
const cacheTtlSeconds = 60

export class RedisCachedCatalogRepository {
  constructor(repository, redisClient, logger, namespace) {
    this.repository = repository
    this.redisClient = redisClient
    this.logger = logger
    this.namespace = namespace
    this.versionKey = `${namespace}:version`
  }

  logRedisFailure(operation, error) {
    this.logger.warn({
      operation,
      code: error?.code ?? "UNKNOWN",
    }, "Redis catalog cache operation failed; using PostgreSQL")
  }

  redisReady(operation) {
    if (this.redisClient.isReady) return true
    this.logger.warn({
      operation,
      code: "NOT_READY",
    }, "Redis catalog cache is unavailable; using PostgreSQL")
    return false
  }

  async readVersion() {
    if (!this.redisClient) return null
    if (!this.redisReady("read-version")) return null

    try {
      const version = await this.redisClient.get(this.versionKey)
      if (version === null) return "0"
      if (!/^\d+$/.test(version)) {
        this.logger.warn({ operation: "read-version" }, "Redis catalog cache version is invalid; using PostgreSQL")
        return null
      }
      return version
    } catch (error) {
      this.logRedisFailure("read-version", error)
      return null
    }
  }

  async readCachedValue(key) {
    if (!this.redisReady("read-value")) return cacheMiss

    try {
      const serialized = await this.redisClient.get(key)
      if (serialized === null) return cacheMiss

      try {
        return JSON.parse(serialized)
      } catch (error) {
        this.logRedisFailure("parse-value", error)
        try {
          await this.redisClient.del(key)
        } catch (deleteError) {
          this.logRedisFailure("delete-invalid-value", deleteError)
        }
        return cacheMiss
      }
    } catch (error) {
      this.logRedisFailure("read-value", error)
      return cacheMiss
    }
  }

  async writeCachedValue(key, value) {
    if (!this.redisReady("write-value")) return

    const serialized = JSON.stringify(value)
    try {
      await this.redisClient.set(key, serialized, { EX: cacheTtlSeconds })
    } catch (error) {
      this.logRedisFailure("write-value", error)
    }
  }

  async getOrLoad(keySuffix, load) {
    const version = await this.readVersion()
    if (version === null) return load()

    const key = `${this.namespace}:${version}:${keySuffix}`
    const cachedValue = await this.readCachedValue(key)
    if (cachedValue !== cacheMiss) return cachedValue

    const value = await load()
    await this.writeCachedValue(key, value)
    return value
  }

  async invalidate() {
    if (!this.redisClient) return
    if (!this.redisReady("invalidate")) return

    try {
      await this.redisClient.incr(this.versionKey)
    } catch (error) {
      this.logRedisFailure("invalidate", error)
    }
  }

  listCategories() {
    return this.getOrLoad("categories", () => this.repository.listCategories())
  }

  listProducts(categoryId) {
    const key = categoryId ? `products:category:${categoryId}` : "products:all"
    return this.getOrLoad(key, () => this.repository.listProducts(categoryId))
  }

  findProduct(id) {
    return this.getOrLoad(`product:${id}`, () => this.repository.findProduct(id))
  }

  async createCategory(category) {
    const result = await this.repository.createCategory(category)
    await this.invalidate()
    return result
  }

  async createProduct(product) {
    const result = await this.repository.createProduct(product)
    await this.invalidate()
    return result
  }
}
