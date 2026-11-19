import type { TablesRepository } from "../domain/tables-repository"
import type { TableStatus } from "../domain/models"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ManageTables {
  constructor(private readonly tables: TablesRepository) {}

  getAll(signal?: AbortSignal) {
    return traceOperation("tables.list", () => this.tables.getAll(signal))
  }

  create(number: string, capacity: number) {
    if (!number.trim() || !Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Indica un número de mesa y una capacidad válida.")
    }
    return traceOperation("tables.create", () => this.tables.create({ number: number.trim(), capacity }))
  }

  updateStatus(id: string, status: TableStatus, currentOrderId?: string | null) {
    if (!["available", "occupied", "reserved", "maintenance"].includes(status)) {
      throw new Error("Selecciona un estado válido para la mesa.")
    }
    return traceOperation("tables.update_status", () => this.tables.updateStatus(id, status, currentOrderId))
  }
}
