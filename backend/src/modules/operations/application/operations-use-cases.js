import { AppError } from "../../../shared/domain/app-error.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class OperationsUseCases {
  constructor(repository) {
    this.repository = repository
  }

  requireActiveBranch(actor) {
    if (!actor?.userId || !actor.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de operar con mesas, reservas o pedidos.")
    }
  }

  listTables(actor) {
    this.requireActiveBranch(actor)
    return traceOperation("tables.list", () => this.repository.listTables(
      actor.activeBranchId,
      actor.userId,
    ))
  }

  createTable(input, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("tables.create", () => this.repository.createTable(
      input,
      actor.activeBranchId,
      actor.userId,
    ))
  }

  updateTable(id, input, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("tables.update", () => this.repository.updateTable(
      id,
      input,
      actor.activeBranchId,
      actor.userId,
    ))
  }

  listReservations(filters, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("reservations.list", () => this.repository.listReservations(
      filters,
      actor.activeBranchId,
      actor.userId,
    ))
  }

  createReservation(input, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("reservations.create", () => this.repository.createReservation(
      input,
      actor.activeBranchId,
      actor.userId,
    ))
  }

  updateReservation(id, status, actor) {
    this.requireActiveBranch(actor)
    return traceOperation("reservations.update_status", () => this.repository.updateReservation(
      id,
      status,
      actor.activeBranchId,
      actor.userId,
    ))
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
