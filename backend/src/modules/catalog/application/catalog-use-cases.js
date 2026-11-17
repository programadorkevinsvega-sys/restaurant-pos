import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class CatalogUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listCategories() {
    return traceOperation("catalog.list_categories", () => this.repository.listCategories())
  }

  listProducts(categoryId) {
    return traceOperation("catalog.list_products", () => this.repository.listProducts(categoryId))
  }

  findProduct(id) {
    return traceOperation("catalog.find_product", () => this.repository.findProduct(id))
  }

  createCategory(input) {
    return traceOperation("catalog.create_category", () => this.repository.createCategory(input))
  }

  createProduct(input) {
    return traceOperation("catalog.create_product", () => this.repository.createProduct(input))
  }
}
