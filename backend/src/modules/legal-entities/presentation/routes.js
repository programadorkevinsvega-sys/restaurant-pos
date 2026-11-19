import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const optionalText = (max) => z.string().trim().min(1).max(max).nullable().optional()
const optionalEmail = z.string().trim().email().max(254).toLowerCase().nullable().optional()
const optionalPhone = z.string().trim().min(7).max(32).regex(/^\+?[0-9\s().-]+$/).nullable().optional()
const addressSchema = z.object({
  line_1: optionalText(160),
  line_2: optionalText(160),
  locality: optionalText(120),
  administrative_area: optionalText(120),
  postal_code: optionalText(32),
  country_code: z.string().trim().regex(/^[A-Z]{2}$/).nullable().optional(),
}).strict()

export const legalEntitySchema = z.object({
  legal_name: z.string().trim().min(2).max(180),
  commercial_name: optionalText(180),
  tax_country_code: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  tax_identifier_type: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,23}$/),
  tax_identifier: z.string().trim().min(1).max(80),
  registered_address: addressSchema.nullable().optional(),
  contact_email: optionalEmail,
  contact_phone: optionalPhone,
}).strict()

export function createLegalEntityRoutes(legalEntities, authenticate, writesLimiter) {
  const router = Router()
  router.get("/", authenticate, asyncHandler(async (request, response) => {
    response.json(await legalEntities.list(request.auth))
  }))

  router.post(
    "/",
    authenticate,
    writesLimiter,
    validateRequest({ body: legalEntitySchema }),
    asyncHandler(async (request, response) => {
      response.status(201).json({ legal_entity: await legalEntities.create(request.validated.body, request.auth) })
    }),
  )

  router.put(
    "/:id",
    authenticate,
    writesLimiter,
    validateRequest({
      params: z.object({ id: z.string().uuid() }),
      body: legalEntitySchema,
    }),
    asyncHandler(async (request, response) => {
      response.json({
        legal_entity: await legalEntities.update(
          request.validated.params.id,
          request.validated.body,
          request.auth,
        ),
      })
    }),
  )

  return router
}
