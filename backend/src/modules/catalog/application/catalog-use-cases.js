import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class CatalogUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listCategories(actor) {
    return traceOperation("catalog.list_categories", () => this.repository.listCategories(actor))
  }

  listProducts(categoryId, actor) {
    return traceOperation("catalog.list_products", () => this.repository.listProducts(categoryId, actor))
  }

  findProduct(id, actor) {
    return traceOperation("catalog.find_product", () => this.repository.findProduct(id, actor))
  }

  listCorporateProducts(actor) {
    return traceOperation("catalog.list_corporate_products", () => this.repository.listCorporateProducts(actor))
  }

  listBranchProducts(branchId, actor) {
    return traceOperation("catalog.list_branch_products", () => this.repository.listBranchProducts(branchId, actor))
  }

  setBranchProductEnabled(branchId, productId, enabled, actor) {
    return traceOperation("catalog.set_branch_product_enabled", () =>
      this.repository.setBranchProductEnabled(branchId, productId, enabled, actor),
    )
  }

  createCategory(input, actor) {
    return traceOperation("catalog.create_category", () => this.repository.createCategory(input, actor))
  }

  createProduct(input, actor) {
    return traceOperation("catalog.create_product", () => this.repository.createProduct(input, actor))
  }
}
