import assert from "node:assert/strict"
import test from "node:test"
import { mapPostgresError } from "../src/shared/infrastructure/postgres.js"

test("pricing and order database rule failures become actionable HTTP errors", () => {
  const cases = [
    ["PRICE_LIST_NOT_CONFIGURED", 409, "PRICE_LIST_NOT_CONFIGURED"],
    ["PRODUCT_PRICE_NOT_CONFIGURED_OR_INACTIVE", 409, "PRODUCT_PRICE_NOT_CONFIGURED"],
    ["PRODUCT_TAX_PROFILE_REQUIRED", 409, "PRODUCT_TAX_PROFILE_REQUIRED"],
    ["PROMOTION_CONFLICT_MULTIPLE_MATCHES", 409, "PROMOTION_CONFLICT"],
    ["PROMOTION_CURRENCY_MISMATCH", 409, "PROMOTION_CURRENCY_MISMATCH"],
    ["BRANCH_OR_LEGAL_ENTITY_ACCESS_DENIED", 403, "BRANCH_LEGAL_ENTITY_ACCESS_DENIED"],
    ["INVALID_TAX_RULE", 422, "TAX_RULE_INVALID"],
    ["DUPLICATE_TAX_RULE", 422, "DUPLICATE_TAX_RULE"],
    ["PROMOTION_TARGET_REQUIRED", 422, "PROMOTION_TARGET_REQUIRED"],
    ["INVALID_PROMOTION_TARGETS", 422, "PROMOTION_TARGETS_INVALID"],
  ]

  for (const [message, status, code] of cases) {
    const mapped = mapPostgresError({ message, code: "P0001" })
    assert.equal(mapped.status, status, message)
    assert.equal(mapped.code, code, message)
    assert.ok(mapped.message.length > 10, message)
  }
})

test("unique database conflicts are reported as conflicts, not internal errors", () => {
  const mapped = mapPostgresError({ code: "23505", message: "duplicate key value" })
  assert.equal(mapped.status, 409)
  assert.equal(mapped.code, "RESOURCE_ALREADY_EXISTS")
})

test("unrecognized PostgreSQL errors remain unmapped for safe internal handling", () => {
  assert.equal(mapPostgresError({ code: "XX000", message: "unexpected internal failure" }), null)
})
