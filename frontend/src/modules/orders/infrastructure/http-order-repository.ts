import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { NewOrder, OrderReceipt } from "../domain/models"
import type { OrderRepository } from "../domain/order-repository"

export class HttpOrderRepository implements OrderRepository {
  constructor(private readonly http: HttpClient) {}

  create(order: NewOrder) {
    return this.http.post<OrderReceipt>("/orders", order)
  }
}
