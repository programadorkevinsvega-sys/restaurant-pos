import assert from "node:assert/strict"
import test from "node:test"
import { PostgresCatalogRepository } from "../src/modules/catalog/infrastructure/postgres-catalog-repository.js"
import { PostgresOrderRepository } from "../src/modules/orders/infrastructure/postgres-order-repository.js"
import { PostgresOperationsRepository } from "../src/modules/operations/infrastructure/postgres-operations-repository.js"
import { PostgresAccountingRepository } from "../src/modules/accounting/infrastructure/postgres-accounting-repository.js"
import { PostgresAuthRepository } from "../src/modules/auth/infrastructure/postgres-auth-repository.js"

test("catalog filters use bound parameters and normalize numeric prices", async () => {
  let queryCall
  const repository = new PostgresCatalogRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ id: "product-id", price: "12.50" }] }
    },
  })

  const products = await repository.listProducts("category-id")

  assert.equal(queryCall[1][0], "category-id")
  assert.match(queryCall[0], /p\.category_id = \$1::uuid/)
  assert.equal(products[0].price, 12.5)
})

test("order creation sends only trusted identifiers and quantities to PostgreSQL", async () => {
  let queryCall
  const repository = new PostgresOrderRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ order_id: "order-id" }] }
    },
  })

  const response = await repository.createOrder({
    table_number: "Mesa 1",
    customer_name: "Test",
    order_type: "Comer aquí",
    total_amount: 0.01,
    items: [{ id: "product-id", quantity: 2, price: 0.01 }],
  })

  assert.match(queryCall[0], /public\.create_pos_order/)
  assert.deepEqual(JSON.parse(queryCall[1][3]), [{ id: "product-id", quantity: 2 }])
  assert.equal(queryCall[1].some((value) => value === 0.01), false)
  assert.deepEqual(response, { success: true, orderId: "order-id", message: "Pedido creado exitosamente" })
})

test("table updates preserve current_order_id when it is omitted", async () => {
  let queryCall
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ id: "table-id", status: "available", current_order_id: "existing-order" }] }
    },
  })

  await repository.updateTable("table-id", { status: "available" })

  assert.equal(queryCall[1][2], false)
  assert.equal(queryCall[1][3], null)
})

test("settings updates pass values as JSON and upsert on the key", async () => {
  let queryCall
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ key: "tax_rate", value: "0.05" }] }
    },
  })

  const result = await repository.updateSettings({ tax_rate: "0.05" })

  assert.match(queryCall[0], /ON CONFLICT \(key\) DO UPDATE/)
  assert.deepEqual(JSON.parse(queryCall[1][0]), { tax_rate: "0.05" })
  assert.deepEqual(result.data, [{ key: "tax_rate", value: "0.05" }])
})

test("accounting delegates report calculation to PostgreSQL functions", async () => {
  let queryCall
  const repository = new PostgresAccountingRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ report: { total_orders: 0, total_revenue: 0, data: [] } }] }
    },
  })
  const report = await repository.salesReport({
    start_date: "2026-01-01T00:00:00.000Z",
    end_date: "2026-01-02T00:00:00.000Z",
    period: "daily",
  })

  assert.match(queryCall[0], /public\.get_sales_report/)
  assert.equal(queryCall[1][2], "daily")
  assert.deepEqual(report, { total_orders: 0, total_revenue: 0, data: [] })
})

test("auth repository finds normalized emails using a bound parameter", async () => {
  let queryCall
  const repository = new PostgresAuthRepository({
    query: async (...args) => {
      queryCall = args
      return {
        rows: [{
          id: "staff-id",
          email: "staff@example.com",
          role: "staff",
          password_hash: "scrypt-hash",
          is_active: true,
        }],
      }
    },
  })

  const user = await repository.findUserByEmail("staff@example.com")

  assert.match(queryCall[0], /lower\(email\) = \$1/)
  assert.deepEqual(queryCall[1], ["staff@example.com"])
  assert.deepEqual(user, {
    id: "staff-id",
    email: "staff@example.com",
    role: "staff",
    passwordHash: "scrypt-hash",
    isActive: true,
  })
})

test("auth repository rotates only a live refresh session", async () => {
  let queryCall
  const repository = new PostgresAuthRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ id: "staff-id", email: "staff@example.com", role: "staff", is_active: true }] }
    },
  })

  const user = await repository.rotateSession({
    currentRefreshTokenHash: "old-hash",
    accessTokenHash: "new-access-hash",
    refreshTokenHash: "new-refresh-hash",
    accessExpiresAt: new Date("2026-01-01T00:15:00.000Z"),
    refreshExpiresAt: new Date("2026-01-31T00:00:00.000Z"),
  })

  assert.match(queryCall[0], /s\.revoked_at IS NULL/)
  assert.match(queryCall[0], /s\.refresh_expires_at > now\(\)/)
  assert.deepEqual(queryCall[1].slice(0, 3), ["old-hash", "new-access-hash", "new-refresh-hash"])
  assert.equal(user.id, "staff-id")
  assert.equal(user.passwordHash, undefined)
})
