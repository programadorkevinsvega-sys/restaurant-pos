import assert from "node:assert/strict"
import test from "node:test"
import { createCsrfToken, isValidCsrfToken } from "../src/shared/presentation/http/csrf.js"

test("CSRF tokens are signed and reject tampering", () => {
  const token = createCsrfToken("server-side-test-secret")
  assert.equal(isValidCsrfToken(token, "server-side-test-secret"), true)
  assert.equal(isValidCsrfToken(token, "another-secret"), false)
  assert.equal(isValidCsrfToken(`${token}x`, "server-side-test-secret"), false)
})
