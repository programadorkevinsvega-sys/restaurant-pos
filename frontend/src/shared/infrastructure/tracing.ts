import * as Sentry from "@sentry/nextjs"

export function traceOperation<T>(name: string, callback: () => T): T {
  return Sentry.startSpan({ op: "app.action", name }, callback)
}
