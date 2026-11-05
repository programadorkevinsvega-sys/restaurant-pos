import { AppError } from "../../domain/app-error.js"
import { asyncHandler } from "./async-handler.js"
import { readCookie } from "./cookies.js"

export function authenticate(authClient, cookieName) {
  return asyncHandler(async (request, response, next) => {
    const accessToken = readCookie(request, cookieName)
    if (!accessToken) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    }

    const { data, error } = await authClient.auth.getUser(accessToken)
    if (error && ![400, 401, 403, 422].includes(error.status)) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "No se pudo validar la sesión.")
    }
    if (error || !data.user) {
      throw new AppError(401, "INVALID_TOKEN", "La sesión no es válida o expiró.")
    }

    const role = data.user.app_metadata?.role
    if (!["staff", "admin"].includes(role)) {
      throw new AppError(403, "ROLE_REQUIRED", "La cuenta no tiene acceso al sistema.")
    }

    request.auth = { userId: data.user.id, role }
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
