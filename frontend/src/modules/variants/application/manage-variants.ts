import type { VariantsRepository } from "../domain/variants-repository"
import type { ProductOptionGroupInput, ProductOptionInput } from "../domain/models"

export class ManageVariants {
  constructor(private readonly repository: VariantsRepository) {}

  getProductOptions(productId: string) {
    return this.repository.getProductOptions(productId)
  }

  getForPos(productId: string) {
    return this.repository.getPosProductOptions(productId)
  }

  createGroup(productId: string, input: ProductOptionGroupInput) {
    return this.repository.createGroup(productId, input)
  }

  updateGroup(groupId: string, input: ProductOptionGroupInput) {
    return this.repository.updateGroup(groupId, input)
  }

  createOption(groupId: string, input: ProductOptionInput) {
    return this.repository.createOption(groupId, input)
  }

  updateOption(optionId: string, input: ProductOptionInput) {
    return this.repository.updateOption(optionId, input)
  }

  getBranchOptions(branchId: string) {
    return this.repository.getBranchOptions(branchId)
  }

  setBranchOptionAvailability(branchId: string, optionId: string, enabled: boolean, reason: string) {
    return this.repository.setBranchOptionAvailability(branchId, optionId, enabled, reason)
  }

  clearBranchOptionOverride(branchId: string, optionId: string, reason: string) {
    return this.repository.clearBranchOptionOverride(branchId, optionId, reason)
  }
}
