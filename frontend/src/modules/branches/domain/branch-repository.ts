import type { Branch, BranchInput, BranchesResult, BranchUpdate } from "./models"

export interface BranchRepository {
  list(signal?: AbortSignal): Promise<BranchesResult>
  create(input: BranchInput): Promise<Branch>
  update(id: string, input: BranchUpdate): Promise<Branch>
  assignLegalEntity(branchId: string, legalEntityId: string): Promise<Branch>
  removeLegalEntity(branchId: string, legalEntityId: string): Promise<Branch>
}
