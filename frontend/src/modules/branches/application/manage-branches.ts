import type { BranchRepository } from "../domain/branch-repository"
import type { AvailableBranchesResult, Branch, BranchInput, BranchLifecycleResult, BranchStatus, BranchesResult, BranchUpdate, BranchUsersResult } from "../domain/models"

export class ManageBranches {
  constructor(private readonly repository: BranchRepository) {}

  list(signal?: AbortSignal): Promise<BranchesResult> {
    return this.repository.list(signal)
  }

  listAvailable(signal?: AbortSignal): Promise<AvailableBranchesResult> {
    return this.repository.listAvailable(signal)
  }

  listUsers(branchId: string, signal?: AbortSignal): Promise<BranchUsersResult> {
    return this.repository.listUsers(branchId, signal)
  }

  assignUser(branchId: string, userId: string): Promise<BranchUsersResult> {
    return this.repository.assignUser(branchId, userId)
  }

  removeUser(branchId: string, userId: string): Promise<BranchUsersResult> {
    return this.repository.removeUser(branchId, userId)
  }

  changeStatus(id: string, status: BranchStatus): Promise<Branch> {
    return this.repository.changeStatus(id, status)
  }

  listLifecycleEvents(branchId: string, signal?: AbortSignal): Promise<BranchLifecycleResult> {
    return this.repository.listLifecycleEvents(branchId, signal)
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
