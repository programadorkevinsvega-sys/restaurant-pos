import pg from "pg"
import { AppError } from "../domain/app-error.js"
import { logger } from "./logger.js"

const { Pool } = pg

export function createPostgresPool(config) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.PG_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  })
  pool.on("error", (error) => {
    logger.error({ code: error.code ?? "UNKNOWN" }, "PostgreSQL pool error")
  })
  return pool
}

export async function queryPostgres(client, query, values = []) {
  try {
    return await client.query(query, values)
  } catch (error) {
    logger.error({ code: error.code ?? "UNKNOWN" }, "PostgreSQL operation failed")
    throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo completar la operación.")
  }
}
