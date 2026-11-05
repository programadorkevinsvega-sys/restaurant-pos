import { ZodError } from "zod"
import { AppError } from "../../domain/app-error.js"

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "La ruta solicitada no existe.", requestId: request.id },
  })
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error)

  const isValidationError = error instanceof ZodError
  const isMalformedJson = error instanceof SyntaxError && error.status === 400
  const status = isValidationError || isMalformedJson ? 400 : error instanceof AppError ? error.status : 500
  const code = isValidationError || isMalformedJson ? "VALIDATION_ERROR" : error instanceof AppError ? error.code : "INTERNAL_ERROR"
  const message = isValidationError
    ? "La solicitud contiene datos inválidos."
    : isMalformedJson
      ? "El JSON de la solicitud no es válido."
    : error instanceof AppError
      ? error.message
      : "Ocurrió un error interno. Comparte el identificador de solicitud con soporte."

  if (status >= 500) {
    request.log?.error({ requestId: request.id, code }, "Backend request failed")
  }

  response.status(status).json({
    error: {
      code,
      message,
      requestId: request.id,
      ...(error instanceof AppError && error.details ? { details: error.details } : {}),
    },
  })
}
