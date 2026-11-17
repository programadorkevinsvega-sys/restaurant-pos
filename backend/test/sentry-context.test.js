import assert from "node:assert/strict"
import test from "node:test"
import * as Sentry from "@sentry/node"
import { getSentryTraceId } from "../src/shared/infrastructure/sentry-context.js"
import { requestContext } from "../src/shared/presentation/http/request-context.js"

test("Sentry trace IDs are available to structured logs inside an active span", () => {
  const traceId = Sentry.startSpan({ name: "test-span" }, () => getSentryTraceId())

  assert.match(traceId, /^[0-9a-f]{32}$/)
})

test("trace ID lookup is empty outside a Sentry span", () => {
  assert.equal(getSentryTraceId(), undefined)
})

test("request context captures the active trace ID alongside the request ID", () => {
  const context = Sentry.startSpan({ name: "request" }, () => {
    const request = {}
    const responseHeaders = {}
    requestContext(request, {
      setHeader: (name, value) => { responseHeaders[name] = value },
    }, () => {})
    return { request, responseHeaders }
  })

  assert.match(context.request.traceId, /^[0-9a-f]{32}$/)
  assert.match(context.responseHeaders["X-Request-Id"], /^[0-9a-f-]{36}$/)
})
