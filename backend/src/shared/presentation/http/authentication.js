import { AppError } from "../../domain/app-error.js"
import { asyncHandler } from "./async-handler.js"
import { readCookie } from "./cookies.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function authenticate(auth, cookieName) {
  return asyncHandler(async (request, response, next) => {
    const accessToken = readCookie(request, cookieName)
    if (!accessToken) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    }

    const activeBranchId = request.get("x-active-branch-id")?.trim() || null
    if (activeBranchId && !uuidPattern.test(activeBranchId)) {
      throw new AppError(400, "INVALID_ACTIVE_BRANCH", "El identificador de la sucursal activa no es válido.")
    }

    const user = await auth.getUser(accessToken)
    request.auth = {
      userId: user.id,
      role: user.role,
      activeBranchId,
    }
    next()
  })
}

export function authorize(...allowedRoles) {
  return function authorizeRole(request, response, next) {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      return next(new AppError(403, "FORBIDDEN", "No tienes permiso para esta operación."))
    }
    next()
  }
}
