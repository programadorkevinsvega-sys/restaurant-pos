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
    try {
      await this.redisClient.set(key, JSON.stringify(value), { EX: cacheTtlSeconds })
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
    if (!this.redisClient || !this.redisReady("invalidate")) return
    try {
      await this.redisClient.incr(this.versionKey)
    } catch (error) {
      this.logRedisFailure("invalidate", error)
    }
  }

  async listCategories(actor) {
    await this.repository.assertBranchAccess(actor)
    return this.getOrLoad(
      `branch:${actor.activeBranchId}:categories`,
      () => this.repository.listCategories(actor),
    )
  }

  async listProducts(categoryId, actor) {
    await this.repository.assertBranchAccess(actor)
    const categoryKey = categoryId ?? "all"
    return this.getOrLoad(
      `branch:${actor.activeBranchId}:products:${categoryKey}`,
      () => this.repository.listProducts(categoryId, actor),
    )
  }

  async findProduct(id, actor) {
    await this.repository.assertBranchAccess(actor)
    return this.getOrLoad(
      `branch:${actor.activeBranchId}:product:${id}`,
      () => this.repository.findProduct(id, actor),
    )
  }

  listCorporateProducts(actor) {
    return this.repository.listCorporateProducts(actor)
  }

  listCorporateCategories(actor) {
    return this.repository.listCorporateCategories(actor)
  }

  listBranchProducts(branchId, actor) {
    return this.repository.listBranchProducts(branchId, actor)
  }

  async setBranchProductEnabled(branchId, productId, enabled, actor) {
    const result = await this.repository.setBranchProductEnabled(branchId, productId, enabled, actor)
    if (result.changed) await this.invalidate()
    return result
  }

  async createCategory(category, actor) {
    const result = await this.repository.createCategory(category, actor)
    await this.invalidate()
    return result
  }

  async createProduct(product, actor) {
    const result = await this.repository.createProduct(product, actor)
    await this.invalidate()
    return result
  }

  async updateProduct(id, product, actor) {
    const result = await this.repository.updateProduct(id, product, actor)
    await this.invalidate()
    return result
  }

  async deactivateProduct(id, actor) {
    const result = await this.repository.deactivateProduct(id, actor)
    await this.invalidate()
    return result
  }

  async updateCategory(id, category, actor) {
    const result = await this.repository.updateCategory(id, category, actor)
    await this.invalidate()
    return result
  }

  async deactivateCategory(id, actor) {
    const result = await this.repository.deactivateCategory(id, actor)
    await this.invalidate()
    return result
  }
}
