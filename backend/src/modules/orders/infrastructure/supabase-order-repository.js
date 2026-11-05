import { AppError } from "../../../shared/domain/app-error.js"
import { unwrapSupabase } from "../../../shared/infrastructure/unwrap-supabase.js"
import { OrderRepository } from "../domain/order-repository.js"

export class SupabaseOrderRepository extends OrderRepository {
  constructor(client) {
    super()
    this.client = client
  }

  async listOrders({ status, limit }) {
    let query = this.client
      .from("orders")
      .select("id,table_number,customer_name,order_type,total_amount,status,created_at,order_items(id,quantity,price_at_order,products(id,name,image_url))")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (status) query = query.eq("status", status)
    return unwrapSupabase(await query)
  }

  async createOrder(order) {
    const data = unwrapSupabase(await this.client.rpc("create_pos_order", {
      p_table_number: order.table_number,
      p_customer_name: order.customer_name ?? null,
      p_order_type: order.order_type,
      p_items: order.items.map(({ id, quantity }) => ({ id, quantity })),
      p_delivery_address: order.delivery_address ?? null,
      p_delivery_phone: order.delivery_phone ?? null,
    }))
    const id = typeof data === "string" ? data : data?.id
    if (!id) throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo confirmar la creación del pedido.")
    return { success: true, orderId: id, message: "Pedido creado exitosamente" }
  }

  async updateStatus(id, status) {
    const result = await this.client
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select("id,table_number,customer_name,order_type,total_amount,status,created_at")
      .maybeSingle()
    const order = unwrapSupabase(result)
    if (!order) throw new AppError(404, "NOT_FOUND", "Pedido no encontrado.")
    return order
  }
}
