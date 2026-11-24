import pg from "pg"
import { AppError } from "../domain/app-error.js"
import { logger } from "./logger.js"

const { Pool } = pg

const BUSINESS_RULE_ERRORS = [
  ["PRICE_LIST_NOT_CONFIGURED", 409, "PRICE_LIST_NOT_CONFIGURED", "La sucursal y entidad legal no tienen una lista de precios vigente asignada."],
  ["PRODUCT_PRICE_NOT_CONFIGURED_OR_INACTIVE", 409, "PRODUCT_PRICE_NOT_CONFIGURED", "Uno de los productos no tiene un precio activo en la lista asignada a esta sucursal."],
  ["PRODUCT_TAX_PROFILE_REQUIRED", 409, "PRODUCT_TAX_PROFILE_REQUIRED", "Configura el perfil fiscal del producto para la entidad legal seleccionada antes de crear el pedido."],
  ["PROMOTION_CONFLICT_MULTIPLE_MATCHES", 409, "PROMOTION_CONFLICT", "Hay más de una promoción vigente aplicable al producto. Ajusta sus objetivos o vigencias."],
  ["PROMOTION_CURRENCY_MISMATCH", 409, "PROMOTION_CURRENCY_MISMATCH", "La moneda de la promoción no coincide con la moneda de la lista de precios."],
  ["COMBINED_TAX_RATE_INVALID", 422, "COMBINED_TAX_RATE_INVALID", "La suma de las tasas tributarias configuradas supera el límite permitido por el sistema."],
  ["BRANCH_OR_LEGAL_ENTITY_ACCESS_DENIED", 403, "BRANCH_LEGAL_ENTITY_ACCESS_DENIED", "La entidad legal seleccionada no está habilitada para la sucursal activa o no tienes acceso a ella."],
  ["PRICE_LIST_ASSIGNMENT_SCOPE_INVALID", 422, "PRICE_LIST_ASSIGNMENT_INVALID", "La lista de precios o la relación entre sucursal y entidad legal no es válida."],
  ["INVALID_PRICE_LIST", 422, "PRICE_LIST_INVALID", "Revisa el nombre, moneda, ámbito y vigencia de la lista de precios."],
  ["INVALID_PRODUCT_PRICE", 422, "PRODUCT_PRICE_INVALID", "El precio del producto debe ser un importe válido y no negativo."],
  ["INVALID_TAX_RULE", 422, "TAX_RULE_INVALID", "Revisa el código, nombre, tasa, entidad legal y vigencia de la regla tributaria."],
  ["INVALID_TAX_PROFILE", 422, "TAX_PROFILE_INVALID", "El modo y los componentes del perfil fiscal no son válidos."],
  ["DUPLICATE_TAX_RULE", 422, "DUPLICATE_TAX_RULE", "No puedes asignar dos veces el mismo componente tributario."],
  ["TAX_RULE_SCOPE_INVALID", 422, "TAX_RULE_SCOPE_INVALID", "Todas las reglas tributarias deben pertenecer a la entidad legal seleccionada."],
  ["INVALID_PROMOTION_TARGETS", 422, "PROMOTION_TARGETS_INVALID", "La promoción contiene productos o categorías objetivo duplicados."],
  ["INVALID_PROMOTION", 422, "PROMOTION_INVALID", "Revisa el tipo, valor, moneda, objetivos y periodo de vigencia de la promoción."],
  ["PROMOTION_BRANCH_SCOPE_INVALID", 422, "PROMOTION_BRANCH_SCOPE_INVALID", "Una promoción debe dirigirse únicamente a sucursales de la organización."],
  ["PROMOTION_TARGET_REQUIRED", 422, "PROMOTION_TARGET_REQUIRED", "Selecciona al menos un producto o una categoría para definir a quién aplica la promoción."],
]

export function mapPostgresError(error) {
  const message = String(error?.message ?? "")
  const businessRule = BUSINESS_RULE_ERRORS.find(([marker]) => message.includes(marker))
  if (businessRule) {
    const [, status, code, userMessage] = businessRule
    return new AppError(status, code, userMessage)
  }
  if (error?.code === "23505") {
    return new AppError(409, "RESOURCE_ALREADY_EXISTS", "Ya existe un registro con esos datos. Revisa los códigos y nombres únicos.")
  }
  return null
}

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
    const mappedError = mapPostgresError(error);
    if (mappedError) {
      Object.defineProperty(mappedError, "cause", { value: error });
      throw mappedError;
    }
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
