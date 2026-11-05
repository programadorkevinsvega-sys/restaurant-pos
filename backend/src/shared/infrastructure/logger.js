import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
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
