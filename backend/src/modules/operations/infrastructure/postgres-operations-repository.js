import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { OperationsRepository } from "../domain/operations-repository.js"

async function queryBranchFunction(pool, sql, values) {
  try {
    return await queryPostgres(pool, sql, values)
  } catch (error) {
    if (error?.code === "42501") {
      throw new AppError(403, "BRANCH_ACCESS_DENIED", "No tienes una asignación activa para la sucursal seleccionada.")
    }
    throw error
  }
}

function requireOutcome(outcome, resource) {
  const outcomes = {
    BRANCH_NOT_ACTIVE: [409, "BRANCH_NOT_ACTIVE", "La sucursal no está activa y no admite cambios operativos."],
    TABLE_NUMBER_EXISTS: [409, "TABLE_NUMBER_EXISTS", "Ya existe una mesa con ese número en la sucursal."],
    TABLE_NOT_FOUND: [404, "TABLE_NOT_FOUND", "La mesa no existe en la sucursal activa."],
    TABLE_NOT_IN_BRANCH: [404, "TABLE_NOT_FOUND", "La mesa no existe en la sucursal activa."],
    ORDER_NOT_IN_BRANCH: [409, "ORDER_NOT_IN_BRANCH", "El pedido indicado no pertenece a la sucursal activa."],
    INVALID_TABLE: [400, "INVALID_TABLE", "Los datos de la mesa no son válidos."],
    INVALID_TABLE_STATUS: [400, "INVALID_TABLE_STATUS", "El estado de la mesa no es válido."],
    INVALID_RESERVATION: [400, "INVALID_RESERVATION", "Los datos de la reserva no son válidos."],
    INVALID_RESERVATION_STATUS: [400, "INVALID_RESERVATION_STATUS", "El estado de la reserva no es válido."],
    RESERVATION_NOT_FOUND: [404, "RESERVATION_NOT_FOUND", "La reserva no existe en la sucursal activa."],
  }
  const failure = outcomes[outcome]
  if (failure) {
    const [status, code, message] = failure
    throw new AppError(status, code, message)
  }
  if (outcome !== "CREATED" && outcome !== "UPDATED") {
    throw new AppError(409, `${resource.toUpperCase()}_OPERATION_CONFLICT`, "No se pudo completar la operación en la sucursal activa.")
  }
}

export class PostgresOperationsRepository extends OperationsRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async listTables(branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.list_branch_tables($1::uuid, $2::uuid)",
      [branchId, userId],
    )
    return rows
  }

  async getBranchTable(id, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.get_branch_table($1::uuid, $2::uuid, $3::uuid)",
      [id, branchId, userId],
    )
    if (!rows[0]) throw new AppError(404, "TABLE_NOT_FOUND", "La mesa no existe en la sucursal activa.")
    return rows[0]
  }

  async createTable(input, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.create_branch_table($1::uuid, $2, $3, $4::uuid)",
      [branchId, input.number, input.capacity, userId],
    )
    const result = rows[0]
    requireOutcome(result?.outcome, "table")
    return this.getBranchTable(result.created_table_id, branchId, userId)
  }

  async updateTable(id, input, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT public.update_branch_table($1::uuid, $2::uuid, $3, $4::uuid, $5, $6::uuid) AS outcome",
      [
        id,
        branchId,
        input.status,
        input.current_order_id ?? null,
        Object.hasOwn(input, "current_order_id"),
        userId,
      ],
    )
    requireOutcome(rows[0]?.outcome, "table")
    return this.getBranchTable(id, branchId, userId)
  }

  async listReservations({ date, status }, branchId, userId) {
    const from = date ? `${date}T00:00:00.000Z` : null
    const to = date
      ? new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString()
      : null
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.list_branch_reservations($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5)",
      [branchId, userId, from, to, status ?? null],
    )
    return rows
  }

  async getBranchReservation(id, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.get_branch_reservation($1::uuid, $2::uuid, $3::uuid)",
      [id, branchId, userId],
    )
    if (!rows[0]) {
      throw new AppError(404, "RESERVATION_NOT_FOUND", "La reserva no existe en la sucursal activa.")
    }
    return rows[0]
  }

  async createReservation(input, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT * FROM public.create_branch_reservation($1::uuid, $2, $3, $4, $5::uuid, $6::timestamptz, $7, $8, $9::uuid)",
      [
        branchId,
        input.customer_name,
        input.customer_phone ?? null,
        input.customer_email ?? null,
        input.table_id,
        input.reservation_date,
        input.party_size,
        input.notes ?? null,
        userId,
      ],
    )
    const result = rows[0]
    requireOutcome(result?.outcome, "reservation")
    return this.getBranchReservation(result.created_reservation_id, branchId, userId)
  }

  async updateReservation(id, status, branchId, userId) {
    const { rows } = await queryBranchFunction(
      this.pool,
      "SELECT public.update_branch_reservation_status($1::uuid, $2::uuid, $3, $4::uuid) AS outcome",
      [id, branchId, status, userId],
    )
    requireOutcome(rows[0]?.outcome, "reservation")
    return this.getBranchReservation(id, branchId, userId)
  }

  async listDeliveries(status, branchId, userId) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT o.id, o.customer_name, o.table_number, o.total_amount,
              o.status, o.created_at,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'id', oi.id,
                  'quantity', oi.quantity,
                  'price_at_order', oi.price_at_order,
                  'products', jsonb_build_object(
                    'id', p.id, 'name', p.name, 'image_url', p.image_url
                  )
                ) ORDER BY oi.created_at, oi.id)
                FROM public.order_items oi
                JOIN public.products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
              ), '[]'::jsonb) AS order_items,
              COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                  'address', d.address,
                  'phone', d.phone,
                  'delivery_fee', d.delivery_fee,
                  'estimated_time', d.estimated_time,
                  'driver_name', d.driver_name,
                  'driver_phone', d.driver_phone,
                  'status', d.status
                ) ORDER BY d.created_at, d.id)
                FROM public.delivery_info d
                WHERE d.order_id = o.id
              ), '[]'::jsonb) AS delivery_info
       FROM public.orders o
       WHERE o.order_type = 'A domicilio'
         AND o.branch_id = $2
         AND EXISTS (
           SELECT 1
           FROM public.branch_user_assignments assignment
           WHERE assignment.organization_id = o.organization_id
             AND assignment.branch_id = o.branch_id
             AND assignment.user_id = $3
         )
         AND ($1::text IS NULL OR o.status = $1)
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [status ?? null, branchId, userId],
    )
    return rows.map((row) => ({ ...row, total_amount: Number(row.total_amount) }))
  }

  async assignDriver({ order_id, driver_name, driver_phone, estimated_time }, branchId, userId) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.assign_delivery_driver($1, $2, $3, $4, $5::uuid, $6::uuid) AS delivery`,
      [order_id, driver_name, driver_phone ?? null, estimated_time ?? null, branchId, userId],
    )
    return rows[0].delivery
  }

  async getSettings() {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT key, value
       FROM public.settings
       ORDER BY key
       LIMIT 100`,
    )
    return Object.fromEntries(rows.map(({ key, value }) => [key, value]))
  }

  async updateSettings(settings) {
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.settings (key, value)
       SELECT key, value FROM jsonb_each_text($1::jsonb)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`,
      [JSON.stringify(settings)],
    )
    return { message: "Configuración actualizada exitosamente", data: rows }
  }
}
