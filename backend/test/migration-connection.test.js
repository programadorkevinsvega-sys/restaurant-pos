import assert from "node:assert/strict"
import test from "node:test"
import { getMigrationConnectionString } from "../src/migrations/migration-connection.js"

test("migration connection prefers the dedicated migration URL", () => {
  assert.equal(
    getMigrationConnectionString({
      MIGRATIONS_DATABASE_URL: "postgresql://migrator/target",
      DATABASE_URL: "postgresql://runtime/target",
    }),
    "postgresql://migrator/target",
  )
})

test("migration connection fails when no URL is configured", () => {
  assert.throws(
    () => getMigrationConnectionString({ DATABASE_URL: "postgresql://runtime/database" }),
    /MIGRATIONS_DATABASE_URL es obligatoria/,
  )
})
