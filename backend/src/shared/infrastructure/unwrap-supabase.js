import { AppError } from "../domain/app-error.js"
import { logger } from "./logger.js"

export function unwrapSupabase(result) {
  if (result.error) {
    logger.error({ code: result.error.code ?? "UNKNOWN" }, "Supabase operation failed")
    throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo completar la operación.")
  }
  return result.data
}
