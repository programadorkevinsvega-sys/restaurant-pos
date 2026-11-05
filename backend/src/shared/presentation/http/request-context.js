import { randomUUID } from "node:crypto"

export function requestContext(request, response, next) {
  const requestId = randomUUID()
  request.id = requestId
  response.setHeader("X-Request-Id", requestId)
  next()
}
