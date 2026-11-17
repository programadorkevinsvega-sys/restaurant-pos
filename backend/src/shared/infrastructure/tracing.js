import * as Sentry from "@sentry/node"

export function traceOperation(name, callback) {
  return Sentry.startSpan({ op: "app.action", name }, callback)
}
