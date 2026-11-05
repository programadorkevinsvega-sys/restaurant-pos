import type { CatalogRepository } from "../domain/catalog-repository"

export class ListCatalog {
  constructor(private readonly catalog: CatalogRepository) {}

  getCategories(signal?: AbortSignal) {
    return this.catalog.getCategories(signal)
  }

  getProducts(categoryId?: string, signal?: AbortSignal) {
    return this.catalog.getProducts(categoryId, signal)
  }

  execute(categoryId?: string, signal?: AbortSignal) {
    return Promise.all([
      this.catalog.getCategories(signal),
      this.catalog.getProducts(categoryId, signal),
    ] as const)
  }
}
