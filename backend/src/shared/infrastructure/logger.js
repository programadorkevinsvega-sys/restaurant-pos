import pino from "pino"
import { getSentryTraceId } from "./sentry-context.js"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  mixin() {
    const traceId = getSentryTraceId()
    return traceId ? { trace_id: traceId } : {}
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-api-key",
      "req.body.password",
      "req.body.token",
      "req.body.access_token",
      "req.body.refresh_token",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req(request) {
      return {
        id: request.id,
        method: request.method,
        path: request.url?.split("?")[0],
      }
    },
    res(response) {
      return { statusCode: response.statusCode }
    },
  },
})
