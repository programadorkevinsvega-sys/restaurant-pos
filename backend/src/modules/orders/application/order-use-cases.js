import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class OrderUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listOrders(filters) {
    return traceOperation("orders.list", () => this.repository.listOrders(filters))
  }

  createOrder(input) {
    return traceOperation("orders.create", () => this.repository.createOrder(input))
  }

  updateStatus(id, status) {
    return traceOperation("orders.update_status", () => this.repository.updateStatus(id, status))
  }
}
