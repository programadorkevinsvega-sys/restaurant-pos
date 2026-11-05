import type { DeliveryOrder } from "./models"

export interface DeliveriesRepository {
  getAll(signal?: AbortSignal): Promise<DeliveryOrder[]>
  assignDriver(orderId: string, name: string, phone: string, estimatedTime: string): Promise<void>
}
