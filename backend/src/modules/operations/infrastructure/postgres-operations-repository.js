import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { OperationsRepository } from "../domain/operations-repository.js"

export class PostgresOperationsRepository extends OperationsRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async listTables() {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT t.id, t.number, t.capacity, t.status,
              CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', o.id, 'total_amount', o.total_amount,
                'status', o.status, 'created_at', o.created_at
              ) END AS current_order
       FROM public.tables t
       LEFT JOIN public.orders o ON o.id = t.current_order_id
       ORDER BY t.number
       LIMIT 100`,
    )
    return rows
  }

  async createTable(input) {
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.tables (number, capacity)
       VALUES ($1, $2)
       RETURNING id, number, capacity, status`,
      [input.number, input.capacity],
    )
    return rows[0]
  }

  async updateTable(id, input) {
    const { rows } = await queryPostgres(
      this.pool,
      `UPDATE public.tables
       SET status = $2,
           current_order_id = CASE WHEN $3::boolean THEN $4::uuid ELSE current_order_id END,
           updated_at = now()
       WHERE id = $1
       RETURNING id, number, capacity, status, current_order_id`,
      [id, input.status, Object.hasOwn(input, "current_order_id"), input.current_order_id ?? null],
    )
    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Mesa no encontrada.")
    return rows[0]
  }

  async listReservations({ date, status }) {
    const conditions = []
    const values = []
    if (date) {
      const start = `${date}T00:00:00.000Z`
      const end = new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString()
      values.push(start, end)
      conditions.push(`r.reservation_date >= $${values.length - 1} AND r.reservation_date < $${values.length}`)
    }
    if (status) {
      values.push(status)
      conditions.push(`r.status = $${values.length}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT r.id, r.customer_name, r.customer_phone, r.customer_email,
              r.table_id, r.reservation_date, r.party_size, r.notes, r.status,
              CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
                'id', t.id, 'number', t.number, 'capacity', t.capacity
              ) END AS "table"
       FROM public.reservations r
       LEFT JOIN public.tables t ON t.id = r.table_id
       ${where}
       ORDER BY r.reservation_date
       LIMIT 100`,
      values,
    )
    return rows
  }

  async createReservation(input) {
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.reservations
         (customer_name, customer_phone, customer_email, table_id,
          reservation_date, party_size, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, customer_name, customer_phone, customer_email,
                 table_id, reservation_date, party_size, notes, status`,
      [
        input.customer_name,
        input.customer_phone ?? null,
        input.customer_email ?? null,
        input.table_id,
        input.reservation_date,
        input.party_size,
        input.notes ?? null,
      ],
    )
    return rows[0]
  }

  async updateReservation(id, status) {
    const { rows } = await queryPostgres(
      this.pool,
      `UPDATE public.reservations
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, customer_name, customer_phone, customer_email,
                 table_id, reservation_date, party_size, notes, status`,
      [id, status],
    )
    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Reservación no encontrada.")
    return rows[0]
  }

  async listDeliveries(status) {
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
         AND ($1::text IS NULL OR o.status = $1)
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [status ?? null],
    )
    return rows.map((row) => ({ ...row, total_amount: Number(row.total_amount) }))
  }

  async assignDriver({ order_id, driver_name, driver_phone, estimated_time }) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.assign_delivery_driver($1, $2, $3, $4) AS delivery`,
      [order_id, driver_name, driver_phone ?? null, estimated_time ?? null],
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
