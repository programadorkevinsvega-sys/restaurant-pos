import { Router } from "express"
import { z } from "zod"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const uuid = z.string().uuid()
const groupSchema = z.object({
  kind: z.enum(["presentation", "modifier"]),
  name: z.string().trim().min(1).max(100),
  min_selections: z.number().int().min(0).max(10),
  max_selections: z.number().int().min(1).max(10),
  position: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(false),
}).strict().superRefine((group, context) => {
  if (group.min_selections > group.max_selections) {
    context.addIssue({ code: "custom", path: ["min_selections"], message: "El mínimo no puede superar el máximo." })
  }
  if (group.kind === "presentation" && (group.min_selections !== 1 || group.max_selections !== 1)) {
    context.addIssue({ code: "custom", path: ["kind"], message: "Una presentación requiere exactamente una opción." })
  }
})
const optionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  position: z.number().int().min(0).max(999).default(0),
  is_active: z.boolean().default(true),
}).strict()
const branchAvailabilitySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(500),
}).strict()
const resetOverrideSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict()

export function createAdminProductOptionRoutes(options, authenticate, writesLimiter) {
  const router = Router()
  router.use(authenticate)

  router.get("/products/:productId", validateRequest({
    params: z.object({ productId: uuid }).strict(),
  }), asyncHandler(async (request, response) => {
    response.json(await options.listProductOptions(request.validated.params.productId, request.auth))
  }))

  router.post("/products/:productId/groups", writesLimiter, validateRequest({
    params: z.object({ productId: uuid }).strict(),
    body: groupSchema,
  }), asyncHandler(async (request, response) => {
    response.status(201).json(await options.createGroup(
      request.validated.params.productId, request.validated.body, request.auth,
    ))
  }))

  router.patch("/groups/:groupId", writesLimiter, validateRequest({
    params: z.object({ groupId: uuid }).strict(),
    body: groupSchema,
  }), asyncHandler(async (request, response) => {
    response.json(await options.updateGroup(
      request.validated.params.groupId, request.validated.body, request.auth,
    ))
  }))

  router.post("/groups/:groupId/options", writesLimiter, validateRequest({
    params: z.object({ groupId: uuid }).strict(),
    body: optionSchema,
  }), asyncHandler(async (request, response) => {
    response.status(201).json(await options.createOption(
      request.validated.params.groupId, request.validated.body, request.auth,
    ))
  }))

  router.patch("/options/:optionId", writesLimiter, validateRequest({
    params: z.object({ optionId: uuid }).strict(),
    body: optionSchema,
  }), asyncHandler(async (request, response) => {
    response.json(await options.updateOption(
      request.validated.params.optionId, request.validated.body, request.auth,
    ))
  }))

  router.get("/branches/:branchId/options", validateRequest({
    params: z.object({ branchId: uuid }).strict(),
  }), asyncHandler(async (request, response) => {
    response.json(await options.listBranchOptions(request.validated.params.branchId, request.auth))
  }))

  router.put("/branches/:branchId/options/:optionId", writesLimiter, validateRequest({
    params: z.object({ branchId: uuid, optionId: uuid }).strict(),
    body: branchAvailabilitySchema,
  }), asyncHandler(async (request, response) => {
    response.json(await options.setBranchOptionAvailability(
      request.validated.params.branchId, request.validated.params.optionId,
      request.validated.body, request.auth,
    ))
  }))

  router.delete("/branches/:branchId/options/:optionId", writesLimiter, validateRequest({
    params: z.object({ branchId: uuid, optionId: uuid }).strict(),
    body: resetOverrideSchema,
  }), asyncHandler(async (request, response) => {
    response.json(await options.clearBranchOptionOverride(
      request.validated.params.branchId, request.validated.params.optionId,
      request.validated.body.reason, request.auth,
    ))
  }))

  return router
}

export function createPosProductOptionRoutes(options, authenticate, authorize) {
  const router = Router()
  router.use(authenticate, authorize("staff", "admin"))
  router.get("/:productId/options", validateRequest({
    params: z.object({ productId: uuid }).strict(),
  }), asyncHandler(async (request, response) => {
    response.set("Cache-Control", "no-store")
    response.json(await options.listForActiveBranch(request.validated.params.productId, request.auth))
  }))
  return router
}
