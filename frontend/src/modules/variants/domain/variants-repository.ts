import type {
  BranchProductOptions,
  PosProductOptionGroup,
  ProductOptionConfiguration,
  ProductOptionGroupInput,
  ProductOptionInput,
} from "./models"

export interface VariantsRepository {
  getProductOptions(productId: string): Promise<ProductOptionConfiguration>
  getPosProductOptions(productId: string): Promise<{ product_id: string; groups: PosProductOptionGroup[] }>
  createGroup(productId: string, input: ProductOptionGroupInput): Promise<void>
  updateGroup(groupId: string, input: ProductOptionGroupInput): Promise<void>
  createOption(groupId: string, input: ProductOptionInput): Promise<void>
  updateOption(optionId: string, input: ProductOptionInput): Promise<void>
  getBranchOptions(branchId: string): Promise<BranchProductOptions>
  setBranchOptionAvailability(branchId: string, optionId: string, enabled: boolean, reason: string): Promise<void>
  clearBranchOptionOverride(branchId: string, optionId: string, reason: string): Promise<void>
}
