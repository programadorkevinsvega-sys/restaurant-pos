import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(80).optional().nullable(),
})
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().finite().positive().max(100000),
  image_url: z.string().url().max(2048).optional().nullable(),
  discount_percentage: z.coerce.number().int().min(0).max(100).default(0),
  type: z.enum(["Veg", "Non Veg"]),
  category_id: uuid,
})

export function createAdminCatalogRoutes(catalog, authenticate, _authorize, writesLimiter) {
  const router = Router()
  router.use(authenticate)
  router.post("/categories", writesLimiter, validateRequest({ body: categorySchema }),
    asyncHandler(async (request, response) => response.status(201).json(
      await catalog.createCategory(request.validated.body),
    )))
  router.post("/products", writesLimiter, validateRequest({ body: productSchema }),
    asyncHandler(async (request, response) => response.status(201).json(
      await catalog.createProduct(request.validated.body),
    )))
  return router
}
