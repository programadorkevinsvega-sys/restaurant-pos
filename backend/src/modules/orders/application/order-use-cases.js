import { AppError } from "../../../shared/domain/app-error.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class OrderUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listOrders(filters, actor) {
    if (!actor?.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de consultar pedidos.")
    }
    return traceOperation("orders.list", () => this.repository.listOrders({
      ...filters,
      branchId: actor.activeBranchId,
      userId: actor.userId,
    }))
  }

  createOrder(input, actor) {
    if (!actor?.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de crear pedidos.")
    }
    return traceOperation("orders.create", () => this.repository.createOrder(input, actor))
  }

  updateStatus(id, status, actor) {
    if (!actor?.activeBranchId) {
      throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa antes de actualizar pedidos.")
    }
    return traceOperation("orders.update_status", () => this.repository.updateStatus(
      id,
      status,
      actor.activeBranchId,
      actor.userId,
    ))
  }
}
