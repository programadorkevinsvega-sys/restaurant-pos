import type { DeliveriesRepository } from "../domain/deliveries-repository"

export class ManageDeliveries {
  constructor(private readonly deliveries: DeliveriesRepository) {}

  getAll(signal?: AbortSignal) {
    return this.deliveries.getAll(signal)
  }

  assignDriver(orderId: string, name: string, phone: string, estimatedTime: string) {
    if (!orderId || !name.trim()) {
      throw new Error("Selecciona el pedido e indica el nombre del repartidor.")
    }
    return this.deliveries.assignDriver(orderId, name.trim(), phone.trim(), estimatedTime.trim())
  }
}
