import assert from "node:assert/strict"
import test from "node:test"
import { AuthUseCases } from "../src/modules/auth/application/auth-use-cases.js"

test("sign-in returns only a public user and the server-side session", async () => {
  const session = { access_token: "access", refresh_token: "refresh", expires_in: 3600 }
  const auth = {
    signInWithPassword: async () => ({
      data: {
        session,
        user: { id: "staff-id", email: "staff@example.com", app_metadata: { role: "staff" }, user_metadata: { secret: true } },
      },
      error: null,
    }),
  }
  const useCases = new AuthUseCases(() => ({ auth }))

  assert.deepEqual(await useCases.signIn("staff@example.com", "password"), {
    session,
    user: { id: "staff-id", email: "staff@example.com", role: "staff" },
  })
})

test("sign-in revokes a session for a user without an authorized app role", async () => {
  let signedOut = false
  const auth = {
    signInWithPassword: async () => ({
      data: { session: {}, user: { id: "customer", user_metadata: { role: "admin" } } },
      error: null,
    }),
    signOut: async (options) => {
      assert.deepEqual(options, { scope: "local" })
      signedOut = true
      return { error: null }
    },
  }
  const useCases = new AuthUseCases(() => ({ auth }))

  await assert.rejects(useCases.signIn("customer@example.com", "password"), { status: 403, code: "ROLE_REQUIRED" })
  assert.equal(signedOut, true)
})
