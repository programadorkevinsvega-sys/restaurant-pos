import assert from "node:assert/strict"
import test from "node:test"
import { createApp } from "../src/app.js"

test("HTTP composition exposes health and protects operational routes", async () => {
  const { app, close } = await createApp({
    NODE_ENV: "test",
    PORT: 0,
    AUTH_CSRF_SECRET: "server-only-test-secret-that-is-long-enough",
    DATABASE_URL: "postgresql://restaurant_pos_app:secret@localhost:5432/restaurant_pos",
    PG_POOL_MAX: 10,
    corsOrigins: new Set(["https://pos.example.test"]),
    AUTH_COOKIE_SAME_SITE: "Lax",
    secureCookies: false,
    cookieNames: { access: "pos_access", refresh: "pos_refresh", csrf: "pos_csrf" },
  })
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once("listening", resolve))
    const address = server.address()
    const baseUrl = `http://127.0.0.1:${address.port}`

    const health = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://pos.example.test" },
    })
    assert.equal(health.status, 200)
    assert.equal((await health.json()).status, "ok")
    assert.equal(health.headers.get("x-powered-by"), null)
    assert.equal(health.headers.get("access-control-allow-origin"), "https://pos.example.test")

    const preflight = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://pos.example.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-csrf-token",
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get("access-control-allow-origin"), "https://pos.example.test")

    const deniedOrigin = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: "https://attacker.example" },
    })
    assert.equal(deniedOrigin.status, 403)

    const deniedPreflight = await fetch(`${baseUrl}/api/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://attacker.example",
        "Access-Control-Request-Method": "POST",
      },
    })
    assert.equal(deniedPreflight.status, 403)

    const missingOrigin = await fetch(`${baseUrl}/api/health`)
    assert.equal(missingOrigin.status, 200)
    assert.equal(missingOrigin.headers.get("access-control-allow-origin"), null)

    const protectedRoute = await fetch(`${baseUrl}/api/orders`, {
      headers: { Origin: "https://pos.example.test" },
    })
    assert.equal(protectedRoute.status, 401)
    const failure = await protectedRoute.json()
    assert.equal(failure.error.code, "AUTHENTICATION_REQUIRED")
    assert.ok(failure.error.requestId)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await close()
  }
})
