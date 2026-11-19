import type { BranchRepository } from "../domain/branch-repository"
import type { Branch, BranchInput, BranchesResult, BranchUpdate } from "../domain/models"

export class ManageBranches {
  constructor(private readonly repository: BranchRepository) {}

  list(signal?: AbortSignal): Promise<BranchesResult> {
    return this.repository.list(signal)
  }

  create(input: BranchInput): Promise<Branch> {
    return this.repository.create(input)
  }

  update(id: string, input: BranchUpdate): Promise<Branch> {
    return this.repository.update(id, input)
  }

  assignLegalEntity(branchId: string, legalEntityId: string): Promise<Branch> {
    return this.repository.assignLegalEntity(branchId, legalEntityId)
  }

  removeLegalEntity(branchId: string, legalEntityId: string): Promise<Branch> {
    return this.repository.removeLegalEntity(branchId, legalEntityId)
  }
}
