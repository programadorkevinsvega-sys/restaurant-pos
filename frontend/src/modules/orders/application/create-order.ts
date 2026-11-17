import type { OrderRepository } from "../domain/order-repository"
import type { NewOrder } from "../domain/models"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class CreateOrder {
  constructor(private readonly orders: OrderRepository) {}

  execute(order: NewOrder) {
    if (order.items.length === 0) {
      throw new Error("Agrega al menos un producto antes de enviar el pedido.")
    }
    if (!order.table_number.trim()) {
      throw new Error("Indica la mesa o el número de pedido.")
    }

    return traceOperation("orders.create", () => this.orders.create(order))
  }
}
