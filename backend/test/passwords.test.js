import assert from "node:assert/strict"
import test from "node:test"
import { hashPassword, verifyPassword } from "../src/modules/auth/application/passwords.js"

test("password hashes verify without accepting a different password", async () => {
  const encodedHash = await hashPassword("correct-password")

  assert.equal(await verifyPassword("correct-password", encodedHash), true)
  assert.equal(await verifyPassword("incorrect-password", encodedHash), false)
  assert.equal(await verifyPassword("correct-password", "not-a-valid-hash"), false)
})
