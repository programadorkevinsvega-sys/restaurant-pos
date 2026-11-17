import * as Sentry from "@sentry/node"

export function getSentryTraceId() {
  const activeSpan = Sentry.getActiveSpan()
  if (!activeSpan) return undefined

  return Sentry.spanToTraceHeader(activeSpan).split("-")[0]
}
