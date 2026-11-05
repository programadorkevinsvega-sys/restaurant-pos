import type { RestaurantSettings } from "./models"

export interface SettingsRepository {
  get(signal?: AbortSignal): Promise<RestaurantSettings>
  update(settings: RestaurantSettings): Promise<void>
}
