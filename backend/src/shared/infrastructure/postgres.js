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
    if (error.code === "55000" && String(error.message).includes("BRANCH_NOT_ACTIVE")) {
      throw new AppError(
        409,
        "BRANCH_NOT_ACTIVE",
        "La sucursal está suspendida o cerrada. Sus datos permanecen disponibles solo para consulta.",
      )
    }
    if (error.code === "55000" && String(error.message).includes("PRODUCT_NOT_ENABLED_FOR_BRANCH")) {
      throw new AppError(
        409,
        "PRODUCT_NOT_ENABLED_FOR_BRANCH",
        "El producto no está habilitado para la sucursal del pedido.",
      )
    }
    if (error.code === "23514" && String(error.message).includes("PRODUCT_OPTION_GROUP_CARDINALITY_INVALID")) {
      throw new AppError(422, "PRODUCT_OPTION_SELECTION_INVALID", "Selecciona las variantes y modificadores requeridos para cada producto.");
    }
    if (error.code === "23514" && String(error.message).includes("PRODUCT_OPTION_INVALID_INACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH")) {
      throw new AppError(422, "PRODUCT_OPTION_NOT_AVAILABLE", "Una opción seleccionada no está disponible para esta sucursal.");
    }
    if (error.code === "23514" && String(error.message).includes("Duplicate product option selection")) {
      throw new AppError(400, "DUPLICATE_PRODUCT_OPTION", "No repitas opciones en la misma línea del pedido.");
    }
    if (error.code === "23514" && String(error.message).includes("PRODUCT_NOT_ACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH")) {
      throw new AppError(409, "PRODUCT_NOT_AVAILABLE_FOR_BRANCH", "El producto no está activo o no está habilitado para esta sucursal.");
    }
    if (error.code === "23514" && String(error.message).includes("BRANCH_OPTION_WOULD_VIOLATE_GROUP_MINIMUM")) {
      throw new AppError(409, "BRANCH_OPTION_MINIMUM_REQUIRED", "La excepción dejaría el grupo sin suficientes opciones disponibles en esta sucursal.");
    }
    if (error.code === "23514" && String(error.message).includes("BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED")) {
      throw new AppError(409, "BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED", "No se puede habilitar el producto: las opciones disponibles no cumplen los mínimos de sus grupos.");
    }
    if (error.code === "42501" && String(error.message).includes("Active organization owner required")) {
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario corporativo puede administrar el catálogo maestro.")
    }
    const appError = new AppError(500, "PERSISTENCE_ERROR", "No se pudo completar la operación.")
    Object.defineProperty(appError, "cause", { value: error })
    throw appError
  }
}
