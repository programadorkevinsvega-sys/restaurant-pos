import { AppError } from "../../domain/app-error.js"

export function validateRequest(schemas) {
  return function validate(request, response, next) {
    const validated = {}

    for (const [part, schema] of Object.entries(schemas)) {
      const result = schema.safeParse(request[part])
      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }))
        return next(new AppError(400, "VALIDATION_ERROR", "La solicitud contiene datos inválidos.", details))
      }
      validated[part] = result.data
    }

    request.validated = validated
    next()
  }
}
