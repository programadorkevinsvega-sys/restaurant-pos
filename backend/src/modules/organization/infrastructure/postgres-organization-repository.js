import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

function mapProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    commercialName: row.commercial_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    websiteUrl: row.website_url,
    headquartersAddress: row.headquarters_address,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function addressParameter(value) {
  return value == null ? null : JSON.stringify(value)
}

export class PostgresOrganizationRepository {
  constructor(pool) {
    this.pool = pool
  }

  async findProfile() {
    const result = await queryPostgres(this.pool, `
      SELECT id, name, commercial_name, contact_email, contact_phone,
        website_url, headquarters_address, owner_user_id, created_at, updated_at
      FROM public.organizations
      WHERE installation_slot = 1
      LIMIT 1
    `)
    return mapProfile(result.rows[0])
  }

  async createProfile(input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.bootstrap_organization_profile(
        $1, $2, $3, $4, $5, $6::jsonb, $7
      )
    `, [
      input.name,
      input.commercial_name ?? null,
      input.contact_email ?? null,
      input.contact_phone ?? null,
      input.website_url ?? null,
      addressParameter(input.headquarters_address),
      actorUserId,
    ])
    return mapProfile(result.rows[0])
  }

  async updateProfile(input, actorUserId) {
    const fields = [
      "name",
      "commercial_name",
      "contact_email",
      "contact_phone",
      "website_url",
      "headquarters_address",
    ]
    const values = [actorUserId]
    for (const field of fields) {
      const provided = Object.hasOwn(input, field)
      values.push(provided, provided ? input[field] : null)
    }
    values[12] = addressParameter(input.headquarters_address)
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.update_organization_profile(
        $1,
        $2, $3,
        $4, $5,
        $6, $7,
        $8, $9,
        $10, $11,
        $12, $13::jsonb
      )
    `, values)
    return mapProfile(result.rows[0])
  }
}
