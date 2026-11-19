import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(80).optional().nullable(),
}).strict()
const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  price: z.coerce.number().finite().positive().max(100000),
  image_url: z.string().url().max(2048).optional().nullable(),
  discount_percentage: z.coerce.number().int().min(0).max(100).default(0),
  type: z.enum(["Veg", "Non Veg"]),
  category_id: uuid,
}).strict()

export function createAdminCatalogRoutes(catalog, authenticate, _authorize, writesLimiter) {
  const router = Router()
  router.use(authenticate)

  router.get("/catalog/products", asyncHandler(async (request, response) => {
    response.json(await catalog.listCorporateProducts(request.auth))
  }))

  router.get(
    "/catalog/branches/:branchId/products",
    validateRequest({ params: z.object({ branchId: uuid }).strict() }),
    asyncHandler(async (request, response) => {
      response.json(await catalog.listBranchProducts(request.validated.params.branchId, request.auth))
    }),
  )

  router.put(
    "/catalog/branches/:branchId/products/:productId",
    writesLimiter,
    validateRequest({
      params: z.object({ branchId: uuid, productId: uuid }).strict(),
      body: z.object({ enabled: z.boolean() }).strict(),
    }),
    asyncHandler(async (request, response) => {
      const { branchId, productId } = request.validated.params
      response.json(await catalog.setBranchProductEnabled(
        branchId,
        productId,
        request.validated.body.enabled,
        request.auth,
      ))
    }),
  )

  router.post(
    "/categories",
    writesLimiter,
    validateRequest({ body: categorySchema }),
    asyncHandler(async (request, response) => response.status(201).json(
      await catalog.createCategory(request.validated.body, request.auth),
    )),
  )
  router.post(
    "/products",
    writesLimiter,
    validateRequest({ body: productSchema }),
    asyncHandler(async (request, response) => response.status(201).json(
      await catalog.createProduct(request.validated.body, request.auth),
    )),
  )
  return router
}
