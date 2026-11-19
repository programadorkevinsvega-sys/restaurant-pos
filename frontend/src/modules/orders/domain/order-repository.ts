import type { NewOrder, OrderListFilters, OrderReceipt, OrderSummary } from "./models"

export interface OrderRepository {
  getAll(filters?: OrderListFilters, signal?: AbortSignal): Promise<OrderSummary[]>
  create(order: NewOrder): Promise<OrderReceipt>
}
