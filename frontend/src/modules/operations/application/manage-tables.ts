import type { TablesRepository } from "../domain/tables-repository"

export class ManageTables {
  constructor(private readonly tables: TablesRepository) {}

  getAll(signal?: AbortSignal) {
    return this.tables.getAll(signal)
  }

  create(number: string, capacity: number) {
    if (!number.trim() || !Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Indica un número de mesa y una capacidad válida.")
    }
    return this.tables.create({ number: number.trim(), capacity })
  }

  updateStatus(id: string, status: string) {
    return this.tables.updateStatus(id, status)
  }
}
