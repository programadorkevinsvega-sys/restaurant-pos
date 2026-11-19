import assert from "node:assert/strict"
import test from "node:test"
import { OperationsUseCases } from "../src/modules/operations/application/operations-use-cases.js"

test("delivery listing requires and forwards the authenticated branch context", async () => {
  let argumentsReceived
  const operations = new OperationsUseCases({
    listDeliveries: async (...args) => { argumentsReceived = args; return [] },
  })
  const actor = { userId: "staff-id", activeBranchId: "branch-id" }

  await operations.listDeliveries("pending", actor)

  assert.deepEqual(argumentsReceived, ["pending", "branch-id", "staff-id"])
})

test("delivery mutations reject missing active branch before persistence", async () => {
  let called = false
  const operations = new OperationsUseCases({
    assignDriver: async () => { called = true },
  })

  await assert.rejects(operations.assignDriver({ order_id: "order-id" }, {
    userId: "staff-id",
    activeBranchId: null,
  }), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.equal(called, false)
})
