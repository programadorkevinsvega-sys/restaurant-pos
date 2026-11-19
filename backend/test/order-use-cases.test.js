import assert from "node:assert/strict"
import test from "node:test"
import { OrderUseCases } from "../src/modules/orders/application/order-use-cases.js"

test("order creation requires an active branch before reaching persistence", async () => {
  let called = false
  const orders = new OrderUseCases({
    createOrder: async () => { called = true },
  })

  await assert.rejects(orders.createOrder({ legal_entity_id: "entity-id" }, {
    userId: "staff-id",
    activeBranchId: null,
  }), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  assert.equal(called, false)
})

test("order creation delegates the selected legal entity and authenticated actor with the active branch", async () => {
  let inputReceived
  let actorReceived
  const orders = new OrderUseCases({
    createOrder: async (input, actor) => {
      inputReceived = input
      actorReceived = actor
      return { success: true, orderId: "order-id" }
    },
  })
  const input = { legal_entity_id: "entity-id" }
  const actor = { userId: "staff-id", activeBranchId: "branch-id" }

  const result = await orders.createOrder(input, actor)

  assert.deepEqual(inputReceived, input)
  assert.deepEqual(actorReceived, actor)
  assert.equal(result.orderId, "order-id")
})

test("order listing and status changes require branch context", async () => {
  const orders = new OrderUseCases({
    listOrders: async () => [],
    updateStatus: async () => ({ id: "order-id" }),
  })
  await assert.rejects(orders.listOrders({}, { userId: "staff-id" }), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
  await assert.rejects(orders.updateStatus("order-id", "ready", { userId: "staff-id" }), {
    status: 409,
    code: "ACTIVE_BRANCH_REQUIRED",
  })
})
