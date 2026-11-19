import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

function mapEntity(row) {
  if (!row) return null
  return {
    id: row.id,
    legal_name: row.legal_name,
    commercial_name: row.commercial_name,
    tax_country_code: row.tax_country_code,
    tax_identifier_type: row.tax_identifier_type,
    tax_identifier: row.tax_identifier,
    registered_address: row.registered_address,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    branch_count: Number(row.branch_count ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const entityColumns = `
  le.id, le.legal_name, le.commercial_name, le.tax_country_code,
  le.tax_identifier_type, le.tax_identifier, le.registered_address,
  le.contact_email, le.contact_phone, le.created_at, le.updated_at
`

export class PostgresLegalEntityRepository {
  constructor(pool) {
    this.pool = pool
  }

  async findOrganizationOwnerId() {
    const result = await queryPostgres(this.pool, `
      SELECT owner_user_id
      FROM public.organizations
      WHERE installation_slot = 1
      LIMIT 1
    `)
    return result.rows[0]?.owner_user_id ?? null
  }

  async listLegalEntities() {
    const result = await queryPostgres(this.pool, `
      SELECT ${entityColumns},
        (
          SELECT count(*)::integer
          FROM public.branch_legal_entities AS ble
          WHERE ble.organization_id = le.organization_id
            AND ble.legal_entity_id = le.id
        ) AS branch_count
      FROM public.legal_entities AS le
      ORDER BY le.legal_name, le.id
    `)
    return result.rows.map(mapEntity)
  }

  async createLegalEntity(input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.create_legal_entity(
        $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9
      )
    `, [
      input.legal_name,
      input.commercial_name ?? null,
      input.tax_country_code,
      input.tax_identifier_type,
      input.tax_identifier,
      input.registered_address == null ? null : JSON.stringify(input.registered_address),
      input.contact_email ?? null,
      input.contact_phone ?? null,
      actorUserId,
    ])
    return mapEntity(result.rows[0])
  }

  async updateLegalEntity(id, input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.update_legal_entity(
        $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10
      )
    `, [
      id,
      input.legal_name,
      input.commercial_name ?? null,
      input.tax_country_code,
      input.tax_identifier_type,
      input.tax_identifier,
      input.registered_address == null ? null : JSON.stringify(input.registered_address),
      input.contact_email ?? null,
      input.contact_phone ?? null,
      actorUserId,
    ])
    return mapEntity(result.rows[0])
  }
}
