import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { OrderRepository } from "../domain/order-repository.js"

export class PostgresOrderRepository extends OrderRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async listOrders({ status, limit }) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT o.id, o.table_number, o.customer_name, o.order_type,
              o.total_amount, o.status, o.created_at,
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
              ), '[]'::jsonb) AS order_items
       FROM public.orders o
       WHERE $1::text IS NULL OR o.status = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [status ?? null, limit],
    )
    return rows.map((row) => ({ ...row, total_amount: Number(row.total_amount) }))
  }

  async createOrder(order) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6) AS order_id`,
      [
        order.table_number,
        order.customer_name ?? null,
        order.order_type,
        JSON.stringify(order.items.map(({ id, quantity }) => ({ id, quantity }))),
        order.delivery_address ?? null,
        order.delivery_phone ?? null,
      ],
    )
    const orderId = rows[0]?.order_id
    if (!orderId) {
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo confirmar la creación del pedido.")
    }
    return { success: true, orderId, message: "Pedido creado exitosamente" }
  }

  async updateStatus(id, status) {
    const { rows } = await queryPostgres(
      this.pool,
      `UPDATE public.orders
       SET status = $2, updated_at = now()
       WHERE id = $1
       RETURNING id, table_number, customer_name, order_type, total_amount, status, created_at`,
      [id, status],
    )
    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Pedido no encontrado.")
    return { ...rows[0], total_amount: Number(rows[0].total_amount) }
  }
}
