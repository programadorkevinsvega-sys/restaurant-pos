import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const branchIdParams = z.object({ branchId: z.string().uuid() })
const associationParams = branchIdParams.extend({ legalEntityId: z.string().uuid() })

export const branchSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
  legal_entity_ids: z.array(z.string().uuid()).min(1).max(50).refine(
    (ids) => new Set(ids).size === ids.length,
    "No repitas entidades legales en la misma sucursal.",
  ),
}).strict()

export const updateBranchSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(160),
}).strict()

export function createBranchRoutes(branches, authenticate, writesLimiter) {
  const router = Router()
  router.get("/", authenticate, asyncHandler(async (request, response) => {
    response.json(await branches.list(request.auth))
  }))

  router.post(
    "/",
    authenticate,
    writesLimiter,
    validateRequest({ body: branchSchema }),
    asyncHandler(async (request, response) => {
      response.status(201).json({ branch: await branches.create(request.validated.body, request.auth) })
    }),
  )

  router.put(
    "/:branchId",
    authenticate,
    writesLimiter,
    validateRequest({ params: branchIdParams, body: updateBranchSchema }),
    asyncHandler(async (request, response) => {
      response.json({
        branch: await branches.update(request.validated.params.branchId, request.validated.body, request.auth),
      })
    }),
  )

  router.post(
    "/:branchId/legal-entities/:legalEntityId",
    authenticate,
    writesLimiter,
    validateRequest({ params: associationParams }),
    asyncHandler(async (request, response) => {
      response.status(201).json({
        branch: await branches.assignLegalEntity(
          request.validated.params.branchId,
          request.validated.params.legalEntityId,
          request.auth,
        ),
      })
    }),
  )

  router.delete(
    "/:branchId/legal-entities/:legalEntityId",
    authenticate,
    writesLimiter,
    validateRequest({ params: associationParams }),
    asyncHandler(async (request, response) => {
      response.json({
        branch: await branches.removeLegalEntity(
          request.validated.params.branchId,
          request.validated.params.legalEntityId,
          request.auth,
        ),
      })
    }),
  )

  return router
}
