import assert from "node:assert/strict"
import test from "node:test"
import { AuthUseCases } from "../src/modules/auth/application/auth-use-cases.js"
import { hashPassword } from "../src/modules/auth/application/passwords.js"

test("sign-in returns a public user and persists only hashed session tokens", async () => {
  const passwordHash = await hashPassword("correct-password")
  let createdSession
  const repository = {
    findUserByEmail: async (email) => {
      assert.equal(email, "staff@example.com")
      return {
        id: "staff-id",
        email,
        role: "staff",
        passwordHash,
        isActive: true,
      }
    },
    createSession: async (session) => { createdSession = session },
  }
  const useCases = new AuthUseCases(repository)
  const result = await useCases.signIn(" Staff@Example.com ", "correct-password")

  assert.deepEqual(result.user, { id: "staff-id", email: "staff@example.com", role: "staff" })
  assert.equal(result.session.expires_in, 900)
  assert.ok(result.session.access_token)
  assert.ok(result.session.refresh_token)
  assert.notEqual(createdSession.accessTokenHash, result.session.access_token)
  assert.notEqual(createdSession.refreshTokenHash, result.session.refresh_token)
  assert.equal(createdSession.userId, "staff-id")
})

test("sign-in uses one generic error for unknown users and invalid passwords", async () => {
  const passwordHash = await hashPassword("correct-password")
  const repository = {
    findUserByEmail: async (email) => email === "known@example.com"
      ? { id: "staff-id", email, role: "staff", passwordHash, isActive: true }
      : null,
  }
  const useCases = new AuthUseCases(repository)

  await assert.rejects(useCases.signIn("missing@example.com", "wrong-password"), {
    status: 401,
    code: "INVALID_CREDENTIALS",
  })
  await assert.rejects(useCases.signIn("known@example.com", "wrong-password"), {
    status: 401,
    code: "INVALID_CREDENTIALS",
  })
})

test("refresh rotates the session and rejects revoked or expired sessions", async () => {
  let rotation
  const repository = {
    rotateSession: async (session) => {
      rotation = session
      return { id: "staff-id", email: "staff@example.com", role: "staff", isActive: true }
    },
  }
  const useCases = new AuthUseCases(repository)
  const result = await useCases.refresh("refresh-token")

  assert.equal(rotation.currentRefreshTokenHash.length, 64)
  assert.ok(rotation.accessTokenHash)
  assert.ok(rotation.refreshTokenHash)
  assert.notEqual(result.session.refresh_token, "refresh-token")
  repository.rotateSession = async () => null
  await assert.rejects(useCases.refresh("revoked-token"), { status: 401, code: "INVALID_SESSION" })
})

test("sign-out revokes a matching session without requiring both cookies", async () => {
  let revokedTokens
  const repository = {
    revokeSession: async (tokens) => { revokedTokens = tokens },
  }
  await new AuthUseCases(repository).signOut("access-token", null)

  assert.equal(revokedTokens.accessTokenHash.length, 64)
  assert.equal(revokedTokens.refreshTokenHash, null)
})
