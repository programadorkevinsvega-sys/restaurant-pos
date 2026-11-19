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
  let organizationAdminId
  let organizationStaffId
  let organizationId

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

    const organizationPrivileges = await runtime.query(
      "SELECT " +
      "has_table_privilege(current_user, 'public.organizations', 'SELECT') AS can_read, " +
      "has_table_privilege(current_user, 'public.organizations', 'INSERT') AS can_insert, " +
      "has_table_privilege(current_user, 'public.organizations', 'UPDATE') AS can_update, " +
      "has_table_privilege(current_user, 'public.organizations', 'DELETE') AS can_delete, " +
      "has_function_privilege(current_user, " +
      "'public.bootstrap_organization_profile(text, text, text, text, text, jsonb, uuid)'::regprocedure, 'EXECUTE') AS can_bootstrap, " +
      "has_function_privilege(current_user, " +
      "'public.update_organization_profile(uuid, boolean, text, boolean, text, boolean, text, boolean, text, boolean, text, boolean, jsonb)'::regprocedure, 'EXECUTE') AS can_update_profile",
    )
    assert.deepEqual(organizationPrivileges.rows[0], {
      can_read: true,
      can_insert: false,
      can_update: false,
      can_delete: false,
      can_bootstrap: true,
      can_update_profile: true,
    })

    const adminUser = await runtime.query(
      "INSERT INTO public.app_users (email, password_hash, role, is_active) " +
      "VALUES ('org-admin-' || uuid_generate_v4()::text || '@example.invalid', 'ci-fixture-only', 'admin', true) " +
      "RETURNING id",
    )
    organizationAdminId = adminUser.rows[0].id

    const staffUser = await runtime.query(
      "INSERT INTO public.app_users (email, password_hash, role, is_active) " +
      "VALUES ('org-staff-' || uuid_generate_v4()::text || '@example.invalid', 'ci-fixture-only', 'staff', true) " +
      "RETURNING id",
    )
    organizationStaffId = staffUser.rows[0].id

    const bootstrapArguments = [
      "Chili POS Group",
      "Chili POS",
      "contact@example.invalid",
      "+57 300 000 0000",
      "https://example.invalid",
      JSON.stringify({ country_code: "CO", locality: "Medellín" }),
    ]

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.bootstrap_organization_profile($1, $2, $3, $4, $5, $6::jsonb, $7)",
        [...bootstrapArguments, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const concurrentBootstrap = await Promise.all([
      runtime.query(
        "SELECT * FROM public.bootstrap_organization_profile($1, $2, $3, $4, $5, $6::jsonb, $7)",
        [...bootstrapArguments, organizationAdminId],
      ),
      runtime.query(
        "SELECT * FROM public.bootstrap_organization_profile($1, $2, $3, $4, $5, $6::jsonb, $7)",
        [...bootstrapArguments, organizationAdminId],
      ),
    ])
    assert.deepEqual(
      concurrentBootstrap.map((result) => result.rowCount).sort(),
      [0, 1],
    )
    const bootstrapped = concurrentBootstrap.find((result) => result.rowCount === 1)
    organizationId = bootstrapped.rows[0].id
    assert.equal(bootstrapped.rows[0].owner_user_id, organizationAdminId)
    assert.equal(bootstrapped.rows[0].name, "Chili POS Group")

    const duplicateBootstrap = await runtime.query(
      "SELECT * FROM public.bootstrap_organization_profile($1, $2, $3, $4, $5, $6::jsonb, $7)",
      [...bootstrapArguments, organizationAdminId],
    )
    assert.equal(duplicateBootstrap.rowCount, 0)

    const ownerUpdate = await runtime.query(
      "SELECT * FROM public.update_organization_profile(" +
      "$1, false, null, true, $2, false, null, false, null, false, null, false, null::jsonb)",
      [organizationAdminId, "Chili POS Corporate"],
    )
    assert.equal(ownerUpdate.rowCount, 1)
    assert.equal(ownerUpdate.rows[0].commercial_name, "Chili POS Corporate")
    assert.equal(ownerUpdate.rows[0].owner_user_id, organizationAdminId)

    const nonOwnerUpdate = await runtime.query(
      "SELECT * FROM public.update_organization_profile(" +
      "$1, false, null, true, $2, false, null, false, null, false, null, false, null::jsonb)",
      [organizationStaffId, "Unauthorized Change"],
    )
    assert.equal(nonOwnerUpdate.rowCount, 0)

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.organizations (name, owner_user_id, updated_by_user_id) " +
        "VALUES ('Direct insert bypass', $1, $1)",
        [organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.organizations SET name = 'Direct SQL bypass' WHERE id = $1",
        [organizationId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "DELETE FROM public.organizations WHERE id = $1",
        [organizationId],
      ),
      (error) => error.code === "42501",
    )

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
    if (organizationId) await migrator.query("DELETE FROM public.organizations WHERE id = $1", [organizationId])
    if (organizationAdminId || organizationStaffId) {
      await migrator.query(
        "DELETE FROM public.app_users WHERE id = ANY($1::uuid[])",
        [[organizationAdminId, organizationStaffId].filter(Boolean)],
      )
    }
    if (orderId) await runtime.query("DELETE FROM public.orders WHERE id = $1", [orderId])
    if (productId) await runtime.query("DELETE FROM public.products WHERE id = $1", [productId])
    if (categoryId) await runtime.query("DELETE FROM public.categories WHERE id = $1", [categoryId])
    await Promise.all([runtime.end(), migrator.end()])
  }
})
