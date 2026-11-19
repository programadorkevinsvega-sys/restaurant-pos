import assert from "node:assert/strict"
import test from "node:test"
import { authenticate } from "../src/shared/presentation/http/authentication.js"

function runMiddleware(middleware, request) {
  return new Promise((resolve, reject) => {
    middleware(request, {}, (error) => error ? reject(error) : resolve(request.auth))
  })
}

function requestWithCookie(cookie, activeBranchId) {
  return { get: (name) => name === "cookie" ? cookie : name === "x-active-branch-id" ? activeBranchId : undefined }
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
    activeBranchId: null,
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

test("authentication attaches a well-formed active branch identifier without granting access", async () => {
  const middleware = authenticate({
    getUser: async () => ({ id: "staff-id", role: "staff" }),
  }, "pos_access")
  const context = await runMiddleware(
    middleware,
    requestWithCookie("pos_access=valid-session", "11111111-1111-4111-8111-111111111111"),
  )
  assert.equal(context.activeBranchId, "11111111-1111-4111-8111-111111111111")
  assert.equal(context.userId, "staff-id")
})

test("authentication rejects malformed active branch identifiers", async () => {
  const middleware = authenticate({
    getUser: async () => ({ id: "staff-id", role: "staff" }),
  }, "pos_access")
  await assert.rejects(
    runMiddleware(middleware, requestWithCookie("pos_access=valid-session", "not-a-uuid")),
    { status: 400, code: "INVALID_ACTIVE_BRANCH" },
  )
})
