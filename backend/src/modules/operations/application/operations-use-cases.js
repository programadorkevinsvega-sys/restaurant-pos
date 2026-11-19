import { AppError } from "../../../shared/domain/app-error.js"
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
  requireActiveBranch(actor) {
    if (!actor?.userId || !actor.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de operar con pedidos.")
    }
  }
  listDeliveries(status, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("deliveries.list", () => this.repository.listDeliveries(
      status,
      actor.activeBranchId,
      actor.userId,
    ))
  }
  assignDriver(input, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("deliveries.assign_driver", () => this.repository.assignDriver(
      input,
      actor.activeBranchId,
      actor.userId,
    ))
  }
  getSettings() { return traceOperation("settings.read", () => this.repository.getSettings()) }
  updateSettings(input) { return traceOperation("settings.update", () => this.repository.updateSettings(input)) }
}
