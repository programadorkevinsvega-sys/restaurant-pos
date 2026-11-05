import assert from "node:assert/strict"
import test from "node:test"
import { authenticate } from "../src/shared/presentation/http/authentication.js"

function runMiddleware(middleware, request) {
  return new Promise((resolve, reject) => {
    middleware(request, {}, (error) => error ? reject(error) : resolve(request.auth))
  })
}

function requestWithCookie(cookie) {
  return { get: (name) => name === "cookie" ? cookie : undefined }
}

test("authentication accepts only app_metadata roles from the session cookie", async () => {
  const middleware = authenticate({
    auth: {
      getUser: async (token) => {
        assert.equal(token, "valid-session")
        return {
          data: { user: { id: "staff-id", app_metadata: { role: "staff" }, user_metadata: { role: "admin" } } },
          error: null,
        }
      },
    },
  }, "pos_access")

  assert.deepEqual(await runMiddleware(middleware, requestWithCookie("pos_access=valid-session")), {
    userId: "staff-id",
    role: "staff",
  })
})

test("authentication rejects user_metadata-only roles", async () => {
  const middleware = authenticate({
    auth: {
      getUser: async () => ({
        data: { user: { id: "customer-id", user_metadata: { role: "admin" } } },
        error: null,
      }),
    },
  }, "pos_access")
  await assert.rejects(runMiddleware(middleware, requestWithCookie("pos_access=valid-session")), {
    code: "ROLE_REQUIRED",
    status: 403,
  })
})

test("authentication rejects missing session cookies", async () => {
  const middleware = authenticate({ auth: { getUser: async () => { throw new Error("must not be called") } } }, "pos_access")
  await assert.rejects(runMiddleware(middleware, requestWithCookie("")), {
    code: "AUTHENTICATION_REQUIRED",
    status: 401,
  })
})
