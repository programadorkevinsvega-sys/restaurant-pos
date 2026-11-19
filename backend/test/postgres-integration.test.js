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
  let organizationAdminId
  let organizationStaffId
  let organizationId
  const legalEntityIds = []
  let branchId
  let secondBranchId

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
      "'public.assign_delivery_driver(uuid, text, text, integer)'::regprocedure, 'EXECUTE') AS can_assign_delivery_legacy",
    )
    assert.equal(privileges.rows[0].can_read_products, true)
    assert.equal(privileges.rows[0].can_insert_products, true)
    assert.equal(privileges.rows[0].can_insert_orders, false)
    assert.equal(privileges.rows[0].can_create_orders_legacy, false)
    assert.equal(privileges.rows[0].can_create_orders, true)
    assert.equal(privileges.rows[0].can_assign_delivery, true)
    assert.equal(privileges.rows[0].can_assign_delivery_legacy, false)

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
      can_assign_user: true,
      can_remove_user: true,
      can_create_legal_entity: true,
      can_create_branch: true,
      can_assign_entity: true,
      can_remove_entity: true,
    })

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

    await assert.rejects(
      migrator.query(
        "UPDATE public.orders SET legal_entity_id = $2 WHERE id = $1",
        [orderId, legalEntityIds[1]],
      ),
      (error) => error.code === "23514",
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
  } finally {
    if (orderId || deliveryOrderId) {
      await migrator.query(
        "DELETE FROM public.orders WHERE id = ANY($1::uuid[])",
        [[orderId, deliveryOrderId].filter(Boolean)],
      )
    }
    if (branchId || secondBranchId) {
      const branchIds = [branchId, secondBranchId].filter(Boolean)
      await migrator.query(
        "DELETE FROM public.branch_user_assignments WHERE branch_id = ANY($1::uuid[])",
        [branchIds],
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
    if (productId) await runtime.query("DELETE FROM public.products WHERE id = $1", [productId])
    if (categoryId) await runtime.query("DELETE FROM public.categories WHERE id = $1", [categoryId])
    await Promise.all([runtime.end(), migrator.end()])
  }
})
