import type { CatalogRepository } from "../domain/catalog-repository"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ManageCorporateCatalog {
  constructor(private readonly repository: CatalogRepository) {}

  listBranchProducts(branchId: string) {
    return traceOperation("catalog.list_branch_products", () =>
      this.repository.getBranchProducts(branchId),
    )
  }

  setBranchProductEnabled(branchId: string, productId: string, enabled: boolean) {
    return traceOperation("catalog.set_branch_product_enabled", () =>
      this.repository.setBranchProductEnabled(branchId, productId, enabled),
    )
  }
}
