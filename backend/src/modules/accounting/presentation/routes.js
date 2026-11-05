import { Router } from "express"
import { z } from "zod"
import { AppError } from "../../../shared/domain/app-error.js"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"

export function createAccountingRoutes(accounting, authenticate, authorize) {
  const router = Router()
  router.use(authenticate, authorize("admin"))

  const dateRange = z.object({
    start_date: z.iso.datetime().optional(),
    end_date: z.iso.datetime().optional(),
  }).refine((value) => !value.start_date || !value.end_date || value.start_date <= value.end_date)

  router.get("/sales", asyncHandler(async (request, response) => {
    const parsed = dateRange.extend({ period: z.enum(["hourly", "daily", "monthly"]).default("daily") })
      .safeParse(request.query)
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "El período del reporte no es válido.")
    const end = parsed.data.end_date ?? new Date().toISOString()
    const start = parsed.data.start_date ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    if (Date.parse(end) - Date.parse(start) > 366 * 24 * 60 * 60 * 1000) {
      throw new AppError(400, "DATE_RANGE_TOO_LARGE", "El intervalo del reporte no puede superar un año.")
    }
    response.json(await accounting.salesReport({ ...parsed.data, start_date: start, end_date: end }))
  }))

  router.get("/products", asyncHandler(async (request, response) => {
    const parsed = dateRange.safeParse(request.query)
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "El período del reporte no es válido.")
    const end = parsed.data.end_date ?? new Date().toISOString()
    const start = parsed.data.start_date ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    if (Date.parse(end) - Date.parse(start) > 366 * 24 * 60 * 60 * 1000) {
      throw new AppError(400, "DATE_RANGE_TOO_LARGE", "El intervalo del reporte no puede superar un año.")
    }
    response.json(await accounting.bestSellingProducts({ start_date: start, end_date: end }))
  }))

  return router
}
