import assert from "node:assert/strict"
import test from "node:test"
import { SupabaseOrderRepository } from "../src/modules/orders/infrastructure/supabase-order-repository.js"

test("order creation sends only product ids and quantities to the transactional boundary", async () => {
  let rpcCall
  const repository = new SupabaseOrderRepository({
    rpc: async (...args) => {
      rpcCall = args
      return { data: "order-id", error: null }
    },
  })

  const response = await repository.createOrder({
    table_number: "Mesa 1",
    customer_name: "Test",
    order_type: "Comer aquí",
    total_amount: 0.01,
    items: [{ id: "product-id", quantity: 2, price: 0.01, name: "Tampered client price" }],
  })

  assert.deepEqual(rpcCall[1].p_items, [{ id: "product-id", quantity: 2 }])
  assert.equal("total_amount" in rpcCall[1], false)
  assert.deepEqual(response, { success: true, orderId: "order-id", message: "Pedido creado exitosamente" })
})
