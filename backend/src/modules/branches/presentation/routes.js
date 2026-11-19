import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const branchIdParams = z.object({ branchId: z.string().uuid() })
const userAssignmentParams = branchIdParams.extend({ userId: z.string().uuid() })
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

export const branchStatusSchema = z.object({
  status: z.enum(["active", "suspended", "closed"]),
}).strict()

export function createBranchRoutes(branches, authenticate, writesLimiter) {
  const router = Router()
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store")
    next()
  })

  router.get("/available", authenticate, asyncHandler(async (request, response) => {
    response.json(await branches.listAvailable(request.auth))
  }))

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
    "/:branchId/status",
    authenticate,
    writesLimiter,
    validateRequest({ params: branchIdParams, body: branchStatusSchema }),
    asyncHandler(async (request, response) => {
      response.json({
        branch: await branches.changeStatus(
          request.validated.params.branchId,
          request.validated.body.status,
          request.auth,
        ),
      })
    }),
  )

  router.get(
    "/:branchId/lifecycle",
    authenticate,
    validateRequest({ params: branchIdParams }),
    asyncHandler(async (request, response) => {
      response.json(await branches.listLifecycleEvents(
        request.validated.params.branchId,
        request.auth,
      ))
    }),
  )

  router.get(
    "/:branchId/users",
    authenticate,
    validateRequest({ params: branchIdParams }),
    asyncHandler(async (request, response) => {
      response.json(await branches.listUsers(request.validated.params.branchId, request.auth))
    }),
  )

  router.post(
    "/:branchId/users/:userId",
    authenticate,
    writesLimiter,
    validateRequest({ params: userAssignmentParams }),
    asyncHandler(async (request, response) => {
      response.status(201).json(await branches.assignUser(
        request.validated.params.branchId,
        request.validated.params.userId,
        request.auth,
      ))
    }),
  )

  router.delete(
    "/:branchId/users/:userId",
    authenticate,
    writesLimiter,
    validateRequest({ params: userAssignmentParams }),
    asyncHandler(async (request, response) => {
      response.json(await branches.removeUser(
        request.validated.params.branchId,
        request.validated.params.userId,
        request.auth,
      ))
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
