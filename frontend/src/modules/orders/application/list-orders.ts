import type { OrderListFilters, OrderSummary } from "../domain/models"
import type { OrderRepository } from "../domain/order-repository"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ListOrders {
  constructor(private readonly orders: OrderRepository) {}

  execute(filters: OrderListFilters = {}, signal?: AbortSignal): Promise<OrderSummary[]> {
    return traceOperation("orders.list", () => this.orders.getAll(filters, signal))
  }
}
