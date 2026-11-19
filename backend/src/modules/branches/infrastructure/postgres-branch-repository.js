import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

function mapBranch(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    operational_address: row.operational_address ?? null,
    time_zone: row.time_zone ?? null,
    currency_code: row.currency_code ?? null,
    weekly_hours: row.weekly_hours ?? [],
    status: row.status,
    status_changed_at: row.status_changed_at,
    closed_at: row.closed_at,
    legal_entities: row.legal_entities ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

const branchSelect = `
  SELECT
    b.id,
    b.code,
    b.name,
    b.operational_address,
    b.time_zone,
    b.currency_code,
    b.weekly_hours,
    b.status,
    b.status_changed_at,
    b.closed_at,
    b.created_at,
    b.updated_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', le.id,
          'legal_name', le.legal_name,
          'commercial_name', le.commercial_name,
          'tax_country_code', le.tax_country_code,
          'tax_identifier_type', le.tax_identifier_type,
          'tax_identifier', le.tax_identifier
        )
        ORDER BY le.legal_name, le.id
      ) FILTER (WHERE le.id IS NOT NULL),
      '[]'::jsonb
    ) AS legal_entities
  FROM public.branches AS b
  LEFT JOIN public.branch_legal_entities AS ble
    ON ble.organization_id = b.organization_id
    AND ble.branch_id = b.id
  LEFT JOIN public.legal_entities AS le
    ON le.organization_id = ble.organization_id
    AND le.id = ble.legal_entity_id
`

export class PostgresBranchRepository {
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

  async listBranches() {
    const result = await queryPostgres(this.pool, `
      ${branchSelect}
      GROUP BY b.id
      ORDER BY b.code, b.id
    `)
    return result.rows.map(mapBranch)
  }

  async listAvailableBranches(userId) {
    const result = await queryPostgres(this.pool, `
      SELECT
        b.id,
        b.code,
        b.name,
        b.status,
        b.status_changed_at,
        b.closed_at,
        b.created_at,
        b.updated_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'id', le.id,
              'legal_name', le.legal_name,
              'commercial_name', le.commercial_name
            )
            ORDER BY le.legal_name, le.id
          ) FILTER (WHERE le.id IS NOT NULL),
          '[]'::jsonb
        ) AS legal_entities
      FROM public.branch_user_assignments AS assignment
      JOIN public.branches AS b
        ON b.organization_id = assignment.organization_id
        AND b.id = assignment.branch_id
      JOIN public.organizations AS organization
        ON organization.id = b.organization_id
        AND organization.installation_slot = 1
      JOIN public.app_users AS assigned_user
        ON assigned_user.id = assignment.user_id
        AND assigned_user.is_active = true
      LEFT JOIN public.branch_legal_entities AS ble
        ON ble.organization_id = b.organization_id
        AND ble.branch_id = b.id
      LEFT JOIN public.legal_entities AS le
        ON le.organization_id = ble.organization_id
        AND le.id = ble.legal_entity_id
      WHERE assignment.user_id = $1
      GROUP BY b.id
      ORDER BY b.code, b.id
    `, [userId])
    return result.rows.map(mapBranch)
  }

  async findBranchById(id) {
    const result = await queryPostgres(this.pool, `
      ${branchSelect}
      WHERE b.id = $1
      GROUP BY b.id
    `, [id])
    return mapBranch(result.rows[0])
  }

  async listBranchUsers(branchId) {
    const result = await queryPostgres(this.pool, `
      SELECT
        u.id,
        u.email,
        u.role,
        EXISTS (
          SELECT 1
          FROM public.branch_user_assignments AS assignment
          WHERE assignment.branch_id = $1
            AND assignment.user_id = u.id
        ) AS assigned
      FROM public.app_users AS u
      WHERE u.is_active = true
        AND EXISTS (
          SELECT 1
          FROM public.branches AS b
          JOIN public.organizations AS o
            ON o.id = b.organization_id
            AND o.installation_slot = 1
          WHERE b.id = $1
        )
      ORDER BY lower(u.email), u.id
    `, [branchId])
    return result.rows
  }

  async assignUserToBranch(branchId, userId, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.assign_user_to_branch($1, $2, $3) AS outcome
    `, [branchId, userId, actorUserId])
    return result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
  }

  async removeUserFromBranch(branchId, userId, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.remove_user_from_branch($1, $2, $3) AS outcome
    `, [branchId, userId, actorUserId])
    return result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
  }

  async createBranch(input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.create_branch($1, $2, $3::uuid[], $4)
    `, [input.code, input.name, input.legal_entity_ids, actorUserId])
    const outcome = result.rows[0]
    if (!outcome || outcome.outcome !== "CREATED") return outcome ?? null
    return this.findBranchById(outcome.created_branch_id)
  }

  async updateBranch(id, input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.update_branch_identity($1, $2, $3, $4)
    `, [id, input.code, input.name, actorUserId])
    return result.rowCount ? this.findBranchById(id) : null
  }

  async assignLegalEntity(branchId, legalEntityId, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT * FROM public.assign_branch_legal_entity($1, $2, $3)
    `, [branchId, legalEntityId, actorUserId])
    return result.rowCount ? this.findBranchById(branchId) : null
  }

  async removeLegalEntity(branchId, legalEntityId, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.remove_branch_legal_entity($1, $2, $3) AS outcome
    `, [branchId, legalEntityId, actorUserId])
    return result.rows[0]?.outcome ?? "ASSIGNMENT_NOT_FOUND"
  }

  async changeBranchStatus(branchId, status, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.change_branch_status($1, $2, $3) AS outcome
    `, [branchId, status, actorUserId])
    const outcome = result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
    if (outcome !== "CHANGED" && outcome !== "UNCHANGED") return outcome
    return { outcome, branch: await this.findBranchById(branchId) }
  }


  async updateBranchLocalConfiguration(branchId, input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.update_branch_local_configuration(
        $1, $2::jsonb, $3, $4, $5::jsonb, $6
      ) AS outcome
    `, [
      branchId,
      input.operational_address ? JSON.stringify(input.operational_address) : null,
      input.time_zone,
      input.currency_code,
      JSON.stringify(input.weekly_hours),
      actorUserId,
    ])
    const outcome = result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
    if (outcome !== "UPDATED") return outcome
    return { outcome, branch: await this.findBranchById(branchId) }
  }

  async listCalendarExceptions(branchId, from, to) {
    const result = await queryPostgres(this.pool, `
      SELECT id, to_char(local_date, 'YYYY-MM-DD') AS local_date,
             kind, periods, reason, created_at, updated_at
      FROM public.branch_calendar_exceptions
      WHERE branch_id = $1 AND local_date BETWEEN $2::date AND $3::date
      ORDER BY local_date
      LIMIT 367
    `, [branchId, from, to])
    return result.rows
  }

  async upsertCalendarException(branchId, localDate, input, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.upsert_branch_calendar_exception(
        $1, $2::date, $3, $4::jsonb, $5, $6
      ) AS outcome
    `, [branchId, localDate, input.kind, JSON.stringify(input.periods), input.reason, actorUserId])
    return result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
  }

  async deleteCalendarException(branchId, localDate, actorUserId) {
    const result = await queryPostgres(this.pool, `
      SELECT public.delete_branch_calendar_exception($1, $2::date, $3) AS outcome
    `, [branchId, localDate, actorUserId])
    return result.rows[0]?.outcome ?? "BRANCH_NOT_FOUND"
  }

  async listLifecycleEvents(branchId) {
    const result = await queryPostgres(this.pool, `
      SELECT event.id, event.previous_status, event.new_status,
             event.actor_user_id, actor.email AS actor_email, event.occurred_at
      FROM public.branch_lifecycle_events AS event
      JOIN public.branches AS branch
        ON branch.organization_id = event.organization_id
        AND branch.id = event.branch_id
      JOIN public.app_users AS actor ON actor.id = event.actor_user_id
      WHERE branch.id = $1
      ORDER BY event.sequence DESC
      LIMIT 100
    `, [branchId])
    return result.rows
  }
}
