import type { CatalogRepository } from "../domain/catalog-repository"
import type { CategoryInput, NewProduct, ProductInput } from "../domain/models"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ManageCorporateCatalog {
  constructor(private readonly repository: CatalogRepository) {}

  listProducts() {
    return traceOperation("catalog.list_corporate_products", () => this.repository.getCorporateProducts())
  }

  listCategories() {
    return traceOperation("catalog.list_corporate_categories", () => this.repository.getCorporateCategories())
  }

  listBranchProducts(branchId: string) {
    return traceOperation("catalog.list_branch_products", () => this.repository.getBranchProducts(branchId))
  }

  setBranchProductEnabled(branchId: string, productId: string, enabled: boolean) {
    return traceOperation("catalog.set_branch_product_enabled", () =>
      this.repository.setBranchProductEnabled(branchId, productId, enabled))
  }

  createProduct(input: NewProduct) {
    return traceOperation("catalog.create_product", () => this.repository.createProduct(input))
  }

  updateProduct(id: string, input: ProductInput) {
    return traceOperation("catalog.update_product", () => this.repository.updateProduct(id, input))
  }

  deactivateProduct(id: string) {
    return traceOperation("catalog.deactivate_product", () => this.repository.deactivateProduct(id))
  }

  createCategory(input: CategoryInput) {
    return traceOperation("catalog.create_category", () => this.repository.createCategory(input))
  }

  updateCategory(id: string, input: CategoryInput) {
    return traceOperation("catalog.update_category", () => this.repository.updateCategory(id, input))
  }

  deactivateCategory(id: string) {
    return traceOperation("catalog.deactivate_category", () => this.repository.deactivateCategory(id))
  }
}
