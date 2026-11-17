import { randomUUID } from "node:crypto"
import { getSentryTraceId } from "../../infrastructure/sentry-context.js"

export function requestContext(request, response, next) {
  const requestId = randomUUID()
  request.id = requestId
  request.traceId = getSentryTraceId()
  response.setHeader("X-Request-Id", requestId)
  next()
}
