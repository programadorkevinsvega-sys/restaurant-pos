import type { CatalogRepository } from "../domain/catalog-repository"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ListCatalog {
  constructor(private readonly catalog: CatalogRepository) {}

  getCategories(signal?: AbortSignal) {
    return traceOperation("catalog.list_categories", () => this.catalog.getCategories(signal))
  }

  getProducts(categoryId?: string, signal?: AbortSignal) {
    return traceOperation("catalog.list_products", () => this.catalog.getProducts(categoryId, signal))
  }

  execute(categoryId?: string, signal?: AbortSignal) {
    return traceOperation("catalog.load", () =>
      Promise.all([
        this.catalog.getCategories(signal),
        this.catalog.getProducts(categoryId, signal),
      ] as const),
    )
  }
}
