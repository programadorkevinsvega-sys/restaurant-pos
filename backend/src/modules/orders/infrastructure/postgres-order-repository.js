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
                  'variant_selection_snapshot', oi.variant_selection_snapshot,
                  'products', jsonb_build_object(
                    'id', p.id, 'name', coalesce(oi.product_name_at_order, 'Producto histórico'),
                    'image_url', oi.product_image_url_at_order
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
           WHERE assignment.organization_id = o.organization_id
             AND assignment.branch_id = o.branch_id
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
    const client = await this.pool.connect()
    let transactionStarted = false
    try {
      await client.query("BEGIN")
      transactionStarted = true
      const { rows } = await queryPostgres(
        client,
        `SELECT public.create_pos_order($1, $2, $3, $4::jsonb, $5, $6, $7::uuid, $8::uuid, $9::uuid) AS order_id`,
        [
          order.table_number,
          order.customer_name ?? null,
          order.order_type,
          JSON.stringify(order.items.map(({ id, quantity, option_ids }) => ({ id, quantity, option_ids: option_ids ?? [] }))),
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

      const receiptResult = await queryPostgres(
        client,
        `SELECT o.currency_code,
                o.subtotal_before_discount::text AS subtotal_before_discount,
                o.discount_total::text AS discount_total,
                o.tax_total::text AS tax_total,
                o.delivery_fee_snapshot::text AS delivery_fee_snapshot,
                o.total_amount::text AS total_amount,
                COALESCE(
                  jsonb_agg(jsonb_build_object(
                    'product_name', COALESCE(oi.product_name_at_order, 'Producto histórico'),
                    'quantity', oi.quantity,
                    'list_unit_price', oi.list_unit_price_snapshot::text,
                    'unit_discount', oi.unit_discount_snapshot::text,
                    'line_total', oi.price_at_order::text,
                    'tax_mode', oi.tax_mode_snapshot,
                    'tax_breakdown', oi.tax_breakdown_snapshot,
                    'promotion', oi.promotion_snapshot
                  ) ORDER BY oi.created_at, oi.id) FILTER (WHERE oi.id IS NOT NULL),
                  '[]'::jsonb
                ) AS items
         FROM public.orders o
         LEFT JOIN public.order_items oi ON oi.order_id = o.id
         WHERE o.id = $1
           AND o.branch_id = $2
           AND EXISTS (
             SELECT 1 FROM public.branch_user_assignments assignment
             WHERE assignment.organization_id = o.organization_id
               AND assignment.branch_id = o.branch_id
               AND assignment.user_id = $3
           )
         GROUP BY o.id`,
        [orderId, actor.activeBranchId, actor.userId],
      )
      const receipt = receiptResult.rows[0]
      if (!receipt) {
        throw new AppError(500, "ORDER_RECEIPT_UNAVAILABLE", "El pedido se creó, pero no fue posible recuperar su desglose. La operación se revertirá.")
      }

      await client.query("COMMIT")
      transactionStarted = false
      return {
        success: true,
        orderId,
        message: "Pedido creado exitosamente",
        currency_code: receipt.currency_code,
        subtotal_before_discount: receipt.subtotal_before_discount,
        discount_total: receipt.discount_total,
        tax_total: receipt.tax_total,
        delivery_fee_snapshot: receipt.delivery_fee_snapshot,
        total_amount: receipt.total_amount,
        items: receipt.items,
      }
    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK").catch(() => {})
      }
      throw error
    } finally {
      client.release()
    }
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
           WHERE assignment.organization_id = o.organization_id
             AND assignment.branch_id = o.branch_id
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
