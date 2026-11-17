import type { CatalogRepository } from "../domain/catalog-repository"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class CreateCategory {
  constructor(private readonly catalog: CatalogRepository) {}

  execute(name: string) {
    const normalizedName = name.trim()
    if (!normalizedName) {
      throw new Error("El nombre de la categoría es obligatorio.")
    }
    return traceOperation("catalog.create_category", () => this.catalog.createCategory(normalizedName))
  }
}
