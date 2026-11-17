import assert from "node:assert/strict"
import express from "express"
import test from "node:test"
import { createAuthRoutes } from "../src/modules/auth/presentation/routes.js"
import { csrfProtection } from "../src/shared/presentation/http/csrf.js"
import { errorHandler } from "../src/shared/presentation/http/error-handler.js"

const config = {
  SUPABASE_SERVICE_ROLE_KEY: "server-side-test-secret",
  AUTH_COOKIE_SAME_SITE: "Lax",
  secureCookies: false,
  cookieNames: { access: "pos_access", refresh: "pos_refresh", csrf: "pos_csrf" },
}

test("login issues HttpOnly session cookies and never returns session tokens", async () => {
  const app = express()
  const session = { access_token: "access-session-value", refresh_token: "refresh-session-value", expires_in: 3600 }
  const auth = {
    signIn: async () => ({
      session,
      user: { id: "staff-id", email: "staff@example.com", role: "staff" },
    }),
  }
  app.use(express.json())
  app.use(csrfProtection(config))
  app.use("/api/auth", createAuthRoutes(auth, config, (request, response, next) => next()))
  app.use(errorHandler)
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once("listening", resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`)
    const csrfToken = (await csrfResponse.json()).csrfToken
    const cookie = csrfResponse.headers.get("set-cookie").split(";")[0]

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
        Cookie: cookie,
      },
      body: JSON.stringify({ email: "staff@example.com", password: "example-password" }),
    })
    const body = await loginResponse.json()
    const setCookies = loginResponse.headers.get("set-cookie")

    assert.equal(loginResponse.status, 200, JSON.stringify(body))
    assert.deepEqual(body.user, { id: "staff-id", email: "staff@example.com", role: "staff" })
    assert.equal(JSON.stringify(body).includes("access-session-value"), false)
    assert.equal(JSON.stringify(body).includes("refresh-session-value"), false)
    assert.match(setCookies, /pos_access=access-session-value; Path=\/; SameSite=Lax; HttpOnly/)
    assert.match(setCookies, /pos_refresh=refresh-session-value; Path=\/; SameSite=Lax; HttpOnly/)
    assert.match(setCookies, /pos_csrf=/)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test("unsafe auth requests require a valid CSRF cookie and header", async () => {
  const app = express()
  app.use(express.json())
  app.use(csrfProtection(config))
  app.use("/api/auth", createAuthRoutes({
    signIn: async () => { throw new Error("must not be called") },
  }, config, (request, response, next) => next()))
  app.use(errorHandler)
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once("listening", resolve))
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "staff@example.com", password: "example-password" }),
    })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error.code, "CSRF_VALIDATION_FAILED")
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test("refresh without an existing session preserves the CSRF cookie for login", async () => {
  const app = express()
  app.use(express.json())
  app.use(csrfProtection(config))
  app.use("/api/auth", createAuthRoutes({}, config, (request, response, next) => next()))
  app.use(errorHandler)
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once("listening", resolve))
    const baseUrl = `http://127.0.0.1:${server.address().port}`
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`)
    const csrfToken = (await csrfResponse.json()).csrfToken
    const csrfCookie = csrfResponse.headers.get("set-cookie").split(";")[0]

    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: {
        "X-CSRF-Token": csrfToken,
        Cookie: csrfCookie,
      },
    })
    const responseCookies = refreshResponse.headers.get("set-cookie") ?? ""

    assert.equal(refreshResponse.status, 401)
    assert.ok(responseCookies.includes("pos_access=; Path=/; SameSite=Lax"))
    assert.ok(responseCookies.includes("pos_refresh=; Path=/; SameSite=Lax"))
    assert.equal(responseCookies.includes("pos_csrf="), false)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
