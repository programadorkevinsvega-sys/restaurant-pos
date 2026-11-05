import type { RestaurantTable } from "./models"

export interface TablesRepository {
  getAll(signal?: AbortSignal): Promise<RestaurantTable[]>
  create(table: { number: string; capacity: number }): Promise<RestaurantTable>
  updateStatus(id: string, status: string): Promise<RestaurantTable>
}
