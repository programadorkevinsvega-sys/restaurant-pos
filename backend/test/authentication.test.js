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

test("authentication resolves the user from the session cookie", async () => {
  const middleware = authenticate({
    getUser: async (token) => {
      assert.equal(token, "valid-session")
      return { id: "staff-id", role: "staff" }
    },
  }, "pos_access")

  assert.deepEqual(await runMiddleware(middleware, requestWithCookie("pos_access=valid-session")), {
    userId: "staff-id",
    role: "staff",
  })
})

test("authentication propagates an invalid session", async () => {
  const middleware = authenticate({
    getUser: async () => {
      const error = new Error("invalid session")
      error.status = 401
      throw error
    },
  }, "pos_access")
  await assert.rejects(runMiddleware(middleware, requestWithCookie("pos_access=valid-session")), {
    status: 401,
  })
})

test("authentication rejects missing session cookies", async () => {
  const middleware = authenticate({ getUser: async () => { throw new Error("must not be called") } }, "pos_access")
  await assert.rejects(runMiddleware(middleware, requestWithCookie("")), {
    code: "AUTHENTICATION_REQUIRED",
    status: 401,
  })
})
