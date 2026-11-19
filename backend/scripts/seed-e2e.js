import { Pool } from "pg"
import { hashPassword } from "../src/modules/auth/application/passwords.js"

const databaseUrl = process.env.E2E_DATABASE_URL
const password = process.env.E2E_PASSWORD

if (!databaseUrl || !password || password.length < 12) {
  throw new Error("E2E_DATABASE_URL y E2E_PASSWORD (mínimo 12 caracteres) son obligatorias.")
}

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  legalEntity: "33333333-3333-4333-8333-333333333333",
  branch: "44444444-4444-4444-8444-444444444444",
  category: "55555555-5555-4555-8555-555555555555",
  product: "66666666-6666-4666-8666-666666666666",
  table: "77777777-7777-4777-8777-777777777777",
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 })
const client = await pool.connect()

try {
  await client.query("BEGIN")
  const passwordHash = await hashPassword(password)
  await client.query(
    `INSERT INTO public.app_users (id, email, password_hash, role, is_active)
     VALUES ($1, 'e2e.owner@chili.test', $2, 'admin', true)`,
    [ids.user, passwordHash],
  )

  await client.query(
    `INSERT INTO public.organizations (
       id, installation_slot, name, commercial_name, contact_email,
       contact_phone, website_url, headquarters_address, owner_user_id, updated_by_user_id
     ) VALUES (
       $1, 1, 'Chili E2E Group', 'Chili E2E', 'owner@chili.test',
       '+573001112233', 'https://chili.test',
       '{"line_1":"Carrera 10 #20-30","locality":"Bogotá","country_code":"CO"}'::jsonb,
       $2, $2
     )`,
    [ids.organization, ids.user],
  )

  await client.query(
    `INSERT INTO public.legal_entities (
       id, organization_id, legal_name, commercial_name, tax_country_code,
       tax_identifier_type, tax_identifier, registered_address, contact_email,
       contact_phone, created_by_user_id, updated_by_user_id
     ) VALUES (
       $1, $2, 'Chili E2E S.A.S.', 'Chili E2E', 'CO', 'NIT', '900123456-7',
       '{"line_1":"Calle 20 #10-10","locality":"Bogotá","country_code":"CO"}'::jsonb,
       'fiscal@chili.test', '+573001112233', $3, $3
     )`,
    [ids.legalEntity, ids.organization, ids.user],
  )

  await client.query(
    `INSERT INTO public.branches (
       id, organization_id, code, name, created_by_user_id, updated_by_user_id
     ) VALUES ($1, $2, 'E2E-BOG', 'Chili E2E Centro', $3, $3)`,
    [ids.branch, ids.organization, ids.user],
  )

  await client.query(
    `INSERT INTO public.branch_legal_entities (
       organization_id, branch_id, legal_entity_id, created_by_user_id
     ) VALUES ($1, $2, $3, $4)`,
    [ids.organization, ids.branch, ids.legalEntity, ids.user],
  )

  await client.query(
    `INSERT INTO public.branch_user_assignments (
       organization_id, branch_id, user_id, assigned_by_user_id
     ) VALUES ($1, $2, $3, $3)`,
    [ids.organization, ids.branch, ids.user],
  )

  await client.query(
    `INSERT INTO public.categories (id, name, icon, item_count)
     VALUES ($1, 'E2E Bebidas', 'coffee', 1)`,
    [ids.category],
  )

  await client.query(
    `INSERT INTO public.products (
       id, name, description, price, image_url, discount_percentage, type, category_id
     ) VALUES ($1, 'Producto E2E', 'Producto de prueba automatizada', 12000, NULL, 0, 'Veg', $2)`,
    [ids.product, ids.category],
  )

  await client.query(
    `INSERT INTO public.tables (
       id, number, capacity, status, organization_id, branch_id,
       created_by_user_id, updated_by_user_id
     ) VALUES ($1, 'E2E-01', 4, 'available', $2, $3, $4, $4)`,
    [ids.table, ids.organization, ids.branch, ids.user],
  )
  await client.query("COMMIT")

  process.stdout.write(JSON.stringify({
    user: "e2e.owner@chili.test",
    branchId: ids.branch,
    legalEntityId: ids.legalEntity,
    categoryId: ids.category,
    productId: ids.product,
    tableId: ids.table,
  }) + "\n")
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  client.release()
  await pool.end()
}
