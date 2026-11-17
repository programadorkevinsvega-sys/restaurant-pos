import "dotenv/config"
import * as Sentry from "@sentry/node"
import { nodeProfilingIntegration } from "@sentry/profiling-node"

delete process.env.MIGRATIONS_DATABASE_URL

const dsn = process.env.SENTRY_DSN
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.5)
const profilesSampleRate = Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0.1)
const sensitiveLogField = /authorization|cookie|password|token|secret|dsn|api.?key|database.?url|redis.?url|connection.?string/i

function redactLogAttributes(attributes) {
  if (Array.isArray(attributes)) {
    return attributes.map((value) => redactLogAttributes(value))
  }
  if (!attributes || typeof attributes !== "object") return attributes

  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [
    key,
    sensitiveLogField.test(key) ? "[Filtered]" : redactLogAttributes(value),
  ]))
}

if (!Number.isFinite(tracesSampleRate) || tracesSampleRate < 0 || tracesSampleRate > 1) {
  throw new Error("SENTRY_TRACES_SAMPLE_RATE debe ser un número entre 0 y 1.")
}

if (!Number.isFinite(profilesSampleRate) || profilesSampleRate < 0 || profilesSampleRate > 1) {
  throw new Error("SENTRY_PROFILES_SAMPLE_RATE debe ser un número entre 0 y 1.")
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate,
    profileSessionSampleRate: profilesSampleRate,
    profileLifecycle: "trace",
    integrations: [
      Sentry.nodeRuntimeMetricsIntegration(),
      nodeProfilingIntegration(),
      Sentry.pinoIntegration({ log: { levels: ["info", "warn", "error"] } }),
    ],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
    },
    beforeSendLog(log) {
      return {
        ...log,
        attributes: redactLogAttributes(log.attributes),
      }
    },
  })
}
