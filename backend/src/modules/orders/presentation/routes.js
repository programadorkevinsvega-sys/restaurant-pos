import { Router } from "express"
import { z } from "zod"
import { AppError } from "../../../shared/domain/app-error.js"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const statusSchema = z.enum(["pending", "preparing", "ready", "completed", "cancelled"])
const createOrderSchema = z.object({
  table_number: z.string().trim().min(1).max(30),
  customer_name: z.string().trim().max(120).optional().nullable(),
  order_type: z.enum(["Comer aquí", "Para llevar", "A domicilio"]),
  items: z.array(z.object({
    id: uuid,
    quantity: z.coerce.number().int().min(1).max(50),
  })).min(1).max(50),
  delivery_address: z.string().trim().min(5).max(300).optional(),
  delivery_phone: z.string().trim().min(5).max(32).optional(),
})

export function createOrderRoutes(orders, authenticate, authorize, writesLimiter) {
  const router = Router()
  router.use(authenticate, authorize("staff", "admin"))

  router.get("/", asyncHandler(async (request, response) => {
    const parsed = z.object({
      status: statusSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(request.query)
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Los filtros del pedido no son válidos.")
    response.json(await orders.listOrders(parsed.data))
  }))

  router.post(
    "/",
    writesLimiter,
    validateRequest({ body: createOrderSchema }),
    asyncHandler(async (request, response) => {
      const input = request.validated.body
      if (input.order_type === "A domicilio" && (!input.delivery_address || !input.delivery_phone)) {
        throw new AppError(400, "DELIVERY_DETAILS_REQUIRED", "Para pedidos a domicilio se requiere dirección y teléfono.")
      }
      response.status(201).json(await orders.createOrder(input))
    }),
  )

  router.put(
    "/:id/status",
    writesLimiter,
    validateRequest({
      params: z.object({ id: uuid }),
      body: z.object({ status: statusSchema }),
    }),
    asyncHandler(async (request, response) => {
      const { id } = request.validated.params
      const { status } = request.validated.body
      response.json(await orders.updateStatus(id, status))
    }),
  )

  return router
}
