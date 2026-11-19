import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { OrderRepository } from "../domain/order-repository.js"

export class PostgresOrderRepository extends OrderRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async listOrders({ status, limit, branchId, userId }) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT o.id, o.table_number, o.customer_name, o.order_type,
              o.total_amount, o.status, o.created_at,
              o.branch_id, o.legal_entity_id,
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
       WHERE o.branch_id = $1
         AND EXISTS (
           SELECT 1
           FROM public.branch_user_assignments assignment
           WHERE assignment.branch_id = o.branch_id
             AND assignment.user_id = $2
         )
         AND ($3::text IS NULL OR o.status = $3)
       ORDER BY o.created_at DESC
       LIMIT $4`,
      [branchId, userId, status ?? null, limit],
    )
    return rows.map((row) => ({ ...row, total_amount: Number(row.total_amount) }))
  }

  async createOrder(order, actor) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid) AS order_id`,
      [
        order.table_number,
        order.customer_name ?? null,
        order.order_type,
        JSON.stringify(order.items.map(({ id, quantity }) => ({ id, quantity }))),
        order.delivery_address ?? null,
        order.delivery_phone ?? null,
        actor.activeBranchId,
        order.legal_entity_id,
        actor.userId,
      ],
    )
    const orderId = rows[0]?.order_id
    if (!orderId) {
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo confirmar la creación del pedido.")
    }
    return { success: true, orderId, message: "Pedido creado exitosamente" }
  }

  async updateStatus(id, status, branchId, userId) {
    const { rows } = await queryPostgres(
      this.pool,
      `UPDATE public.orders AS o
       SET status = $4, updated_at = now()
       WHERE o.id = $1
         AND o.branch_id = $2
         AND EXISTS (
           SELECT 1
           FROM public.branch_user_assignments assignment
           WHERE assignment.branch_id = o.branch_id
             AND assignment.user_id = $3
         )
       RETURNING o.id, o.table_number, o.customer_name, o.order_type,
                 o.total_amount, o.status, o.created_at, o.branch_id, o.legal_entity_id`,
      [id, branchId, userId, status],
    )
    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Pedido no encontrado en la sucursal activa.")
    return { ...rows[0], total_amount: Number(rows[0].total_amount) }
  }
}
