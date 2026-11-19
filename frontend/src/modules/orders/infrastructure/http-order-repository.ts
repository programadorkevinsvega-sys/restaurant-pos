import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { NewOrder, OrderListFilters, OrderReceipt, OrderSummary } from "../domain/models"
import type { OrderRepository } from "../domain/order-repository"

export class HttpOrderRepository implements OrderRepository {
  constructor(private readonly http: HttpClient) {}

  getAll(filters: OrderListFilters = {}, signal?: AbortSignal) {
    const query = new URLSearchParams()
    if (filters.status) query.set("status", filters.status)
    if (filters.limit !== undefined) query.set("limit", String(filters.limit))
    const suffix = query.toString()
    return this.http.get<OrderSummary[]>(`/orders${suffix ? `?${suffix}` : ""}`, signal)
  }

  create(order: NewOrder) {
    return this.http.post<OrderReceipt>("/orders", order)
  }
}
