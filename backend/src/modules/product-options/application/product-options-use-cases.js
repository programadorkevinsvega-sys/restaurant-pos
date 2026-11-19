import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class ProductOptionsUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listProductOptions(productId, actor) {
    return traceOperation("product_options.list_product", () => this.repository.listProductOptions(productId, actor))
  }

  createGroup(productId, input, actor) {
    return traceOperation("product_options.create_group", () => this.repository.createGroup(productId, input, actor))
  }

  updateGroup(groupId, input, actor) {
    return traceOperation("product_options.update_group", () => this.repository.updateGroup(groupId, input, actor))
  }

  createOption(groupId, input, actor) {
    return traceOperation("product_options.create_option", () => this.repository.createOption(groupId, input, actor))
  }

  updateOption(optionId, input, actor) {
    return traceOperation("product_options.update_option", () => this.repository.updateOption(optionId, input, actor))
  }

  listBranchOptions(branchId, actor) {
    return traceOperation("product_options.list_branch_options", () => this.repository.listBranchOptions(branchId, actor))
  }

  setBranchOptionAvailability(branchId, optionId, input, actor) {
    return traceOperation("product_options.set_branch_option_availability", () =>
      this.repository.setBranchOptionAvailability(branchId, optionId, input, actor))
  }

  clearBranchOptionOverride(branchId, optionId, reason, actor) {
    return traceOperation("product_options.clear_branch_option_override", () =>
      this.repository.clearBranchOptionOverride(branchId, optionId, reason, actor))
  }

  listForActiveBranch(productId, actor) {
    return traceOperation("product_options.list_pos_options", () =>
      this.repository.listForActiveBranch(productId, actor))
  }
}
