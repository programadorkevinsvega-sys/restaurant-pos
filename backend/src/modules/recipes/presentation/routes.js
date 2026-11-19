import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const unitCode = z.string().trim().regex(/^[a-z][a-z0-9._-]{0,15}$/)
const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  unit_code: unitCode,
}).strict()
const quantitySchema = z.string()
  .regex(/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/)
  .refine((value) => Number(value) > 0, "La cantidad debe ser mayor que cero.")
const recipeSchema = z.object({
  preparation_instructions: z.string().trim().max(10000).default(""),
  ingredients: z.array(z.object({
    ingredient_id: uuid,
    quantity: quantitySchema,
  }).strict()).min(1).max(100).superRefine((lines, context) => {
    const seen = new Set()
    lines.forEach((line, index) => {
      if (seen.has(line.ingredient_id)) {
        context.addIssue({
          code: "custom",
          path: [index, "ingredient_id"],
          message: "Un ingrediente solo puede aparecer una vez en la receta.",
        })
      }
      seen.add(line.ingredient_id)
    })
  }),
}).strict()

export function createAdminRecipeRoutes(recipes, authenticate, writesLimiter) {
  const router = Router()
  router.use(authenticate)

  router.get("/ingredients", asyncHandler(async (request, response) => {
    response.json(await recipes.listIngredients(request.auth))
  }))
  router.post("/ingredients", writesLimiter, validateRequest({ body: ingredientSchema }),
    asyncHandler(async (request, response) => response.status(201).json(
      await recipes.createIngredient(request.validated.body, request.auth),
    )))
  router.patch("/ingredients/:id", writesLimiter, validateRequest({
    params: z.object({ id: uuid }).strict(),
    body: ingredientSchema,
  }), asyncHandler(async (request, response) => response.json(
    await recipes.updateIngredient(request.validated.params.id, request.validated.body, request.auth),
  )))
  router.delete("/ingredients/:id", writesLimiter, validateRequest({
    params: z.object({ id: uuid }).strict(),
  }), asyncHandler(async (request, response) => response.json(
    await recipes.deactivateIngredient(request.validated.params.id, request.auth),
  )))

  router.get("/products/:productId", validateRequest({
    params: z.object({ productId: uuid }).strict(),
  }), asyncHandler(async (request, response) => {
    response.json(await recipes.getRecipe(request.validated.params.productId, request.auth))
  }))
  router.put("/products/:productId", writesLimiter, validateRequest({
    params: z.object({ productId: uuid }).strict(),
    body: recipeSchema,
  }), asyncHandler(async (request, response) => response.json(
    await recipes.saveRecipe(request.validated.params.productId, request.validated.body, request.auth),
  )))

  return router
}
