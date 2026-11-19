import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { Branch, BranchInput, BranchesResult, BranchUpdate } from "../domain/models"
import type { BranchRepository } from "../domain/branch-repository"

export class HttpBranchRepository implements BranchRepository {
  constructor(private readonly http: HttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.get<BranchesResult>("/branches", signal)
  }

  async create(input: BranchInput) {
    const result = await this.http.post<{ branch: Branch }>("/branches", input)
    return result.branch
  }

  async update(id: string, input: BranchUpdate) {
    const result = await this.http.patch<{ branch: Branch }>(
      `/branches/${encodeURIComponent(id)}`,
      input,
    )
    return result.branch
  }

  async assignLegalEntity(branchId: string, legalEntityId: string) {
    const result = await this.http.post<{ branch: Branch }>(
      `/branches/${encodeURIComponent(branchId)}/legal-entities/${encodeURIComponent(legalEntityId)}`,
      {},
    )
    return result.branch
  }

  async removeLegalEntity(branchId: string, legalEntityId: string) {
    const result = await this.http.delete<{ branch: Branch }>(
      `/branches/${encodeURIComponent(branchId)}/legal-entities/${encodeURIComponent(legalEntityId)}`,
    )
    return result.branch
  }
}
