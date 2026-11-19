import assert from "node:assert/strict"
import test from "node:test"
import { OperationsUseCases } from "../src/modules/operations/application/operations-use-cases.js"

const actor = { userId: "staff-id", activeBranchId: "branch-id" }

test("table operations require and forward the authenticated branch context", async () => {
  const calls = []
  const operations = new OperationsUseCases({
    listTables: async (...args) => { calls.push(["listTables", ...args]); return [] },
    createTable: async (...args) => { calls.push(["createTable", ...args]); return {} },
    updateTable: async (...args) => { calls.push(["updateTable", ...args]); return {} },
  })

  await operations.listTables(actor)
  await operations.createTable({ number: "A1", capacity: 4 }, actor)
  await operations.updateTable("table-id", { status: "occupied" }, actor)

  assert.deepEqual(calls, [
    ["listTables", "branch-id", "staff-id"],
    ["createTable", { number: "A1", capacity: 4 }, "branch-id", "staff-id"],
    ["updateTable", "table-id", { status: "occupied" }, "branch-id", "staff-id"],
  ])
})

test("reservation operations require and forward the authenticated branch context", async () => {
  const calls = []
  const operations = new OperationsUseCases({
    listReservations: async (...args) => { calls.push(["listReservations", ...args]); return [] },
    createReservation: async (...args) => { calls.push(["createReservation", ...args]); return {} },
    updateReservation: async (...args) => { calls.push(["updateReservation", ...args]); return {} },
  })
  const filters = { date: "2026-11-18", status: "confirmed" }
  const input = { customer_name: "Test", table_id: "table-id" }

  await operations.listReservations(filters, actor)
  await operations.createReservation(input, actor)
  await operations.updateReservation("reservation-id", "seated", actor)

  assert.deepEqual(calls, [
    ["listReservations", filters, "branch-id", "staff-id"],
    ["createReservation", input, "branch-id", "staff-id"],
    ["updateReservation", "reservation-id", "seated", "branch-id", "staff-id"],
  ])
})

test("table and reservation operations reject missing branch context before persistence", () => {
  const operations = new OperationsUseCases({
    listTables: async () => { throw new Error("Must not query") },
    createTable: async () => { throw new Error("Must not query") },
    updateTable: async () => { throw new Error("Must not query") },
    listReservations: async () => { throw new Error("Must not query") },
    createReservation: async () => { throw new Error("Must not query") },
    updateReservation: async () => { throw new Error("Must not query") },
  })
  const noBranch = { userId: "staff-id", activeBranchId: null }

  assert.throws(() => operations.listTables(noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.throws(() => operations.createTable({ number: "A1", capacity: 4 }, noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.throws(() => operations.updateTable("table-id", { status: "available" }, noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.throws(() => operations.listReservations({}, noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.throws(() => operations.createReservation({ table_id: "table-id" }, noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.throws(() => operations.updateReservation("reservation-id", "seated", noBranch), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
})

test("delivery listing requires and forwards the authenticated branch context", async () => {
  let argumentsReceived
  const operations = new OperationsUseCases({
    listDeliveries: async (...args) => { argumentsReceived = args; return [] },
  })

  await operations.listDeliveries("pending", actor)

  assert.deepEqual(argumentsReceived, ["pending", "branch-id", "staff-id"])
})

test("delivery mutations reject missing active branch before persistence", () => {
  let called = false
  const operations = new OperationsUseCases({
    assignDriver: async () => { called = true },
  })

  assert.throws(() => operations.assignDriver({ order_id: "order-id" }, {
    userId: "staff-id",
    activeBranchId: null,
  }), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.equal(called, false)
})
