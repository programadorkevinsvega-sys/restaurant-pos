import type { TablesRepository } from "../domain/tables-repository"
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

  updateStatus(id: string, status: string) {
    return traceOperation("tables.update_status", () => this.tables.updateStatus(id, status))
  }
}
