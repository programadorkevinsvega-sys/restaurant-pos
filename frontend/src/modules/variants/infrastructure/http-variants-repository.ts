import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { VariantsRepository } from "../domain/variants-repository"
import type {
  BranchProductOptions,
  PosProductOptionGroup,
  ProductOptionConfiguration,
  ProductOptionGroupInput,
  ProductOptionInput,
} from "../domain/models"

export class HttpVariantsRepository implements VariantsRepository {
  constructor(private readonly http: HttpClient) {}

  getProductOptions(productId: string) {
    return this.http.get<ProductOptionConfiguration>(
      `/admin/product-options/products/${encodeURIComponent(productId)}`,
    )
  }

  getPosProductOptions(productId: string) {
    return this.http.get<{ product_id: string; groups: PosProductOptionGroup[] }>(
      `/products/${encodeURIComponent(productId)}/options`,
    )
  }

  async createGroup(productId: string, input: ProductOptionGroupInput) {
    await this.http.post(`/admin/product-options/products/${encodeURIComponent(productId)}/groups`, input)
  }

  async updateGroup(groupId: string, input: ProductOptionGroupInput) {
    await this.http.patch(`/admin/product-options/groups/${encodeURIComponent(groupId)}`, input)
  }

  async createOption(groupId: string, input: ProductOptionInput) {
    await this.http.post(`/admin/product-options/groups/${encodeURIComponent(groupId)}/options`, input)
  }

  async updateOption(optionId: string, input: ProductOptionInput) {
    await this.http.patch(`/admin/product-options/options/${encodeURIComponent(optionId)}`, input)
  }

  getBranchOptions(branchId: string) {
    return this.http.get<BranchProductOptions>(
      `/admin/product-options/branches/${encodeURIComponent(branchId)}/options`,
    )
  }

  async setBranchOptionAvailability(branchId: string, optionId: string, enabled: boolean, reason: string) {
    await this.http.put(
      `/admin/product-options/branches/${encodeURIComponent(branchId)}/options/${encodeURIComponent(optionId)}`,
      { enabled, reason },
    )
  }

  async clearBranchOptionOverride(branchId: string, optionId: string, reason: string) {
    await this.http.delete(
      `/admin/product-options/branches/${encodeURIComponent(branchId)}/options/${encodeURIComponent(optionId)}`,
      { reason },
    )
  }
}
