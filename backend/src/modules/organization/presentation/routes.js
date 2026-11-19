import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const optionalText = (max) => z.string().trim().min(1).max(max).nullable().optional()
const optionalPhone = z.string()
  .trim()
  .min(7)
  .max(32)
  .regex(/^\+?[0-9\s().-]+$/)
  .nullable()
  .optional()
const optionalEmail = z.string().trim().email().max(254).toLowerCase().nullable().optional()
const optionalWebsite = z.string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"))
  .nullable()
  .optional()

const addressSchema = z.object({
  line_1: optionalText(160),
  line_2: optionalText(160),
  locality: optionalText(120),
  administrative_area: optionalText(120),
  postal_code: optionalText(32),
  country_code: z.string().trim().regex(/^[A-Z]{2}$/).nullable().optional(),
}).strict()

export const organizationProfileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  commercial_name: optionalText(160),
  contact_email: optionalEmail,
  contact_phone: optionalPhone,
  website_url: optionalWebsite,
  headquarters_address: addressSchema.nullable().optional(),
}).strict()

export const updateOrganizationProfileSchema = organizationProfileSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Debes proporcionar al menos un campo para actualizar.",
)

export function createOrganizationRoutes(organization, authenticate, authorize, writesLimiter) {
  const router = Router()
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store")
    next()
  })

  router.get("/", authenticate, asyncHandler(async (request, response) => {
    response.json(await organization.getProfile(request.auth))
  }))

  router.post(
    "/bootstrap",
    authenticate,
    authorize("admin"),
    writesLimiter,
    validateRequest({ body: organizationProfileSchema }),
    asyncHandler(async (request, response) => {
      const result = await organization.bootstrapProfile(request.validated.body, request.auth)
      response.status(201).json(result)
    }),
  )

  router.patch(
    "/",
    authenticate,
    writesLimiter,
    validateRequest({ body: updateOrganizationProfileSchema }),
    asyncHandler(async (request, response) => {
      const result = await organization.updateProfile(request.validated.body, request.auth)
      response.json(result)
    }),
  )

  return router
}
