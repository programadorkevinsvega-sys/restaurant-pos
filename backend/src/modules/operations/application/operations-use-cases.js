export class OperationsUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listTables() { return this.repository.listTables() }
  createTable(input) { return this.repository.createTable(input) }
  updateTable(id, input) { return this.repository.updateTable(id, input) }
  listReservations(filters) { return this.repository.listReservations(filters) }
  createReservation(input) { return this.repository.createReservation(input) }
  updateReservation(id, status) { return this.repository.updateReservation(id, status) }
  listDeliveries(status) { return this.repository.listDeliveries(status) }
  assignDriver(input) { return this.repository.assignDriver(input) }
  getSettings() { return this.repository.getSettings() }
  updateSettings(input) { return this.repository.updateSettings(input) }
}
