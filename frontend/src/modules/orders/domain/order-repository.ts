import type { NewOrder, OrderReceipt } from "./models"

export interface OrderRepository {
  create(order: NewOrder): Promise<OrderReceipt>
}
