import type { CatalogRepository } from "../domain/catalog-repository"

export class CreateCategory {
  constructor(private readonly catalog: CatalogRepository) {}

  execute(name: string) {
    const normalizedName = name.trim()
    if (!normalizedName) {
      throw new Error("El nombre de la categoría es obligatorio.")
    }
    return this.catalog.createCategory(normalizedName)
  }
}
