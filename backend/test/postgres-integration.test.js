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
  let deliveryOrderId
  let variantProductId
  let secondProductId
  let variantOrderId
  let organizationAdminId
  let organizationStaffId
  let organizationId
  const legalEntityIds = []
  let branchId
  let secondBranchId
  let legacyTableId
  let legacyReservationId

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
      "has_table_privilege(current_user, 'public.orders', 'INSERT') AS can_insert_orders, " +
      "has_function_privilege(current_user, " +
      "'public.create_pos_order(text, text, text, jsonb, text, text)'::regprocedure, 'EXECUTE') AS can_create_orders_legacy, " +
      "has_function_privilege(current_user, " +
      "'public.create_pos_order(text, text, text, jsonb, text, text, uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_create_orders, " +
      "has_function_privilege(current_user, " +
      "'public.assign_delivery_driver(uuid, text, text, integer, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_assign_delivery, " +
      "has_function_privilege(current_user, " +
      "'public.assign_delivery_driver(uuid, text, text, integer)'::regprocedure, 'EXECUTE') AS can_assign_delivery_legacy, " +
      "has_table_privilege(current_user, 'public.tables', 'SELECT') AS can_read_tables, " +
      "has_table_privilege(current_user, 'public.tables', 'INSERT') AS can_insert_tables, " +
      "has_table_privilege(current_user, 'public.tables', 'UPDATE') AS can_update_tables, " +
      "has_table_privilege(current_user, 'public.tables', 'DELETE') AS can_delete_tables, " +
      "has_table_privilege(current_user, 'public.reservations', 'SELECT') AS can_read_reservations, " +
      "has_table_privilege(current_user, 'public.reservations', 'INSERT') AS can_insert_reservations, " +
      "has_table_privilege(current_user, 'public.reservations', 'UPDATE') AS can_update_reservations, " +
      "has_table_privilege(current_user, 'public.reservations', 'DELETE') AS can_delete_reservations, " +
      "has_function_privilege(current_user, 'public.list_branch_tables(uuid, uuid)'::regprocedure, 'EXECUTE') AS can_list_branch_tables, " +
      "has_function_privilege(current_user, 'public.create_branch_table(uuid, text, integer, uuid)'::regprocedure, 'EXECUTE') AS can_create_branch_table, " +
      "has_function_privilege(current_user, 'public.update_branch_table(uuid, uuid, text, uuid, boolean, uuid)'::regprocedure, 'EXECUTE') AS can_update_branch_table, " +
      "has_function_privilege(current_user, 'public.list_branch_reservations(uuid, uuid, timestamp with time zone, timestamp with time zone, text)'::regprocedure, 'EXECUTE') AS can_list_branch_reservations, " +
      "has_function_privilege(current_user, 'public.create_branch_reservation(uuid, text, text, text, uuid, timestamp with time zone, integer, text, uuid)'::regprocedure, 'EXECUTE') AS can_create_branch_reservation, " +
      "has_function_privilege(current_user, 'public.update_branch_reservation_status(uuid, uuid, text, uuid)'::regprocedure, 'EXECUTE') AS can_update_branch_reservation, " +
      "has_function_privilege(current_user, 'public.get_branch_table(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_get_branch_table, " +
      "has_function_privilege(current_user, 'public.get_branch_reservation(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_get_branch_reservation",
    )
    assert.equal(privileges.rows[0].can_read_products, true)
    assert.equal(privileges.rows[0].can_insert_products, true)
    assert.equal(privileges.rows[0].can_insert_orders, false)
    assert.equal(privileges.rows[0].can_create_orders_legacy, false)
    assert.equal(privileges.rows[0].can_create_orders, true)
    assert.equal(privileges.rows[0].can_assign_delivery, true)
    assert.equal(privileges.rows[0].can_assign_delivery_legacy, false)
    assert.equal(privileges.rows[0].can_read_tables, false)
    assert.equal(privileges.rows[0].can_insert_tables, false)
    assert.equal(privileges.rows[0].can_update_tables, false)
    assert.equal(privileges.rows[0].can_delete_tables, false)
    assert.equal(privileges.rows[0].can_read_reservations, false)
    assert.equal(privileges.rows[0].can_insert_reservations, false)
    assert.equal(privileges.rows[0].can_update_reservations, false)
    assert.equal(privileges.rows[0].can_delete_reservations, false)
    assert.equal(privileges.rows[0].can_list_branch_tables, true)
    assert.equal(privileges.rows[0].can_create_branch_table, true)
    assert.equal(privileges.rows[0].can_update_branch_table, true)
    assert.equal(privileges.rows[0].can_list_branch_reservations, true)
    assert.equal(privileges.rows[0].can_create_branch_reservation, true)
    assert.equal(privileges.rows[0].can_update_branch_reservation, true)
    assert.equal(privileges.rows[0].can_get_branch_table, true)
    assert.equal(privileges.rows[0].can_get_branch_reservation, true)

    await assert.rejects(
      runtime.query("SELECT * FROM public.tables"),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query("SELECT * FROM public.reservations"),
      (error) => error.code === "42501",
    )

    const legalStructurePrivileges = await runtime.query(
      "SELECT " +
      "has_table_privilege(current_user, 'public.legal_entities', 'SELECT') AS legal_read, " +
      "has_table_privilege(current_user, 'public.legal_entities', 'INSERT') AS legal_insert, " +
      "has_table_privilege(current_user, 'public.legal_entities', 'UPDATE') AS legal_update, " +
      "has_table_privilege(current_user, 'public.legal_entities', 'DELETE') AS legal_delete, " +
      "has_table_privilege(current_user, 'public.branches', 'SELECT') AS branch_read, " +
      "has_table_privilege(current_user, 'public.branches', 'INSERT') AS branch_insert, " +
      "has_table_privilege(current_user, 'public.branches', 'UPDATE') AS branch_update, " +
      "has_table_privilege(current_user, 'public.branches', 'DELETE') AS branch_delete, " +
      "has_table_privilege(current_user, 'public.branch_legal_entities', 'SELECT') AS relation_read, " +
      "has_table_privilege(current_user, 'public.branch_legal_entities', 'INSERT') AS relation_insert, " +
      "has_table_privilege(current_user, 'public.branch_legal_entities', 'UPDATE') AS relation_update, " +
      "has_table_privilege(current_user, 'public.branch_legal_entities', 'DELETE') AS relation_delete, " +
      "has_table_privilege(current_user, 'public.branch_user_assignments', 'SELECT') AS assignment_read, " +
      "has_table_privilege(current_user, 'public.branch_user_assignments', 'INSERT') AS assignment_insert, " +
      "has_table_privilege(current_user, 'public.branch_user_assignments', 'UPDATE') AS assignment_update, " +
      "has_table_privilege(current_user, 'public.branch_user_assignments', 'DELETE') AS assignment_delete, " +
      "has_table_privilege(current_user, 'public.branch_lifecycle_events', 'SELECT') AS lifecycle_read, " +
      "has_table_privilege(current_user, 'public.branch_lifecycle_events', 'INSERT') AS lifecycle_insert, " +
      "has_table_privilege(current_user, 'public.branch_lifecycle_events', 'UPDATE') AS lifecycle_update, " +
      "has_table_privilege(current_user, 'public.branch_lifecycle_events', 'DELETE') AS lifecycle_delete, " +
      "has_function_privilege(current_user, " +
      "'public.change_branch_status(uuid, text, uuid)'::regprocedure, 'EXECUTE') AS can_change_branch_status, " +
      "has_function_privilege(current_user, " +
      "'public.guard_branch_order_writes()'::regprocedure, 'EXECUTE') AS can_call_order_guard, " +
      "has_function_privilege(current_user, " +

      "'public.assign_user_to_branch(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_assign_user, " +
      "has_function_privilege(current_user, " +
      "'public.remove_user_from_branch(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_remove_user, " +
      "has_function_privilege(current_user, " +
      "'public.create_legal_entity(text, text, text, text, text, jsonb, text, text, uuid)'::regprocedure, 'EXECUTE') AS can_create_legal_entity, " +
      "has_function_privilege(current_user, " +
      "'public.create_branch(text, text, uuid[], uuid)'::regprocedure, 'EXECUTE') AS can_create_branch, " +
      "has_function_privilege(current_user, " +
      "'public.assign_branch_legal_entity(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_assign_entity, " +
      "has_function_privilege(current_user, " +
      "'public.remove_branch_legal_entity(uuid, uuid, uuid)'::regprocedure, 'EXECUTE') AS can_remove_entity",
    )
    assert.deepEqual(legalStructurePrivileges.rows[0], {
      legal_read: true,
      legal_insert: false,
      legal_update: false,
      legal_delete: false,
      branch_read: true,
      branch_insert: false,
      branch_update: false,
      branch_delete: false,
      relation_read: true,
      relation_insert: false,
      relation_update: false,
      relation_delete: false,
      assignment_read: true,
      assignment_insert: false,
      assignment_update: false,
      assignment_delete: false,
      lifecycle_read: true,
      lifecycle_insert: false,
      lifecycle_update: false,
      lifecycle_delete: false,
      can_change_branch_status: true,
      can_call_order_guard: false,
      can_assign_user: true,
      can_remove_user: true,
      can_create_legal_entity: true,
      can_create_branch: true,
      can_assign_entity: true,
      can_remove_entity: true,
    })

    const organizationHistoryPrivileges = await runtime.query(
      "SELECT " +
      "has_table_privilege(current_user, 'public.organization_change_events', 'SELECT') AS can_read, " +
      "has_table_privilege(current_user, 'public.organization_change_events', 'INSERT') AS can_insert, " +
      "has_table_privilege(current_user, 'public.organization_change_events', 'UPDATE') AS can_update, " +
      "has_table_privilege(current_user, 'public.organization_change_events', 'DELETE') AS can_delete, " +
      "has_function_privilege(current_user, " +
      "'public.list_organization_history(uuid, integer, timestamp with time zone, uuid, text, uuid)'::regprocedure, 'EXECUTE') AS can_list",
    )
    assert.deepEqual(organizationHistoryPrivileges.rows[0], {
      can_read: false,
      can_insert: false,
      can_update: false,
      can_delete: false,
      can_list: true,
    })
    await assert.rejects(
      runtime.query("SELECT * FROM public.organization_change_events"),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "INSERT INTO public.organization_change_events " +
        "(organization_id, resource_type, resource_id, action, after_state, actor_user_id) " +
        "VALUES ($1, 'organization', $1, 'created', '{}'::jsonb, $2)",
        ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "UPDATE public.organization_change_events SET metadata = '{}'::jsonb WHERE organization_id = $1",
        ["11111111-1111-4111-8111-111111111111"],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "DELETE FROM public.organization_change_events WHERE organization_id = $1",
        ["11111111-1111-4111-8111-111111111111"],
      ),
      (error) => error.code === "42501",
    )

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

    const legalEntityOne = await runtime.query(
      "SELECT * FROM public.create_legal_entity($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
      [
        "Restaurantes de Colombia S.A.S.",
        "Chili Colombia",
        "CO",
        "NIT",
        "900123456-7",
        JSON.stringify({ country_code: "CO", locality: "Medellín" }),
        "legal-one@example.invalid",
        "+57 300 000 0000",
        organizationAdminId,
      ],
    )
    assert.equal(legalEntityOne.rowCount, 1)
    legalEntityIds.push(legalEntityOne.rows[0].id)

    const legalEntityTwo = await runtime.query(
      "SELECT * FROM public.create_legal_entity($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
      [
        "Restaurantes Bogotá S.A.S.",
        "Chili Bogotá",
        "CO",
        "NIT",
        "901987654-3",
        JSON.stringify({ country_code: "CO", locality: "Bogotá" }),
        "legal-two@example.invalid",
        "+57 301 000 0000",
        organizationAdminId,
      ],
    )
    assert.equal(legalEntityTwo.rowCount, 1)
    legalEntityIds.push(legalEntityTwo.rows[0].id)

    const duplicateLegalEntity = await runtime.query(
      "SELECT * FROM public.create_legal_entity($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
      [
        "Duplicated NIT",
        null,
        "CO",
        "NIT",
        "900123456-7",
        null,
        null,
        null,
        organizationAdminId,
      ],
    )
    assert.equal(duplicateLegalEntity.rowCount, 0)

    const duplicateTaxIdentityUpdate = await runtime.query(
      "SELECT * FROM public.update_legal_entity($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)",
      [
        legalEntityIds[1],
        "Restaurantes Bogotá S.A.S.",
        "Duplicated tax identity",
        "CO",
        "NIT",
        "900123456-7",
        null,
        null,
        null,
        organizationAdminId,
      ],
    )
    assert.equal(duplicateTaxIdentityUpdate.rowCount, 0)

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.create_legal_entity($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
        ["Staff entity", null, "CO", "NIT", "800123456-1", null, null, null, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const legalEntityUpdate = await runtime.query(
      "SELECT * FROM public.update_legal_entity($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)",
      [
        legalEntityIds[0],
        "Restaurantes de Colombia S.A.S.",
        "Chili Colombia Grupo",
        "CO",
        "NIT",
        "900123456-7",
        JSON.stringify({ country_code: "CO", locality: "Medellín" }),
        "legal-one@example.invalid",
        "+57 300 000 0000",
        organizationAdminId,
      ],
    )
    assert.equal(legalEntityUpdate.rowCount, 1)
    assert.equal(legalEntityUpdate.rows[0].commercial_name, "Chili Colombia Grupo")

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.update_legal_entity($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)",
        [
          legalEntityIds[0],
          "Unauthorized",
          null,
          "CO",
          "NIT",
          "900123456-7",
          null,
          null,
          null,
          organizationStaffId,
        ],
      ),
      (error) => error.code === "42501",
    )

    const branchCreate = await runtime.query(
      "SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)",
      ["BOG-01", "Chili Bogotá Centro", legalEntityIds, organizationAdminId],
    )
    assert.equal(branchCreate.rowCount, 1)
    assert.equal(branchCreate.rows[0].outcome, "CREATED")
    branchId = branchCreate.rows[0].created_branch_id

    const branchLocalPrivileges = await runtime.query(
      "SELECT " +
      "has_table_privilege(current_user, 'public.branch_calendar_exceptions', 'SELECT') AS calendar_read, " +
      "has_table_privilege(current_user, 'public.branch_calendar_exceptions', 'INSERT') AS calendar_insert, " +
      "has_table_privilege(current_user, 'public.branch_calendar_exceptions', 'UPDATE') AS calendar_update, " +
      "has_table_privilege(current_user, 'public.branch_calendar_exceptions', 'DELETE') AS calendar_delete, " +
      "has_table_privilege(current_user, 'public.branch_local_configuration_events', 'SELECT') AS local_audit_read, " +
      "has_table_privilege(current_user, 'public.branch_local_configuration_events', 'INSERT') AS local_audit_insert, " +
      "has_function_privilege(current_user, 'public.update_branch_local_configuration(uuid, jsonb, text, text, jsonb, uuid)'::regprocedure, 'EXECUTE') AS can_update_local_config, " +
      "has_function_privilege(current_user, 'public.upsert_branch_calendar_exception(uuid, date, text, jsonb, text, uuid)'::regprocedure, 'EXECUTE') AS can_upsert_calendar, " +
      "has_function_privilege(current_user, 'public.delete_branch_calendar_exception(uuid, date, uuid)'::regprocedure, 'EXECUTE') AS can_delete_calendar",
    )
    assert.deepEqual(branchLocalPrivileges.rows[0], {
      calendar_read: true,
      calendar_insert: false,
      calendar_update: false,
      calendar_delete: false,
      local_audit_read: true,
      local_audit_insert: false,
      can_update_local_config: true,
      can_upsert_calendar: true,
      can_delete_calendar: true,
    })

    const localAddress = {
      line_1: "Carrera 10 # 20-30",
      line_2: "Local 4",
      locality: "Bogotá",
      administrative_area: "Bogotá D.C.",
      postal_code: "110111",
      country_code: "CO",
    }
    const weeklyHours = [
      { weekday: 1, opens_at: "09:00", closes_at: "13:00", closes_next_day: false },
      { weekday: 1, opens_at: "14:00", closes_at: "22:00", closes_next_day: false },
      { weekday: 7, opens_at: "22:00", closes_at: "02:00", closes_next_day: true },
    ]
    const localConfig = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), "America/Bogota", "COP", JSON.stringify(weeklyHours), organizationAdminId],
    )
    assert.equal(localConfig.rows[0].outcome, "UPDATED")

    const savedLocalConfig = await runtime.query(
      "SELECT operational_address, time_zone, currency_code, weekly_hours " +
      "FROM public.branches WHERE id = $1",
      [branchId],
    )
    assert.deepEqual(savedLocalConfig.rows[0].operational_address, localAddress)
    assert.equal(savedLocalConfig.rows[0].time_zone, "America/Bogota")
    assert.equal(savedLocalConfig.rows[0].currency_code, "COP")
    assert.deepEqual(savedLocalConfig.rows[0].weekly_hours, weeklyHours)

    const invalidTimeZone = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), "Not/A_Time_Zone", "COP", "[]", organizationAdminId],
    )
    assert.equal(invalidTimeZone.rows[0].outcome, "INVALID_TIME_ZONE")

    const invalidCurrency = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), "America/Bogota", "CO", "[]", organizationAdminId],
    )
    assert.equal(invalidCurrency.rows[0].outcome, "INVALID_CURRENCY")

    const invalidAddress = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify({ line_1: " ", locality: "Bogotá", country_code: "CO" }), "America/Bogota", "COP", "[]", organizationAdminId],
    )
    assert.equal(invalidAddress.rows[0].outcome, "INVALID_ADDRESS")

    const missingAddressFields = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, '[]'::jsonb, $5) AS outcome",
      [branchId, JSON.stringify({}), "America/Bogota", "COP", organizationAdminId],
    )
    assert.equal(missingAddressFields.rows[0].outcome, "INVALID_ADDRESS")

    const overlappingHours = [
      { weekday: 1, opens_at: "09:00", closes_at: "13:00", closes_next_day: false },
      { weekday: 1, opens_at: "12:30", closes_at: "17:00", closes_next_day: false },
    ]
    const invalidWeeklyHours = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), "America/Bogota", "COP", JSON.stringify(overlappingHours), organizationAdminId],
    )
    assert.equal(invalidWeeklyHours.rows[0].outcome, "INVALID_WEEKLY_HOURS")

    const overnightOverlap = [
      { weekday: 7, opens_at: "22:00", closes_at: "04:00", closes_next_day: true },
      { weekday: 1, opens_at: "03:00", closes_at: "08:00", closes_next_day: false },
    ]
    const overlappingAcrossWeekBoundary = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), "America/Bogota", "COP", JSON.stringify(overnightOverlap), organizationAdminId],
    )
    assert.equal(overlappingAcrossWeekBoundary.rows[0].outcome, "INVALID_WEEKLY_HOURS")

    const missingTimeZoneForHours = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6) AS outcome",
      [branchId, JSON.stringify(localAddress), null, "COP", JSON.stringify(weeklyHours), organizationAdminId],
    )
    assert.equal(missingTimeZoneForHours.rows[0].outcome, "TIME_ZONE_REQUIRED")

    await assert.rejects(
      runtime.query(
        "SELECT public.update_branch_local_configuration($1, $2::jsonb, $3, $4, $5::jsonb, $6)",
        [branchId, JSON.stringify(localAddress), "America/Bogota", "COP", "[]", organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const exceptionPeriods = [
      { opens_at: "10:00", closes_at: "14:00", closes_next_day: false },
      { opens_at: "16:00", closes_at: "20:00", closes_next_day: false },
    ]
    const savedSpecialHours = await runtime.query(
      "SELECT public.upsert_branch_calendar_exception($1, $2::date, $3, $4::jsonb, $5, $6) AS outcome",
      [branchId, "2027-01-01", "special_hours", JSON.stringify(exceptionPeriods), "Jornada especial de año nuevo", organizationAdminId],
    )
    assert.equal(savedSpecialHours.rows[0].outcome, "SAVED")

    const savedClosedDate = await runtime.query(
      "SELECT public.upsert_branch_calendar_exception($1, $2::date, $3, $4::jsonb, $5, $6) AS outcome",
      [branchId, "2027-01-02", "closed", "[]", "Cierre por mantenimiento", organizationAdminId],
    )
    assert.equal(savedClosedDate.rows[0].outcome, "SAVED")

    const calendarRows = await runtime.query(
      "SELECT to_char(local_date, 'YYYY-MM-DD') AS local_date, kind, periods, reason " +
      "FROM public.branch_calendar_exceptions WHERE branch_id = $1 ORDER BY local_date",
      [branchId],
    )
    assert.deepEqual(calendarRows.rows.map((row) => row.local_date), ["2027-01-01", "2027-01-02"])
    assert.equal(calendarRows.rows[0].kind, "special_hours")
    assert.deepEqual(calendarRows.rows[0].periods, exceptionPeriods)
    assert.equal(calendarRows.rows[1].kind, "closed")
    assert.deepEqual(calendarRows.rows[1].periods, [])

    const deletedClosedDate = await runtime.query(
      "SELECT public.delete_branch_calendar_exception($1, $2::date, $3) AS outcome",
      [branchId, "2027-01-02", organizationAdminId],
    )
    assert.equal(deletedClosedDate.rows[0].outcome, "DELETED")
    const localAudit = await runtime.query(
      "SELECT event_type, actor_user_id FROM public.branch_local_configuration_events " +
      "WHERE branch_id = $1 ORDER BY sequence",
      [branchId],
    )
    assert.deepEqual(localAudit.rows.map((event) => event.event_type), [
      "configuration.updated",
      "calendar.upserted",
      "calendar.upserted",
      "calendar.deleted",
    ])
    assert.ok(localAudit.rows.every((event) => event.actor_user_id === organizationAdminId))

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_calendar_exceptions " +
        "(organization_id, branch_id, local_date, kind, periods, reason, created_by_user_id, updated_by_user_id) " +
        "VALUES ($1, $2, '2027-01-03', 'closed', '[]'::jsonb, 'Direct write', $3, $3)",
        [organizationId, branchId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "UPDATE public.branch_local_configuration_events SET event_type = 'calendar.deleted' WHERE branch_id = $1",
        [branchId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.upsert_branch_calendar_exception($1, $2::date, $3, $4::jsonb, $5, $6)",
        [branchId, "2027-01-04", "closed", "[]", "No owner", organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const staffAssignment = await runtime.query(
      "SELECT public.assign_user_to_branch($1, $2, $3) AS outcome",
      [branchId, organizationStaffId, organizationAdminId],
    )
    assert.equal(staffAssignment.rows[0].outcome, "ASSIGNED")

    const duplicateStaffAssignment = await runtime.query(
      "SELECT public.assign_user_to_branch($1, $2, $3) AS outcome",
      [branchId, organizationStaffId, organizationAdminId],
    )
    assert.equal(duplicateStaffAssignment.rows[0].outcome, "ALREADY_ASSIGNED")

    await assert.rejects(
      runtime.query(
        "SELECT public.assign_user_to_branch($1, $2, $3)",
        [branchId, organizationAdminId, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const branchRelations = await runtime.query(
      "SELECT legal_entity_id FROM public.branch_legal_entities " +
      "WHERE organization_id = $1 AND branch_id = $2 ORDER BY legal_entity_id",
      [organizationId, branchId],
    )
    assert.equal(branchRelations.rowCount, 2)

    await assert.rejects(
      migrator.query("DELETE FROM public.legal_entities WHERE id = $1", [legalEntityIds[0]]),
      (error) => error.code === "23503",
    )

    const secondBranch = await runtime.query(
      "SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)",
      ["MED-01", "Chili Medellín Poblado", [legalEntityIds[0]], organizationAdminId],
    )
    assert.equal(secondBranch.rows[0].outcome, "CREATED")
    secondBranchId = secondBranch.rows[0].created_branch_id

    const secondStaffAssignment = await runtime.query(
      "SELECT public.assign_user_to_branch($1, $2, $3) AS outcome",
      [secondBranchId, organizationStaffId, organizationAdminId],
    )
    assert.equal(secondStaffAssignment.rows[0].outcome, "ASSIGNED")

    const firstBranchTable = await runtime.query(
      "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
      [branchId, "Mesa 1", 4, organizationStaffId],
    )
    assert.equal(firstBranchTable.rows[0].outcome, "CREATED")
    const firstTableId = firstBranchTable.rows[0].created_table_id

    const duplicateTable = await runtime.query(
      "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
      [branchId, "Mesa 1", 4, organizationStaffId],
    )
    assert.equal(duplicateTable.rows[0].outcome, "TABLE_NUMBER_EXISTS")

    const secondBranchTable = await runtime.query(
      "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
      [secondBranchId, "Mesa 1", 4, organizationStaffId],
    )
    assert.equal(secondBranchTable.rows[0].outcome, "CREATED")
    const secondTableId = secondBranchTable.rows[0].created_table_id

    const concurrentTableCreates = await Promise.all([
      runtime.query(
        "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
        [branchId, "Mesa Concurrente", 2, organizationStaffId],
      ),
      runtime.query(
        "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
        [branchId, "Mesa Concurrente", 2, organizationStaffId],
      ),
    ])
    assert.deepEqual(
      concurrentTableCreates.map((result) => result.rows[0].outcome).sort(),
      ["CREATED", "TABLE_NUMBER_EXISTS"],
    )

    const legacyTable = await migrator.query(
      "INSERT INTO public.tables (number, capacity) VALUES ($1, $2) RETURNING id",
      ["Mesa histórica sin sucursal", 2],
    )
    legacyTableId = legacyTable.rows[0].id
    const legacyReservation = await migrator.query(
      "INSERT INTO public.reservations " +
      "(customer_name, table_id, reservation_date, party_size) " +
      "VALUES ($1, $2, $3::timestamptz, $4) RETURNING id",
      ["Reserva histórica sin sucursal", legacyTableId, "2027-02-10T17:00:00.000Z", 2],
    )
    legacyReservationId = legacyReservation.rows[0].id

    const branchOneTables = await runtime.query(
      "SELECT * FROM public.list_branch_tables($1, $2)",
      [branchId, organizationStaffId],
    )
    const branchTwoTables = await runtime.query(
      "SELECT * FROM public.list_branch_tables($1, $2)",
      [secondBranchId, organizationStaffId],
    )
    assert.equal(branchOneTables.rows.length, 2)
    assert.ok(branchOneTables.rows.every((row) => row.branch_id === branchId))
    assert.ok(branchOneTables.rows.every((row) => row.id !== legacyTableId))
    assert.equal(branchTwoTables.rows.length, 1)
    assert.equal(branchTwoTables.rows[0].branch_id, secondBranchId)

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.list_branch_tables($1, $2)",
        [branchId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    const firstReservation = await runtime.query(
      "SELECT * FROM public.create_branch_reservation(" +
      "$1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9)",
      [
        branchId,
        "Cliente sucursal uno",
        "+573001112233",
        "guest-one@example.invalid",
        firstTableId,
        "2027-02-10T18:30:00.000Z",
        3,
        "Reserva de prueba",
        organizationStaffId,
      ],
    )
    assert.equal(firstReservation.rows[0].outcome, "CREATED")
    const reservationId = firstReservation.rows[0].created_reservation_id

    const branchOneReservations = await runtime.query(
      "SELECT * FROM public.list_branch_reservations(" +
      "$1, $2, NULL::timestamptz, NULL::timestamptz, NULL::text)",
      [branchId, organizationStaffId],
    )
    const branchTwoReservations = await runtime.query(
      "SELECT * FROM public.list_branch_reservations(" +
      "$1, $2, NULL::timestamptz, NULL::timestamptz, NULL::text)",
      [secondBranchId, organizationStaffId],
    )
    assert.equal(branchOneReservations.rowCount, 1)
    assert.equal(branchOneReservations.rows[0].branch_id, branchId)
    assert.notEqual(branchOneReservations.rows[0].id, legacyReservationId)
    assert.equal(branchTwoReservations.rowCount, 0)

    const foreignTableReservation = await runtime.query(
      "SELECT * FROM public.create_branch_reservation(" +
      "$1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9)",
      [
        secondBranchId,
        "Reserva cruzada",
        null,
        null,
        firstTableId,
        "2027-02-10T19:00:00.000Z",
        2,
        null,
        organizationStaffId,
      ],
    )
    assert.equal(foreignTableReservation.rows[0].outcome, "TABLE_NOT_IN_BRANCH")

    const foreignTableUpdate = await runtime.query(
      "SELECT public.update_branch_table($1, $2, $3, NULL, false, $4) AS outcome",
      [firstTableId, secondBranchId, "occupied", organizationStaffId],
    )
    assert.equal(foreignTableUpdate.rows[0].outcome, "TABLE_NOT_FOUND")

    const foreignReservationUpdate = await runtime.query(
      "SELECT public.update_branch_reservation_status($1, $2, $3, $4) AS outcome",
      [reservationId, secondBranchId, "seated", organizationStaffId],
    )
    assert.equal(foreignReservationUpdate.rows[0].outcome, "RESERVATION_NOT_FOUND")

    const updatedReservation = await runtime.query(
      "SELECT public.update_branch_reservation_status($1, $2, $3, $4) AS outcome",
      [reservationId, branchId, "seated", organizationStaffId],
    )
    assert.equal(updatedReservation.rows[0].outcome, "UPDATED")

    const suspendedSecondBranch = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [secondBranchId, "suspended", organizationAdminId],
    )
    assert.equal(suspendedSecondBranch.rows[0].outcome, "CHANGED")
    const tableWriteWhileSuspended = await runtime.query(
      "SELECT * FROM public.create_branch_table($1, $2, $3, $4)",
      [secondBranchId, "No disponible", 2, organizationStaffId],
    )
    assert.equal(tableWriteWhileSuspended.rows[0].outcome, "BRANCH_NOT_ACTIVE")
    const reservationWriteWhileSuspended = await runtime.query(
      "SELECT * FROM public.create_branch_reservation(" +
      "$1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9)",
      [
        secondBranchId,
        "No disponible",
        null,
        null,
        secondTableId,
        "2027-02-10T20:00:00.000Z",
        2,
        null,
        organizationStaffId,
      ],
    )
    assert.equal(reservationWriteWhileSuspended.rows[0].outcome, "BRANCH_NOT_ACTIVE")
    const readWhileSuspended = await runtime.query(
      "SELECT * FROM public.list_branch_tables($1, $2)",
      [secondBranchId, organizationStaffId],
    )
    assert.equal(readWhileSuspended.rowCount, 1)
    const reactivatedSecondBranch = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [secondBranchId, "active", organizationAdminId],
    )
    assert.equal(reactivatedSecondBranch.rows[0].outcome, "CHANGED")

    const staffBranchCount = await runtime.query(
      "SELECT count(*)::integer AS branch_count FROM public.branch_user_assignments WHERE user_id = $1",
      [organizationStaffId],
    )
    assert.equal(staffBranchCount.rows[0].branch_count, 2)

    const legalEntityBranchCount = await runtime.query(
      "SELECT count(*)::integer AS branch_count FROM public.branch_legal_entities " +
      "WHERE organization_id = $1 AND legal_entity_id = $2",
      [organizationId, legalEntityIds[0]],
    )
    assert.equal(legalEntityBranchCount.rows[0].branch_count, 2)

    const duplicateBranch = await runtime.query(
      "SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)",
      ["BOG-01", "Duplicate branch", legalEntityIds, organizationAdminId],
    )
    assert.equal(duplicateBranch.rows[0].outcome, "BRANCH_CODE_ALREADY_EXISTS")

    const missingLegalEntity = await runtime.query(
      "SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)",
      ["BOG-03", "Branch without legal entity", [], organizationAdminId],
    )
    assert.equal(missingLegalEntity.rows[0].outcome, "LEGAL_ENTITY_REQUIRED")

    const invalidBranchScope = await runtime.query(
      "SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)",
      ["BOG-02", "Invalid branch", ["00000000-0000-0000-0000-000000000000"], organizationAdminId],
    )
    assert.equal(invalidBranchScope.rows[0].outcome, "LEGAL_ENTITY_SCOPE_INVALID")

    const duplicateBranchEntity = await runtime.query(
      "SELECT * FROM public.assign_branch_legal_entity($1, $2, $3)",
      [branchId, legalEntityIds[0], organizationAdminId],
    )
    assert.equal(duplicateBranchEntity.rowCount, 0)

    const invalidBranchAssignment = await runtime.query(
      "SELECT * FROM public.assign_branch_legal_entity($1, $2, $3)",
      [branchId, "00000000-0000-0000-0000-000000000000", organizationAdminId],
    )
    assert.equal(invalidBranchAssignment.rowCount, 0)

    const branchUpdate = await runtime.query(
      "SELECT * FROM public.update_branch_identity($1, $2, $3, $4)",
      [branchId, "BOG-01", "Chili Bogotá Centro Histórico", organizationAdminId],
    )
    assert.equal(branchUpdate.rowCount, 1)
    assert.equal(branchUpdate.rows[0].name, "Chili Bogotá Centro Histórico")

    const concurrentLinkRemovals = await Promise.all([
      runtime.query(
        "SELECT public.remove_branch_legal_entity($1, $2, $3) AS outcome",
        [branchId, legalEntityIds[0], organizationAdminId],
      ),
      runtime.query(
        "SELECT public.remove_branch_legal_entity($1, $2, $3) AS outcome",
        [branchId, legalEntityIds[1], organizationAdminId],
      ),
    ])
    const removalOutcomes = concurrentLinkRemovals.map((result) => result.rows[0].outcome)
    assert.deepEqual(removalOutcomes.sort(), ["LAST_LEGAL_ENTITY", "REMOVED"])

    const remainingLink = await runtime.query(
      "SELECT legal_entity_id FROM public.branch_legal_entities WHERE branch_id = $1",
      [branchId],
    )
    assert.equal(remainingLink.rowCount, 1)

    const reAddedLink = await runtime.query(
      "SELECT * FROM public.assign_branch_legal_entity($1, $2, $3)",
      [branchId, legalEntityIds.find((id) => id !== remainingLink.rows[0].legal_entity_id), organizationAdminId],
    )
    assert.equal(reAddedLink.rowCount, 1)

    for (const [table, columns, values] of [
      ["legal_entities", "(organization_id, legal_name, tax_country_code, tax_identifier_type, tax_identifier, created_by_user_id, updated_by_user_id)", "((SELECT id FROM public.organizations WHERE installation_slot = 1), 'Direct bypass', 'CO', 'NIT', '800000000-1', $1, $1)"],
      ["branches", "(organization_id, code, name, created_by_user_id, updated_by_user_id)", "((SELECT id FROM public.organizations WHERE installation_slot = 1), 'BYPASS', 'Direct bypass', $1, $1)"],
    ]) {
      await assert.rejects(
        runtime.query(`INSERT INTO public.${table} ${columns} VALUES ${values}`, [organizationAdminId]),
        (error) => error.code === "42501",
      )
    }

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_legal_entities " +
        "(organization_id, branch_id, legal_entity_id, created_by_user_id) VALUES ($1, $2, $3, $4)",
        [organizationId, branchId, legalEntityIds[0], organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.branch_legal_entities SET created_at = now() WHERE organization_id = $1 AND branch_id = $2",
        [organizationId, branchId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "DELETE FROM public.branch_legal_entities WHERE organization_id = $1 AND branch_id = $2",
        [organizationId, branchId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_user_assignments (organization_id, branch_id, user_id, assigned_by_user_id) VALUES ($1, $2, $3, $4)",
        [organizationId, branchId, organizationStaffId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.legal_entities SET legal_name = 'Direct update bypass' WHERE id = $1",
        [legalEntityIds[0]],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "DELETE FROM public.legal_entities WHERE id = $1",
        [legalEntityIds[0]],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "UPDATE public.branches SET name = 'Direct update bypass' WHERE id = $1",
        [branchId],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "DELETE FROM public.branches WHERE id = $1",
        [branchId],
      ),
      (error) => error.code === "42501",
    )

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
        "007_create_legal_entities_and_branch_relations.sql",
        "008_branch_assignments_and_order_context.sql",
        "009_branch_lifecycle_and_read_only_state.sql",
        "010_branch_local_configuration_and_calendar.sql",
        "011_branch_scoped_tables_and_reservations.sql",
        "012_organization_change_history.sql",
        "013_corporate_catalog_branch_assortment.sql",
        "014_corporate_catalog_crud_and_order_snapshots.sql",
        "015_recipes_and_ingredients.sql",
        "016_recipe_component_integrity.sql",
        "017_product_variants_and_branch_options.sql",
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

    const variantProduct = await runtime.query(
      "INSERT INTO public.products (name, price, type, category_id, discount_percentage) " +
      "VALUES ($1, $2, $3, $4, 0) RETURNING id",
      ["CI configurable product", "8.75", "Veg", null],
    )
    variantProductId = variantProduct.rows[0].id
    const presentationGroup = await runtime.query(
      "INSERT INTO public.product_option_groups " +
      "(organization_id, product_id, kind, name, min_selections, max_selections, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, $2, 'presentation', 'Presentación CI', 1, 1, 0, false, $3, $3) RETURNING id",
      [organizationId, variantProductId, organizationAdminId],
    )
    const presentationGroupId = presentationGroup.rows[0].id
    const presentationOptions = await runtime.query(
      "INSERT INTO public.product_options (group_id, name, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, 'Mediana CI', 0, true, $2, $2), ($1, 'Grande CI', 1, true, $2, $2) RETURNING id, name",
      [presentationGroupId, organizationAdminId],
    )
    const mediumOptionId = presentationOptions.rows.find((row) => row.name === "Mediana CI").id
    const largeOptionId = presentationOptions.rows.find((row) => row.name === "Grande CI").id
    await runtime.query("UPDATE public.product_option_groups SET is_active = true WHERE id = $1", [presentationGroupId])

    const modifierGroup = await runtime.query(
      "INSERT INTO public.product_option_groups " +
      "(organization_id, product_id, kind, name, min_selections, max_selections, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, $2, 'modifier', 'Extras CI', 0, 2, 1, true, $3, $3) RETURNING id",
      [organizationId, variantProductId, organizationAdminId],
    )
    const modifierGroupId = modifierGroup.rows[0].id
    const modifierOptions = await runtime.query(
      "INSERT INTO public.product_options (group_id, name, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, 'Queso CI', 0, true, $2, $2), ($1, 'Tocino CI', 1, true, $2, $2) RETURNING id, name",
      [modifierGroupId, organizationAdminId],
    )
    const cheeseOptionId = modifierOptions.rows.find((row) => row.name === "Queso CI").id
    const baconOptionId = modifierOptions.rows.find((row) => row.name === "Tocino CI").id

    const secondProduct = await runtime.query(
      "INSERT INTO public.products (name, price, type, category_id, discount_percentage) " +
      "VALUES ($1, $2, $3, $4, 0) RETURNING id",
      ["CI another product", "4.00", "Veg", null],
    )
    secondProductId = secondProduct.rows[0].id
    const foreignGroup = await runtime.query(
      "INSERT INTO public.product_option_groups " +
      "(organization_id, product_id, kind, name, min_selections, max_selections, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, $2, 'modifier', 'Otro grupo CI', 0, 1, 0, true, $3, $3) RETURNING id",
      [organizationId, secondProductId, organizationAdminId],
    )
    const foreignOption = await runtime.query(
      "INSERT INTO public.product_options (group_id, name, position, is_active, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, 'Opción externa CI', 0, true, $2, $2) RETURNING id",
      [foreignGroup.rows[0].id, organizationAdminId],
    )
    const foreignOptionId = foreignOption.rows[0].id

    const globalOptionEvent = await runtime.query(
      "INSERT INTO public.product_option_change_events " +
      "(organization_id, product_id, resource_type, resource_id, event_type, snapshot, actor_user_id) " +
      "VALUES ($1, $2, 'group', $3, 'created', $4::jsonb, $5) RETURNING id",
      [organizationId, variantProductId, presentationGroupId, JSON.stringify({ name: "Presentación CI" }), organizationAdminId],
    )
    await assert.rejects(
      migrator.query("UPDATE public.product_option_change_events SET snapshot = '{}'::jsonb WHERE id = $1", [globalOptionEvent.rows[0].id]),
      (error) => error.code === "55000",
    )

    const recipeIngredient = await runtime.query(
      "INSERT INTO public.ingredients (organization_id, name, unit_code, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, $2, $3, $4, $4) RETURNING id",
      [organizationId, "CI recipe flour", "g", organizationAdminId],
    )
    const recipeIngredientId = recipeIngredient.rows[0].id
    const productRecipe = await runtime.query(
      "INSERT INTO public.product_recipes (organization_id, product_id, preparation_instructions, created_by_user_id, updated_by_user_id) " +
      "VALUES ($1, $2, $3, $4, $4) RETURNING id",
      [organizationId, productId, "Mezclar y hornear.", organizationAdminId],
    )
    const productRecipeId = productRecipe.rows[0].id
    await runtime.query(
      "INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity, position) VALUES ($1, $2, $3::numeric, 0)",
      [productRecipeId, recipeIngredientId, "12.345678"],
    )
    const preciseRecipeQuantity = await runtime.query(
      "SELECT quantity::text AS quantity FROM public.recipe_ingredients WHERE recipe_id = $1 AND ingredient_id = $2",
      [productRecipeId, recipeIngredientId],
    )
    assert.equal(preciseRecipeQuantity.rows[0].quantity, "12.345678")
    await assert.rejects(
      runtime.query("UPDATE public.ingredients SET unit_code = 'kg' WHERE id = $1", [recipeIngredientId]),
      (error) => error.code === "23514" && error.message.includes("INGREDIENT_UNIT_IN_USE"),
    )
    const recipeEvent = await runtime.query(
      "INSERT INTO public.recipe_change_events (organization_id, recipe_id, event_type, snapshot, actor_user_id) " +
      "VALUES ($1, $2, 'created', $3::jsonb, $4) RETURNING id",
      [organizationId, productRecipeId, JSON.stringify({ product_id: productId, ingredients: [{ ingredient_id: recipeIngredientId, quantity: "12.345678" }] }), organizationAdminId],
    )
    await assert.rejects(
      migrator.query("UPDATE public.recipe_change_events SET snapshot = '{}'::jsonb WHERE id = $1", [recipeEvent.rows[0].id]),
      (error) => error.code === "55000",
    )
    await assert.rejects(
      migrator.query("DELETE FROM public.recipe_change_events WHERE id = $1", [recipeEvent.rows[0].id]),
      (error) => error.code === "55000",
    )
    await assert.rejects(
      migrator.query("UPDATE public.ingredients SET is_active = false WHERE id = $1", [recipeIngredientId]),
      (error) => error.code === "23514" && error.message.includes("INGREDIENT_IN_USE"),
    )


    const corporateCategoryRead = await runtime.query(`
      SELECT category.id, category.name, category.icon, category.is_active,
             (
               SELECT count(*)::integer
               FROM public.products AS product
               WHERE product.category_id = category.id AND product.is_active = true
             ) AS item_count
      FROM public.categories AS category
      ORDER BY category.is_active DESC, category.name, category.id
      LIMIT 500
    `)
    assert.equal(
      corporateCategoryRead.rows.find((row) => row.id === categoryId)?.item_count,
      1,
    )

    const inheritedCatalogOne = await runtime.query(
      "SELECT id, enabled FROM public.list_branch_catalog_products($1::uuid, $2::uuid) WHERE id = $3",
      [branchId, organizationAdminId, productId],
    )
    const inheritedCatalogTwo = await runtime.query(
      "SELECT id, enabled FROM public.list_branch_catalog_products($1::uuid, $2::uuid) WHERE id = $3",
      [secondBranchId, organizationAdminId, productId],
    )
    assert.equal(inheritedCatalogOne.rows[0].enabled, true)
    assert.equal(inheritedCatalogTwo.rows[0].enabled, true)

    const excludedProduct = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
      [branchId, productId, organizationAdminId],
    )
    assert.equal(excludedProduct.rows[0].outcome, "CHANGED")
    const repeatedExclusion = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
      [branchId, productId, organizationAdminId],
    )
    assert.equal(repeatedExclusion.rows[0].outcome, "UNCHANGED")

    const disabledCatalogOne = await runtime.query(
      "SELECT id, enabled FROM public.list_branch_catalog_products($1::uuid, $2::uuid) WHERE id = $3",
      [branchId, organizationAdminId, productId],
    )
    const unchangedCatalogTwo = await runtime.query(
      "SELECT id, enabled FROM public.list_branch_catalog_products($1::uuid, $2::uuid) WHERE id = $3",
      [secondBranchId, organizationAdminId, productId],
    )
    assert.equal(disabledCatalogOne.rows[0].enabled, false)
    assert.equal(unchangedCatalogTwo.rows[0].enabled, true)

    await assert.rejects(
      runtime.query(
        "SELECT public.set_branch_catalog_product_enabled($1, $2, true, $3)",
        [branchId, productId, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Excluded catalog product", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "55000" && error.message.includes("PRODUCT_NOT_ENABLED_FOR_BRANCH"),
    )

    const catalogAudit = await runtime.query(
      "SELECT previous_enabled, new_enabled, actor_user_id FROM public.branch_catalog_product_events " +
      "WHERE branch_id = $1 AND product_id = $2 ORDER BY sequence",
      [branchId, productId],
    )
    assert.equal(catalogAudit.rowCount, 1)
    assert.equal(catalogAudit.rows[0].previous_enabled, true)
    assert.equal(catalogAudit.rows[0].new_enabled, false)
    assert.equal(catalogAudit.rows[0].actor_user_id, organizationAdminId)

    await assert.rejects(
      migrator.query(
        "UPDATE public.branch_catalog_product_events SET product_name = product_name WHERE branch_id = $1 AND product_id = $2",
        [branchId, productId],
      ),
      (error) => error.code === "55000",
    )
    await assert.rejects(
      migrator.query(
        "DELETE FROM public.branch_catalog_product_events WHERE branch_id = $1 AND product_id = $2",
        [branchId, productId],
      ),
      (error) => error.code === "55000",
    )

    const reenabledProduct = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, true, $3) AS outcome",
      [branchId, productId, organizationAdminId],
    )

    assert.equal(reenabledProduct.rows[0].outcome, "CHANGED")

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_catalog_product_exclusions (organization_id, branch_id, product_id, excluded_by_user_id) VALUES ($1, $2, $3, $4)",
        [organizationId, branchId, productId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.list_branch_catalog_products($1::uuid, $2::uuid)",
        [branchId, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const concurrentExclusions = await Promise.all([
      runtime.query(
        "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
        [branchId, productId, organizationAdminId],
      ),
      runtime.query(
        "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
        [branchId, productId, organizationAdminId],
      ),
    ])
    assert.deepEqual(
      concurrentExclusions.map((result) => result.rows[0].outcome).sort(),
      ["CHANGED", "UNCHANGED"],
    )

    const restoreAfterConcurrency = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, true, $3) AS outcome",
      [branchId, productId, organizationAdminId],
    )
    assert.equal(restoreAfterConcurrency.rows[0].outcome, "CHANGED")

    await migrator.query(
      "UPDATE public.branches SET status = 'suspended', status_changed_at = now() WHERE id = $1",
      [branchId],
    )
    const suspendedBranchChange = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
      [branchId, productId, organizationAdminId],
    )
    assert.equal(suspendedBranchChange.rows[0].outcome, "BRANCH_NOT_ACTIVE")
    await migrator.query(
      "UPDATE public.branches SET status = 'active', status_changed_at = now() WHERE id = $1",
      [branchId],
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Unassigned operator", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null, branchId, legalEntityIds[0], organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Wrong legal entity for branch", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null, secondBranchId, legalEntityIds[1], organizationStaffId],
      ),
      (error) => error.code === "23503",
    )

    await assert.rejects(
      migrator.query(
        "INSERT INTO public.orders (table_number, order_type, total_amount, status) VALUES ($1, $2, $3, $4)",
        ["Unattributed direct insert", "Para llevar", 1, "pending"],
      ),
      (error) => error.code === "23514",
    )

    const order = await runtime.query(
      "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid) AS order_id",
      [
        "CI integration table",
        "Integration test",
        "Para llevar",
        JSON.stringify([{ id: productId, quantity: 2 }]),
        null,
        null,
        branchId,
        legalEntityIds[0],
        organizationStaffId,
      ],
    )
    orderId = order.rows[0].order_id

    const deliveryOrder = await runtime.query(
      "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid) AS order_id",
      [
        "CI delivery table",
        "Delivery integration",
        "A domicilio",
        JSON.stringify([{ id: productId, quantity: 1 }]),
        "Calle de prueba 123",
        "+573000000000",
        branchId,
        legalEntityIds[0],
        organizationStaffId,
      ],
    )
    deliveryOrderId = deliveryOrder.rows[0].order_id

    const deliveryAssignment = await runtime.query(
      "SELECT public.assign_delivery_driver($1, $2, $3, $4, $5::uuid, $6::uuid) AS delivery",
      [deliveryOrderId, "CI Driver", "+573000000001", 25, branchId, organizationStaffId],
    )
    assert.equal(deliveryAssignment.rows[0].delivery.driver_name, "CI Driver")

    // Branch exceptions require the organization owner and are isolated to one branch.
    await assert.rejects(
      runtime.query(
        "SELECT public.set_branch_product_option_availability($1, $2, false, $3, $4) AS outcome",
        [branchId, baconOptionId, "No disponible en esta sucursal", organizationStaffId],
      ),
      (error) => error.code === "42501",
    )
    const restrictedBacon = await runtime.query(
      "SELECT public.set_branch_product_option_availability($1, $2, false, $3, $4) AS outcome",
      [branchId, baconOptionId, "No disponible temporalmente", organizationAdminId],
    )
    assert.equal(restrictedBacon.rows[0].outcome, "CHANGED")
    const otherBranchOption = await runtime.query(
      "SELECT coalesce(override.is_enabled, true) AS enabled FROM public.branches AS branch " +
      "LEFT JOIN public.branch_product_option_overrides AS override " +
      "ON override.organization_id = branch.organization_id AND override.branch_id = branch.id AND override.option_id = $2 " +
      "WHERE branch.id = $1",
      [secondBranchId, baconOptionId],
    )
    assert.equal(otherBranchOption.rows[0].enabled, true)
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Restricted option", "Integration test", "Para llevar",
          JSON.stringify([{ id: variantProductId, quantity: 1, option_ids: [mediumOptionId, baconOptionId] }]),
          null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "23514" && error.message.includes("PRODUCT_OPTION_INVALID_INACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH"),
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Missing presentation", "Integration test", "Para llevar",
          JSON.stringify([{ id: variantProductId, quantity: 1, option_ids: [] }]),
          null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "23514" && error.message.includes("PRODUCT_OPTION_GROUP_CARDINALITY_INVALID"),
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Wrong product option", "Integration test", "Para llevar",
          JSON.stringify([{ id: variantProductId, quantity: 1, option_ids: [mediumOptionId, foreignOptionId] }]),
          null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "23514" && error.message.includes("PRODUCT_OPTION_INVALID_INACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH"),
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Duplicate option", "Integration test", "Para llevar",
          JSON.stringify([{ id: variantProductId, quantity: 1, option_ids: [mediumOptionId, mediumOptionId] }]),
          null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "23514" && error.message.includes("Duplicate product option selection"),
    )

    const variantOrder = await runtime.query(
      "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid) AS order_id",
      ["CI variant table", "Variant integration", "Para llevar",
        JSON.stringify([{ id: variantProductId, quantity: 1, option_ids: [mediumOptionId, cheeseOptionId] }]),
        null, null, branchId, legalEntityIds[0], organizationStaffId],
    )
    variantOrderId = variantOrder.rows[0].order_id
    const variantSnapshot = await runtime.query(
      "SELECT product_name_at_order, price_at_order::text AS price_at_order, selected_option_ids, variant_selection_snapshot " +
      "FROM public.order_items WHERE order_id = $1",
      [variantOrderId],
    )
    assert.equal(variantSnapshot.rows[0].product_name_at_order, "CI configurable product")
    assert.equal(variantSnapshot.rows[0].price_at_order, "8.75")
    assert.deepEqual(variantSnapshot.rows[0].selected_option_ids.sort(), [mediumOptionId, cheeseOptionId].sort())
    assert.equal(variantSnapshot.rows[0].variant_selection_snapshot[0].name, "Mediana CI")
    assert.equal(variantSnapshot.rows[0].variant_selection_snapshot[1].name, "Queso CI")
    await migrator.query("UPDATE public.product_options SET name = 'Queso renombrado CI' WHERE id = $1", [cheeseOptionId])
    await migrator.query("UPDATE public.product_option_groups SET name = 'Extras renombrados CI' WHERE id = $1", [modifierGroupId])
    const preservedVariantSnapshot = await runtime.query(
      "SELECT variant_selection_snapshot FROM public.order_items WHERE order_id = $1",
      [variantOrderId],
    )
    assert.equal(preservedVariantSnapshot.rows[0].variant_selection_snapshot[1].name, "Queso CI")
    assert.equal(preservedVariantSnapshot.rows[0].variant_selection_snapshot[1].group_name, "Extras CI")
    await assert.rejects(
      migrator.query("UPDATE public.order_items SET variant_selection_snapshot = '[]'::jsonb WHERE order_id = $1", [variantOrderId]),
      (error) => error.code === "23514",
    )

    const restrictMedium = await runtime.query(
      "SELECT public.set_branch_product_option_availability($1, $2, false, $3, $4) AS outcome",
      [branchId, mediumOptionId, "Probar mínimo por sucursal", organizationAdminId],
    )
    assert.equal(restrictMedium.rows[0].outcome, "CHANGED")
    await assert.rejects(
      runtime.query("SELECT public.set_branch_product_option_availability($1, $2, false, $3, $4)",
        [branchId, largeOptionId, "No debe quedar sin presentación", organizationAdminId]),
      (error) => error.code === "23514" && error.message.includes("BRANCH_OPTION_WOULD_VIOLATE_GROUP_MINIMUM"),
    )
    const restoreMedium = await runtime.query(
      "SELECT public.clear_branch_product_option_override($1, $2, $3, $4) AS outcome",
      [branchId, mediumOptionId, "Restaurar herencia de presentación", organizationAdminId],
    )
    assert.equal(restoreMedium.rows[0].outcome, "CHANGED")
    const clearBacon = await runtime.query(
      "SELECT public.clear_branch_product_option_override($1, $2, $3, $4) AS outcome",
      [branchId, baconOptionId, "Restaurar herencia de tocino", organizationAdminId],
    )
    assert.equal(clearBacon.rows[0].outcome, "CHANGED")
    const optionHistory = await runtime.query(
      "SELECT previous_state, new_state, reason, actor_user_id FROM public.branch_product_option_events " +
      "WHERE branch_id = $1 AND option_id = $2 ORDER BY sequence",
      [branchId, baconOptionId],
    )
    assert.deepEqual(optionHistory.rows.map((row) => [row.previous_state, row.new_state]), [
      ["inherited", "disabled"], ["disabled", "inherited"],
    ])
    assert.equal(optionHistory.rows[0].actor_user_id, organizationAdminId)
    await assert.rejects(
      migrator.query("UPDATE public.branch_product_option_events SET reason = reason WHERE branch_id = $1", [branchId]),
      (error) => error.code === "55000",
    )
    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_product_option_overrides (organization_id, branch_id, option_id, is_enabled, reason, changed_by_user_id) " +
        "VALUES ($1, $2, $3, false, 'bypass', $4)",
        [organizationId, branchId, baconOptionId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )
    await runtime.query(
      "SELECT public.set_branch_product_option_availability($1, $2, false, $3, $4)",
      [branchId, baconOptionId, "Desactivar temporalmente para validar reactivación de surtido", organizationAdminId],
    )
    const excludedVariantProduct = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3) AS outcome",
      [branchId, variantProductId, organizationAdminId],
    )
    assert.equal(excludedVariantProduct.rows[0].outcome, "CHANGED")
    await migrator.query(
      "UPDATE public.product_option_groups SET min_selections = 2, max_selections = 2, updated_by_user_id = $2 WHERE id = $1",
      [modifierGroupId, organizationAdminId],
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.set_branch_catalog_product_enabled($1, $2, true, $3)",
        [branchId, variantProductId, organizationAdminId],
      ),
      (error) => error.code === "23514" && error.message.includes("BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED"),
    )
    const restoreBranchOption = await runtime.query(
      "SELECT public.clear_branch_product_option_override($1, $2, $3, $4) AS outcome",
      [branchId, baconOptionId, "Restaurar opción antes de volver a habilitar el producto", organizationAdminId],
    )
    assert.equal(restoreBranchOption.rows[0].outcome, "CHANGED")
    const reenabledVariantProduct = await runtime.query(
      "SELECT public.set_branch_catalog_product_enabled($1, $2, true, $3) AS outcome",
      [branchId, variantProductId, organizationAdminId],
    )
    assert.equal(reenabledVariantProduct.rows[0].outcome, "CHANGED")


    await assert.rejects(
      runtime.query(
        "SELECT public.assign_delivery_driver($1, $2, $3, $4, $5::uuid, $6::uuid)",
        [deliveryOrderId, "Wrong branch", null, 15, secondBranchId, organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const persistedOrder = await runtime.query(
      "SELECT o.total_amount::text AS total_amount, count(oi.id)::integer AS item_count, " +
      "o.organization_id, o.branch_id, o.legal_entity_id, o.created_by_user_id " +
      "FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id " +
      "WHERE o.id = $1 GROUP BY o.id",
      [orderId],
    )
    assert.equal(persistedOrder.rowCount, 1)
    assert.equal(persistedOrder.rows[0].total_amount, "25.00")
    assert.equal(persistedOrder.rows[0].item_count, 1)
    assert.equal(persistedOrder.rows[0].branch_id, branchId)
    assert.equal(persistedOrder.rows[0].legal_entity_id, legalEntityIds[0])
    assert.equal(persistedOrder.rows[0].created_by_user_id, organizationStaffId)

    const orderItemSnapshot = await runtime.query(
      "SELECT product_name_at_order, product_image_url_at_order FROM public.order_items WHERE order_id = $1",
      [orderId],
    )
    assert.equal(orderItemSnapshot.rows[0].product_name_at_order, "CI integration product")
    await migrator.query("UPDATE public.products SET name = 'Renamed corporate product' WHERE id = $1", [productId])
    const preservedOrderItemSnapshot = await runtime.query(
      "SELECT product_name_at_order FROM public.order_items WHERE order_id = $1",
      [orderId],
    )
    assert.equal(preservedOrderItemSnapshot.rows[0].product_name_at_order, "CI integration product")
    await assert.rejects(
      migrator.query(
        "UPDATE public.order_items SET product_name_at_order = 'tampered' WHERE order_id = $1",
        [orderId],
      ),
      (error) => error.code === "23514",
    )

    await migrator.query("UPDATE public.products SET is_active = false WHERE id = $1", [productId])
    await assert.rejects(
      runtime.query(
        "SELECT public.set_branch_catalog_product_enabled($1, $2, false, $3)",
        [branchId, productId, organizationAdminId],
      ),
      (error) => error.code === "23514" && error.message.includes("PRODUCT_NOT_ACTIVE"),
    )
    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Inactive product", "Integration test", "Para llevar",
          JSON.stringify([{ id: productId, quantity: 1 }]), null, null,
          branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "23514" && error.message.includes("PRODUCT_NOT_ACTIVE"),
    )
    await migrator.query("UPDATE public.products SET is_active = true WHERE id = $1", [productId])

    await assert.rejects(
      migrator.query(
        "UPDATE public.orders SET legal_entity_id = $2 WHERE id = $1",
        [orderId, legalEntityIds[1]],
      ),
      (error) => error.code === "23514",
    )

    const initialLifecycleEvents = await runtime.query(
      "SELECT previous_status, new_status, actor_user_id FROM public.branch_lifecycle_events " +
      "WHERE branch_id = $1 ORDER BY sequence",
      [branchId],
    )
    assert.equal(initialLifecycleEvents.rowCount, 1)
    assert.equal(initialLifecycleEvents.rows[0].previous_status, null)
    assert.equal(initialLifecycleEvents.rows[0].new_status, "active")
    assert.equal(initialLifecycleEvents.rows[0].actor_user_id, organizationAdminId)

    await assert.rejects(
      runtime.query(
        "INSERT INTO public.branch_lifecycle_events " +
        "(organization_id, branch_id, previous_status, new_status, actor_user_id) " +
        "VALUES ($1, $2, 'active', 'suspended', $3)",
        [organizationId, branchId, organizationAdminId],
      ),
      (error) => error.code === "42501",
    )

    // Hold a shared branch lock to prove that lifecycle changes serialize
    // against writes that hold the same lock for the duration of their transaction.
    const lockHolder = await migrator.connect()
    const lockWaiter = await runtime.connect()
    try {
      await lockHolder.query("BEGIN")
      await lockHolder.query(
        "SELECT id FROM public.branches WHERE id = $1 FOR SHARE",
        [branchId],
      )
      await lockWaiter.query("SET lock_timeout = '200ms'")
      await assert.rejects(
        lockWaiter.query(
          "SELECT public.change_branch_status($1, $2, $3)",
          [branchId, "suspended", organizationAdminId],
        ),
        (error) => error.code === "55P03",
      )
      await lockWaiter.query("ROLLBACK")
      await lockWaiter.query("RESET lock_timeout")
      await lockHolder.query("COMMIT")
      const serializedTransition = await lockWaiter.query(
        "SELECT public.change_branch_status($1, $2, $3) AS outcome",
        [branchId, "suspended", organizationAdminId],
      )
      assert.equal(serializedTransition.rows[0].outcome, "CHANGED")
    } finally {
      await lockHolder.query("ROLLBACK")
      await lockHolder.release()
      await lockWaiter.release()
    }

    const suspendedStatus = await runtime.query(
      "SELECT status FROM public.branches WHERE id = $1",
      [branchId],
    )
    assert.equal(suspendedStatus.rows[0].status, "suspended")

    const configWhileSuspended = await runtime.query(
      "SELECT public.update_branch_local_configuration($1, NULL, 'America/Bogota', 'COP', '[]'::jsonb, $2) AS outcome",
      [branchId, organizationAdminId],
    )
    assert.equal(configWhileSuspended.rows[0].outcome, "BRANCH_NOT_ACTIVE")
    const calendarWhileSuspended = await runtime.query(
      "SELECT public.upsert_branch_calendar_exception($1, '2027-01-05', 'closed', '[]'::jsonb, 'Suspendida', $2) AS outcome",
      [branchId, organizationAdminId],
    )
    assert.equal(calendarWhileSuspended.rows[0].outcome, "BRANCH_NOT_ACTIVE")
    const deleteCalendarWhileSuspended = await runtime.query(
      "SELECT public.delete_branch_calendar_exception($1, '2027-01-01', $2) AS outcome",
      [branchId, organizationAdminId],
    )
    assert.equal(deleteCalendarWhileSuspended.rows[0].outcome, "BRANCH_NOT_ACTIVE")

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Order while suspended", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.orders SET status = 'preparing', updated_at = now() WHERE id = $1",
        [orderId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "DELETE FROM public.orders WHERE id = $1",
        [orderId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.order_items SET quantity = quantity + 1 WHERE order_id = $1",
        [orderId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.delivery_info SET phone = '+573009999999' WHERE order_id = $1",
        [deliveryOrderId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "UPDATE public.branches SET name = 'Renamed while suspended' WHERE id = $1",
        [branchId],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.update_branch_identity($1, $2, $3, $4)",
        [branchId, "BOG-01", "Renamed while suspended", organizationAdminId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.assign_user_to_branch($1, $2, $3)",
        [branchId, organizationAdminId, organizationAdminId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.assign_branch_legal_entity($1, $2, $3)",
        [branchId, legalEntityIds[1], organizationAdminId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    const historicalOrdersWhileSuspended = await runtime.query(
      "SELECT id, branch_id FROM public.orders WHERE branch_id = $1 ORDER BY created_at",
      [branchId],
    )
    assert.equal(historicalOrdersWhileSuspended.rowCount, 2)
    assert.equal(historicalOrdersWhileSuspended.rows[0].branch_id, branchId)

    const idempotentSuspension = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [branchId, "suspended", organizationAdminId],
    )
    assert.equal(idempotentSuspension.rows[0].outcome, "UNCHANGED")

    const reactivatedBranch = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [branchId, "active", organizationAdminId],
    )
    assert.equal(reactivatedBranch.rows[0].outcome, "CHANGED")

    const closedBranch = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [branchId, "closed", organizationAdminId],
    )
    assert.equal(closedBranch.rows[0].outcome, "CHANGED")

    const closedMetadata = await runtime.query(
      "SELECT status, closed_at, closed_by_user_id FROM public.branches WHERE id = $1",
      [branchId],
    )
    assert.equal(closedMetadata.rows[0].status, "closed")
    assert.ok(closedMetadata.rows[0].closed_at)
    assert.equal(closedMetadata.rows[0].closed_by_user_id, organizationAdminId)

    const attemptedReopen = await runtime.query(
      "SELECT public.change_branch_status($1, $2, $3) AS outcome",
      [branchId, "active", organizationAdminId],
    )
    assert.equal(attemptedReopen.rows[0].outcome, "BRANCH_CLOSED")

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        ["Order after closure", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null, branchId, legalEntityIds[0], organizationStaffId],
      ),
      (error) => error.code === "55000" && error.message.includes("BRANCH_NOT_ACTIVE"),
    )

    const historicalOrdersAfterClosure = await runtime.query(
      "SELECT id, branch_id FROM public.orders WHERE branch_id = $1",
      [branchId],
    )
    assert.equal(historicalOrdersAfterClosure.rowCount, 2)

    const lifecycleEvents = await runtime.query(
      "SELECT previous_status, new_status, actor_user_id FROM public.branch_lifecycle_events " +
      "WHERE branch_id = $1 ORDER BY occurred_at, id",
      [branchId],
    )
    assert.deepEqual(
      lifecycleEvents.rows.map((event) => event.new_status),
      ["active", "suspended", "active", "closed"],
    )
    assert.equal(lifecycleEvents.rows[1].actor_user_id, organizationAdminId)

    const organizationHistory = await runtime.query(
      "SELECT id, resource_type, resource_id, branch_id, action, before_state, after_state, " +
      "metadata, actor_user_id, actor_email, occurred_at " +
      "FROM public.list_organization_history($1::uuid, $2::integer, NULL::timestamptz, " +
      "NULL::uuid, NULL::text, NULL::uuid)",
      [organizationAdminId, 101],
    )
    assert.ok(organizationHistory.rowCount > 10)
    assert.ok(organizationHistory.rows.every((event) => event.actor_user_id === organizationAdminId))
    assert.ok(organizationHistory.rows.every(
      (event) => event.actor_email.startsWith("org-admin-") && event.actor_email.endsWith("@example.invalid"),
    ))
    const historyKinds = organizationHistory.rows.map((event) => `${event.resource_type}:${event.action}`)
    for (const expected of [
      "organization:created",
      "organization:updated",
      "legal_entity:created",
      "legal_entity:updated",
      "branch:created",
      "branch:updated",
      "branch_legal_entity:associated",
      "branch_legal_entity:disassociated",
      "branch:branch.lifecycle.changed",
      "branch:configuration.updated",
      "branch:calendar.upserted",
      "branch:calendar.deleted",
    ]) {
      assert.ok(historyKinds.includes(expected), `Missing history event ${expected}`)
    }
    const legalEntitySnapshots = organizationHistory.rows.filter(
      (event) => event.resource_type === "legal_entity" && event.after_state?.tax_identifier,
    )
    assert.ok(legalEntitySnapshots.length > 0)
    const maskedTaxIdentifiers = legalEntitySnapshots.flatMap((event) => [
      event.before_state?.tax_identifier,
      event.after_state?.tax_identifier,
    ]).filter(Boolean)
    assert.ok(maskedTaxIdentifiers.length > 0)
    assert.ok(maskedTaxIdentifiers.every((identifier) => identifier.startsWith("****")))
    assert.ok(maskedTaxIdentifiers.every((identifier) => !identifier.includes("900123456-7")))

    const branchHistory = await runtime.query(
      "SELECT resource_type, branch_id FROM public.list_organization_history(" +
      "$1::uuid, $2::integer, NULL::timestamptz, NULL::uuid, $3::text, $4::uuid)",
      [organizationAdminId, 101, "branch", branchId],
    )
    assert.ok(branchHistory.rowCount > 0)
    assert.ok(branchHistory.rows.every((event) => event.resource_type === "branch" && event.branch_id === branchId))

    const firstHistoryPage = await runtime.query(
      "SELECT id, occurred_at FROM public.list_organization_history(" +
      "$1::uuid, $2::integer, NULL::timestamptz, NULL::uuid, NULL::text, NULL::uuid)",
      [organizationAdminId, 3],
    )
    assert.equal(firstHistoryPage.rowCount, 3)
    const lastFirstPageEvent = firstHistoryPage.rows[2]
    const secondHistoryPage = await runtime.query(
      "SELECT id, occurred_at FROM public.list_organization_history(" +
      "$1::uuid, $2::integer, $3::timestamptz, $4::uuid, NULL::text, NULL::uuid)",
      [organizationAdminId, 3, lastFirstPageEvent.occurred_at, lastFirstPageEvent.id],
    )
    assert.ok(secondHistoryPage.rowCount > 0)
    assert.ok(secondHistoryPage.rows.every(
      (event) => !firstHistoryPage.rows.some((first) => first.id === event.id),
    ))

    await assert.rejects(
      runtime.query(
        "SELECT * FROM public.list_organization_history(" +
        "$1::uuid, 50, NULL::timestamptz, NULL::uuid, NULL::text, NULL::uuid)",
        [organizationStaffId],
      ),
      (error) => error.code === "42501",
    )

    const firstHistoryId = await migrator.query(
      "SELECT id FROM public.organization_change_events ORDER BY sequence LIMIT 1",
    )
    assert.equal(firstHistoryId.rowCount, 1)
    await assert.rejects(
      migrator.query(
        "UPDATE public.organization_change_events SET metadata = metadata WHERE id = $1",
        [firstHistoryId.rows[0].id],
      ),
      (error) => error.code === "55000",
    )
    await assert.rejects(
      migrator.query(
        "DELETE FROM public.organization_change_events WHERE id = $1",
        [firstHistoryId.rows[0].id],
      ),
      (error) => error.code === "55000",
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6)",
        ["Legacy API", "Integration test", "Para llevar", JSON.stringify([{ id: productId, quantity: 1 }]), null, null],
      ),
      (error) => error.code === "42501",
    )

    await assert.rejects(
      runtime.query(
        "SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid)",
        [
          "CI invalid order",
          "Integration test",
          "INVALID",
          JSON.stringify([{ id: productId, quantity: 1 }]),
          null,
          null,
          branchId,
          legalEntityIds[0],
          organizationStaffId,
        ],
      ),
      /Invalid order type/,
    )

    await assert.rejects(
      runtime.query("UPDATE public.categories SET is_active = false WHERE id = $1", [categoryId]),
      (error) => error.code === "23514" && error.message.includes("CATEGORY_HAS_ACTIVE_PRODUCTS"),
    )

    await migrator.query("UPDATE public.products SET is_active = false WHERE id = $1", [productId])
    await migrator.query("UPDATE public.categories SET is_active = false WHERE id = $1", [categoryId])
    const preservedSnapshotAfterDeactivation = await runtime.query(
      "SELECT product_name_at_order FROM public.order_items WHERE order_id = $1",
      [orderId],
    )
    assert.equal(preservedSnapshotAfterDeactivation.rows[0].product_name_at_order, "CI integration product")
  } finally {
    // The integration database is isolated and starts empty. Remove organization
    // audit fixtures before deleting the referenced branch/organization rows.
    await migrator.query("TRUNCATE TABLE public.organization_change_events")
    // F2.1 catalog events are append-only for runtime callers. This TRUNCATE is
    // restricted to teardown of the disposable integration database.
    await migrator.query(
      "TRUNCATE TABLE public.branch_catalog_product_events, public.branch_catalog_product_exclusions",
    )
    // F2.2 variant and branch-exception fixtures are append-only and scoped; clear the ephemeral database.
    await migrator.query("TRUNCATE TABLE public.branch_product_option_events, public.branch_product_option_overrides, public.product_option_change_events, public.product_options, public.product_option_groups")
    // F2.2 recipe fixtures belong to the organization; clear their full
    // dependency graph in the disposable database before deleting the owner.
    await migrator.query(
      "TRUNCATE TABLE public.recipe_change_events, public.recipe_ingredients, " +
      "public.product_recipes, public.ingredients",
    )

    if (branchId || secondBranchId) {
      // Isolated-test teardown only: restore fixture branches so the read-only
      // guard does not block privileged cleanup of the ephemeral test database.
      await migrator.query(
        "UPDATE public.branches SET status = 'active', closed_at = NULL, " +
        "closed_by_user_id = NULL WHERE id = ANY($1::uuid[])",
        [[branchId, secondBranchId].filter(Boolean)],
      )
    }
    if (legacyReservationId) {
      await migrator.query("DELETE FROM public.reservations WHERE id = $1", [legacyReservationId])
    }
    if (legacyTableId) {
      await migrator.query("DELETE FROM public.tables WHERE id = $1", [legacyTableId])
    }
    if (orderId || deliveryOrderId || variantOrderId) {
      await migrator.query(
        "DELETE FROM public.orders WHERE id = ANY($1::uuid[])",
        [[orderId, deliveryOrderId, variantOrderId].filter(Boolean)],
      )
    }
    if (branchId || secondBranchId) {
      const branchIds = [branchId, secondBranchId].filter(Boolean)
      await migrator.query(
        "DELETE FROM public.reservations WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.tables WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branch_local_configuration_events WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branch_calendar_exceptions WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branch_lifecycle_events WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branch_user_assignments WHERE branch_id = ANY($1::uuid[])",        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branch_legal_entities WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
      )
      await migrator.query(
        "DELETE FROM public.branches WHERE id = ANY($1::uuid[])",
        [branchIds],
      )
    }
    if (legalEntityIds.length) {
      await migrator.query("DELETE FROM public.legal_entities WHERE id = ANY($1::uuid[])", [legalEntityIds])
    }
    if (organizationId) await migrator.query("DELETE FROM public.organizations WHERE id = $1", [organizationId])
    if (organizationAdminId || organizationStaffId) {
      await migrator.query(
        "DELETE FROM public.app_users WHERE id = ANY($1::uuid[])",
        [[organizationAdminId, organizationStaffId].filter(Boolean)],
      )
    }
    if (variantProductId || secondProductId) await runtime.query("DELETE FROM public.products WHERE id = ANY($1::uuid[])", [[variantProductId, secondProductId].filter(Boolean)])
    if (productId) await runtime.query("DELETE FROM public.products WHERE id = $1", [productId])
    if (categoryId) await runtime.query("DELETE FROM public.categories WHERE id = $1", [categoryId])
    await Promise.all([runtime.end(), migrator.end()])
  }
})
