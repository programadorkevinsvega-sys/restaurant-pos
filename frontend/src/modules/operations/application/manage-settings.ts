import type { SettingsRepository } from "../domain/settings-repository"
import type { RestaurantSettings } from "../domain/models"

export class ManageSettings {
  constructor(private readonly settings: SettingsRepository) {}

  get(signal?: AbortSignal) {
    return this.settings.get(signal)
  }

  update(settings: RestaurantSettings) {
    if (Object.keys(settings).some((key) => !key.trim())) {
      throw new Error("Las claves de configuración no pueden estar vacías.")
    }
    return this.settings.update(settings)
  }
}
