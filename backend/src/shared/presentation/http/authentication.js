import { AppError } from "../../domain/app-error.js"
import { asyncHandler } from "./async-handler.js"
import { readCookie } from "./cookies.js"

export function authenticate(auth, cookieName) {
  return asyncHandler(async (request, response, next) => {
    const accessToken = readCookie(request, cookieName)
    if (!accessToken) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    }

    const user = await auth.getUser(accessToken)
    request.auth = { userId: user.id, role: user.role }
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
