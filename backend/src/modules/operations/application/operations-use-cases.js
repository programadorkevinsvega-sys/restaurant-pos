import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class OperationsUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listTables() { return traceOperation("tables.list", () => this.repository.listTables()) }
  createTable(input) { return traceOperation("tables.create", () => this.repository.createTable(input)) }
  updateTable(id, input) { return traceOperation("tables.update", () => this.repository.updateTable(id, input)) }
  listReservations(filters) {
    return traceOperation("reservations.list", () => this.repository.listReservations(filters))
  }
  createReservation(input) {
    return traceOperation("reservations.create", () => this.repository.createReservation(input))
  }
  updateReservation(id, status) {
    return traceOperation("reservations.update_status", () => this.repository.updateReservation(id, status))
  }
  listDeliveries(status) { return traceOperation("deliveries.list", () => this.repository.listDeliveries(status)) }
  assignDriver(input) { return traceOperation("deliveries.assign_driver", () => this.repository.assignDriver(input)) }
  getSettings() { return traceOperation("settings.read", () => this.repository.getSettings()) }
  updateSettings(input) { return traceOperation("settings.update", () => this.repository.updateSettings(input)) }
}
