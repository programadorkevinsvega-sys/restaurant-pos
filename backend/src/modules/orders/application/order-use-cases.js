export class OrderUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listOrders(filters) {
    return this.repository.listOrders(filters)
  }

  createOrder(input) {
    return this.repository.createOrder(input)
  }

  updateStatus(id, status) {
    return this.repository.updateStatus(id, status)
  }
}
