import { Router } from "express"
import { z } from "zod"
import { AppError } from "../../../shared/domain/app-error.js"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const tableStatus = z.enum(["available", "occupied", "reserved", "maintenance"])
const reservationStatus = z.enum(["confirmed", "seated", "completed", "cancelled", "no_show"])
const orderStatus = z.enum(["pending", "preparing", "ready", "completed", "cancelled"])

export function createOperationsRoutes(operations, authenticate, authorize, writesLimiter) {
  const tables = Router()
  tables.use(authenticate, authorize("staff", "admin"))
  tables.get("/", asyncHandler(async (request, response) => {
    response.json(await operations.listTables(request.auth))
  }))
  tables.post(
    "/",
    writesLimiter,
    validateRequest({ body: z.object({
      number: z.string().trim().min(1).max(30),
      capacity: z.coerce.number().int().min(1).max(100),
    }).strict() }),
    asyncHandler(async (request, response) => response.status(201).json(
      await operations.createTable(request.validated.body, request.auth),
    )),
  )
  tables.put(
    "/:id/status",
    writesLimiter,
    validateRequest({ params: z.object({ id: uuid }), body: z.object({
      status: tableStatus,
      current_order_id: uuid.nullable().optional(),
    }).strict() }),
    asyncHandler(async (request, response) => response.json(
      await operations.updateTable(
        request.validated.params.id,
        request.validated.body,
        request.auth,
      ),
    )),
  )

  const reservations = Router()
  reservations.use(authenticate, authorize("staff", "admin"))
  reservations.get("/", asyncHandler(async (request, response) => {
    const parsed = z.object({
      date: z.iso.date().optional(),
      status: reservationStatus.optional(),
    }).strict().safeParse(request.query)
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Los filtros de reservación no son válidos.")
    response.json(await operations.listReservations(parsed.data, request.auth))
  }))
  reservations.post(
    "/",
    writesLimiter,
    validateRequest({ body: z.object({
      customer_name: z.string().trim().min(1).max(120),
      customer_phone: z.string().trim().max(32).optional().nullable(),
      customer_email: z.email().max(254).optional().nullable(),
      table_id: uuid,
      reservation_date: z.iso.datetime(),
      party_size: z.coerce.number().int().min(1).max(100),
      notes: z.string().trim().max(1000).optional().nullable(),
    }).strict() }),
    asyncHandler(async (request, response) => response.status(201).json(
      await operations.createReservation(request.validated.body, request.auth),
    )),
  )
  reservations.put(
    "/:id/status",
    writesLimiter,
    validateRequest({ params: z.object({ id: uuid }), body: z.object({ status: reservationStatus }).strict() }),
    asyncHandler(async (request, response) => response.json(
      await operations.updateReservation(
        request.validated.params.id,
        request.validated.body.status,
        request.auth,
      ),
    )),
  )

  const delivery = Router()
  delivery.use(authenticate, authorize("staff", "admin"))
  delivery.get("/", asyncHandler(async (request, response) => {
    const parsed = z.object({ status: orderStatus.optional() }).safeParse(request.query)
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "El estado de entrega no es válido.")
    if (!request.auth.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de consultar entregas.")
    }
    response.json(await operations.listDeliveries(parsed.data.status, request.auth))
  }))
  delivery.post(
    "/assign",
    writesLimiter,
    validateRequest({ body: z.object({
      order_id: uuid,
      driver_name: z.string().trim().min(1).max(120),
      driver_phone: z.string().trim().max(32).optional().nullable(),
      estimated_time: z.coerce.number().int().min(1).max(1440).optional().nullable(),
    }).strict() }),
    asyncHandler(async (request, response) => {
      if (!request.auth.activeBranchId) {
        throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de asignar entregas.")
      }
      response.json(await operations.assignDriver(request.validated.body, request.auth))
    }),
  )

  const admin = Router()
  admin.use(authenticate, authorize("admin"))
  admin.get("/settings", asyncHandler(async (request, response) => response.json(await operations.getSettings())))
  admin.put(
    "/settings",
    writesLimiter,
    validateRequest({ body: z.record(z.string().trim().min(1).max(80), z.string().trim().max(1000)).refine(
      (settings) => Object.keys(settings).length > 0 && Object.keys(settings).length <= 50,
    ) }),
    asyncHandler(async (request, response) => response.json(await operations.updateSettings(request.validated.body))),
  )

  return { tables, reservations, delivery, admin }
}
