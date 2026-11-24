import assert from "node:assert/strict"
import test from "node:test"
import { PostgresCatalogRepository } from "../src/modules/catalog/infrastructure/postgres-catalog-repository.js"
import { PostgresOrderRepository } from "../src/modules/orders/infrastructure/postgres-order-repository.js"
import { PostgresOperationsRepository } from "../src/modules/operations/infrastructure/postgres-operations-repository.js"
import { PostgresAccountingRepository } from "../src/modules/accounting/infrastructure/postgres-accounting-repository.js"
import { PostgresAuthRepository } from "../src/modules/auth/infrastructure/postgres-auth-repository.js"
import { PostgresBranchRepository } from "../src/modules/branches/infrastructure/postgres-branch-repository.js"

test("catalog filters use bound parameters, branch scope and normalize numeric prices", async () => {
  const calls = []
  const repository = new PostgresCatalogRepository({
    query: async (...args) => {
      calls.push(args)
      if (calls.length === 1) return { rows: [{ id: "branch-id" }] }
      return { rows: [{ id: "product-id", price: "12.50" }] }
    },
  })

  const products = await repository.listProducts("category-id", {
    userId: "staff-id",
    activeBranchId: "branch-id",
  })

  assert.match(calls[0][0], /branch_user_assignments/)
  assert.deepEqual(calls[0][1], ["branch-id", "staff-id"])
  assert.equal(calls[1][1][0], "category-id")
  assert.equal(calls[1][1][1], "branch-id")
  assert.match(calls[1][0], /p\.category_id = \$1::uuid/)
  assert.match(calls[1][0], /branch_catalog_product_exclusions/)
  assert.equal(products[0].price, 12.5)
})

test("available branches exclude inactive users and non-installation organizations", async () => {
  let queryCall
  const repository = new PostgresBranchRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [] }
    },
  })

  await repository.listAvailableBranches("staff-id")

  assert.match(queryCall[0], /assigned_user\.is_active = true/)
  assert.match(queryCall[0], /organization\.installation_slot = 1/)
  assert.deepEqual(queryCall[1], ["staff-id"])
})

test("order creation returns the authoritative database receipt in the same transaction", async () => {
  const calls = []
  const client = {
    query: async (query, values) => {
      calls.push([query, values])
      if (query.includes("public.create_pos_order")) return { rows: [{ order_id: "order-id" }] }
      if (query.includes("SELECT o.currency_code")) {
        return {
          rows: [{
            currency_code: "COP",
            subtotal_before_discount: "25000.0000",
            discount_total: "1250.0000",
            tax_total: "4512.5000",
            delivery_fee_snapshot: "0.0000",
            total_amount: "28262.5000",
            items: [{
              product_name: "Producto",
              quantity: 2,
              list_unit_price: "12500.0000",
              unit_discount: "625.0000",
              line_total: "14131.2500",
              tax_mode: "exclusive",
              tax_breakdown: [{
                tax_rule_id: "tax-id",
                code: "IVA",
                name: "IVA",
                rate: 0.19,
                taxable_base: 11875,
                amount: 2256.25,
                price_mode: "exclusive",
              }],
              promotion: { id: "promo-id", name: "Promoción", discount_type: "percentage", discount_value: 5, discount_amount: 625 },
            }],
          }],
        }
      }
      return { rows: [] }
    },
    release: () => calls.push(["RELEASE"]),
  }
  const repository = new PostgresOrderRepository({ connect: async () => client })

  const response = await repository.createOrder({
    table_number: "Mesa 1",
    customer_name: "Test",
    order_type: "Comer aquí",
    legal_entity_id: "legal-entity-id",
    items: [{ id: "product-id", quantity: 2, option_ids: [] }],
  }, {
    activeBranchId: "branch-id",
    userId: "actor-user-id",
  })

  assert.equal(calls[0][0], "BEGIN")
  assert.match(calls[1][0], /public\.create_pos_order/)
  assert.deepEqual(JSON.parse(calls[1][1][3]), [{ id: "product-id", quantity: 2, option_ids: [] }])
  assert.deepEqual(calls[1][1].slice(6), ["branch-id", "legal-entity-id", "actor-user-id"])
  assert.match(calls[2][0], /SELECT o\.currency_code/)
  assert.equal(calls[3][0], "COMMIT")
  assert.equal(calls[4][0], "RELEASE")
  assert.deepEqual(response, {
    success: true,
    orderId: "order-id",
    message: "Pedido creado exitosamente",
    currency_code: "COP",
    subtotal_before_discount: "25000.0000",
    discount_total: "1250.0000",
    tax_total: "4512.5000",
    delivery_fee_snapshot: "0.0000",
    total_amount: "28262.5000",
    items: [{
      product_name: "Producto",
      quantity: 2,
      list_unit_price: "12500.0000",
      unit_discount: "625.0000",
      line_total: "14131.2500",
      tax_mode: "exclusive",
      tax_breakdown: [{
        tax_rule_id: "tax-id",
        code: "IVA",
        name: "IVA",
        rate: 0.19,
        taxable_base: 11875,
        amount: 2256.25,
        price_mode: "exclusive",
      }],
      promotion: { id: "promo-id", name: "Promoción", discount_type: "percentage", discount_value: 5, discount_amount: 625 },
    }],
  })
})

test("order creation rolls back if its authoritative receipt cannot be read", async () => {
  const calls = []
  const client = {
    query: async (query) => {
      calls.push(query)
      if (query.includes("public.create_pos_order")) return { rows: [{ order_id: "order-id" }] }
      if (query.includes("SELECT o.currency_code")) return { rows: [] }
      return { rows: [] }
    },
    release: () => calls.push("RELEASE"),
  }
  const repository = new PostgresOrderRepository({ connect: async () => client })

  await assert.rejects(
    repository.createOrder({
      table_number: "Mesa 1",
      order_type: "Comer aquí",
      legal_entity_id: "legal-entity-id",
      items: [{ id: "product-id", quantity: 1, option_ids: [] }],
    }, { activeBranchId: "branch-id", userId: "actor-user-id" }),
    (error) => error.code === "ORDER_RECEIPT_UNAVAILABLE",
  )
  assert.ok(calls.includes("ROLLBACK"))
  assert.ok(!calls.includes("COMMIT"))
  assert.equal(calls.at(-1), "RELEASE")
})

test("table listing invokes the branch-scoped database function with authenticated context", async () => {
  let queryCall
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ id: "table-id", branch_id: "branch-id" }] }
    },
  })

  const tables = await repository.listTables("branch-id", "staff-id")

  assert.match(queryCall[0], /public\.list_branch_tables/)
  assert.deepEqual(queryCall[1], ["branch-id", "staff-id"])
  assert.equal(tables[0].branch_id, "branch-id")
})

test("table creation validates branch scope through PostgreSQL and retrieves the created table", async () => {
  const calls = []
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      calls.push(args)
      if (args[0].includes("create_branch_table")) {
        return { rows: [{ created_table_id: "table-id", outcome: "CREATED" }] }
      }
      return { rows: [{ id: "table-id", number: "A1", capacity: 4, status: "available" }] }
    },
  })

  const table = await repository.createTable({ number: "A1", capacity: 4 }, "branch-id", "staff-id")

  assert.match(calls[0][0], /public\.create_branch_table/)
  assert.deepEqual(calls[0][1], ["branch-id", "A1", 4, "staff-id"])
  assert.match(calls[1][0], /public\.get_branch_table/)
  assert.deepEqual(calls[1][1], ["table-id", "branch-id", "staff-id"])
  assert.equal(table.id, "table-id")
})

test("table updates preserve current_order_id when omitted and retain branch scope", async () => {
  const calls = []
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      calls.push(args)
      if (args[0].includes("update_branch_table")) return { rows: [{ outcome: "UPDATED" }] }
      return { rows: [{ id: "table-id", current_order: null }] }
    },
  })

  await repository.updateTable("table-id", { status: "available" }, "branch-id", "staff-id")

  assert.match(calls[0][0], /public\.update_branch_table/)
  assert.deepEqual(calls[0][1], [
    "table-id", "branch-id", "available", null, false, "staff-id",
  ])
  assert.match(calls[1][0], /public\.get_branch_table/)
})

test("reservation queries and mutations use branch-scoped database functions", async () => {
  const calls = []
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      calls.push(args)
      if (args[0].includes("create_branch_reservation")) {
        return { rows: [{ created_reservation_id: "reservation-id", outcome: "CREATED" }] }
      }
      if (args[0].includes("update_branch_reservation_status")) {
        return { rows: [{ outcome: "UPDATED" }] }
      }
      if (args[0].includes("list_branch_reservations")) {
        return { rows: [{ id: "reservation-id", branch_id: "branch-id" }] }
      }
      return { rows: [{
        id: "reservation-id",
        branch_id: "branch-id",
        status: "confirmed",
      }] }
    },
  })
  const input = {
    customer_name: "Guest",
    table_id: "table-id",
    reservation_date: "2026-11-18T18:00:00.000Z",
    party_size: 4,
  }

  await repository.listReservations({ date: "2026-11-18", status: "confirmed" }, "branch-id", "staff-id")
  await repository.createReservation(input, "branch-id", "staff-id")
  await repository.updateReservation("reservation-id", "seated", "branch-id", "staff-id")

  assert.match(calls[0][0], /public\.list_branch_reservations/)
  assert.deepEqual(calls[0][1], [
    "branch-id",
    "staff-id",
    "2026-11-18T00:00:00.000Z",
    "2026-11-19T00:00:00.000Z",
    "confirmed",
  ])
  assert.match(calls[1][0], /public\.create_branch_reservation/)
  assert.deepEqual(calls[1][1], [
    "branch-id", "Guest", null, null, "table-id",
    "2026-11-18T18:00:00.000Z", 4, null, "staff-id",
  ])
  assert.match(calls[3][0], /public\.update_branch_reservation_status/)
  assert.deepEqual(calls[3][1], [
    "reservation-id", "branch-id", "seated", "staff-id",
  ])
  assert.ok(calls.slice(1).some((call) => call[0].includes("get_branch_reservation")))
})

test("branch authorization failures are translated to a forbidden application error", async () => {
  const repository = new PostgresOperationsRepository({
    query: async () => {
      const error = new Error("permission denied")
      error.code = "42501"
      throw error
    },
  })

  await assert.rejects(repository.listTables("branch-id", "unassigned-user"), {
    status: 403,
    code: "BRANCH_ACCESS_DENIED",
  })
})

test("delivery listing and mutation stay within the authenticated active branch", async () => {
  let listingCall
  let assignmentCall
  const repository = new PostgresOperationsRepository({
    query: async (...args) => {
      if (args[0].includes("assign_delivery_driver")) {
        assignmentCall = args
        return { rows: [{ delivery: { order_id: "order-id" } }] }
      }
      listingCall = args
      return { rows: [] }
    },
  })

  await repository.listDeliveries("pending", "branch-id", "staff-id")
  assert.match(listingCall[0], /o\.branch_id = \$2/)
  assert.match(listingCall[0], /branch_user_assignments/)
  assert.deepEqual(listingCall[1], ["pending", "branch-id", "staff-id"])

  await repository.assignDriver({
    order_id: "order-id",
    driver_name: "Driver",
    driver_phone: null,
    estimated_time: 20,
  }, "branch-id", "staff-id")
  assert.match(assignmentCall[0], /assign_delivery_driver\(\$1, \$2, \$3, \$4, \$5::uuid, \$6::uuid\)/)
  assert.deepEqual(assignmentCall[1], ["order-id", "Driver", null, 20, "branch-id", "staff-id"])
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
