import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { AppError } from "../../../shared/domain/app-error.js"
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

function requireActiveBranch(request) {
  if (!request.auth?.activeBranchId) {
    throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de consultar el catálogo.")
  }
}

export function createCatalogRoutes(catalog, authenticate) {
  const categories = Router()
  categories.use(authenticate)
  categories.get("/", asyncHandler(async (request, response) => {
    requireActiveBranch(request)
    response.json(await catalog.listCategories(request.auth))
  }))
  categories.post(
    "/",
    validateRequest({ body: categorySchema }),
    asyncHandler(async (request, response) => {
      response.status(201).json(await catalog.createCategory(request.validated.body, request.auth))
    }),
  )

  const products = Router()
  products.use(authenticate)
  products.get("/", asyncHandler(async (request, response) => {
    requireActiveBranch(request)
    const query = z.object({ category_id: uuid.optional() }).strict().safeParse(request.query)
    if (!query.success) throw new AppError(400, "VALIDATION_ERROR", "El filtro de categoría no es válido.")
    response.json(await catalog.listProducts(query.data.category_id, request.auth))
  }))
  products.get("/:id", asyncHandler(async (request, response) => {
    requireActiveBranch(request)
    const parsedId = uuid.safeParse(request.params.id)
    if (!parsedId.success) throw new AppError(400, "VALIDATION_ERROR", "El identificador no es válido.")
    const product = await catalog.findProduct(parsedId.data, request.auth)
    if (!product) throw new AppError(404, "NOT_FOUND", "Producto no encontrado en la sucursal activa.")
    response.json(product)
  }))
  products.post(
    "/",
    validateRequest({ body: productSchema }),
    asyncHandler(async (request, response) => {
      response.status(201).json(await catalog.createProduct(request.validated.body, request.auth))
    }),
  )

  return { categories, products }
}
