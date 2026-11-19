import assert from "node:assert/strict"
import test from "node:test"
import pg from "pg"

const { Pool } = pg
const runtimeUrl = process.env.DATABASE_URL
const migrationUrl = process.env.MIGRATIONS_DATABASE_URL
const integrationEnabled = Boolean(runtimeUrl && migrationUrl)

test("PostgreSQL migrations and restricted runtime role", { skip: !integrationEnabled }, async () => {
  const runtime = new Pool({ connectionString: runtimeUrl, max: 2 })
  const migrator = new Pool({ connectionString: migrationUrl, max: 1 })
  let categoryId
  let productId
  let orderId

  try {
    const identity = await runtime.query(
      "SELECT current_user AS role_name, current_database() AS database_name",
    )
    assert.equal(identity.rows[0].role_name, "restaurant_pos_app")
    assert.equal(identity.rows[0].database_name, "restaurant_pos_test")

    const role = await runtime.query(
      "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user",
    )
    assert.equal(role.rowCount, 1)
    assert.equal(role.rows[0].rolsuper, false)
    assert.equal(role.rows[0].rolbypassrls, false)
    assert.equal(role.rows[0].rolcreatedb, false)
    assert.equal(role.rows[0].rolcreaterole, false)

    const privileges = await runtime.query(
      "SELECT has_table_privilege(current_user, 'public.products', 'SELECT') AS can_read_products, " +
      "has_table_privilege(current_user, 'public.products', 'INSERT') AS can_insert_products, " +
      "has_function_privilege(current_user, " +
      "'public.create_pos_order(text, text, text, jsonb, text, text)'::regprocedure, 'EXECUTE') AS can_create_orders",
    )
    assert.equal(privileges.rows[0].can_read_products, true)
    assert.equal(privileges.rows[0].can_insert_products, true)
    assert.equal(privileges.rows[0].can_create_orders, true)

    const extension = await runtime.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'",
    )
    assert.equal(extension.rowCount, 1)

    const migrationHistory = await migrator.query(
      "SELECT version FROM public.schema_migrations ORDER BY version",
    )
    assert.deepEqual(
      migrationHistory.rows.map((row) => row.version),
      [
        "001_create_tables.sql",
        "003_additional_tables.sql",
        "004_secure_access_and_use_cases.sql",
        "005_create_auth_tables.sql",
        "006_create_organization_profile.sql",
      ],
    )

    const category = await runtime.query(
      "INSERT INTO public.categories (name) VALUES ($1) RETURNING id",
      ["CI integration fixture"],
    )
    categoryId = category.rows[0].id

    const product = await runtime.query(
      "INSERT INTO public.products (name, price, type, category_id, discount_percentage) " +
      "VALUES ($1, $2, $3, $4, 0) RETURNING id",
      ["CI integration product", "12.50", "Veg", categoryId],
    )
    productId = product.rows[0].id

    const order = await runtime.query(
      "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6) AS order_id",
      [
        "CI integration table",
        "Integration test",
        "Para llevar",
        JSON.stringify([{ id: productId, quantity: 2 }]),
        null,
        null,
      ],
    )
    orderId = order.rows[0].order_id

    const persistedOrder = await runtime.query(
      "SELECT o.total_amount::text AS total_amount, count(oi.id)::integer AS item_count " +
      "FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id " +
      "WHERE o.id = $1 GROUP BY o.id",
      [orderId],
    )
    assert.equal(persistedOrder.rowCount, 1)
    assert.equal(persistedOrder.rows[0].total_amount, "25.00")
    assert.equal(persistedOrder.rows[0].item_count, 1)

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6)",
        [
          "CI invalid order",
          "Integration test",
          "INVALID",
          JSON.stringify([{ id: productId, quantity: 1 }]),
          null,
          null,
        ],
      ),
      /Invalid order type/,
    )
  } finally {
    if (orderId) await runtime.query("DELETE FROM public.orders WHERE id = $1", [orderId])
    if (productId) await runtime.query("DELETE FROM public.products WHERE id = $1", [productId])
    if (categoryId) await runtime.query("DELETE FROM public.categories WHERE id = $1", [categoryId])
    await Promise.all([runtime.end(), migrator.end()])
  }
})
