import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { AvailableBranchesResult, Branch, BranchInput, BranchLifecycleResult, BranchStatus, BranchesResult, BranchUpdate, BranchUsersResult } from "../domain/models"
import type { BranchRepository } from "../domain/branch-repository"

export class HttpBranchRepository implements BranchRepository {
  constructor(private readonly http: HttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.get<BranchesResult>("/branches", signal)
  }

  listAvailable(signal?: AbortSignal) {
    return this.http.get<AvailableBranchesResult>("/branches/available", signal)
  }

  listUsers(branchId: string, signal?: AbortSignal) {
    return this.http.get<BranchUsersResult>(`/branches/${encodeURIComponent(branchId)}/users`, signal)
  }

  assignUser(branchId: string, userId: string) {
    return this.http.post<BranchUsersResult>(`/branches/${encodeURIComponent(branchId)}/users/${encodeURIComponent(userId)}`, {})
  }

  removeUser(branchId: string, userId: string) {
    return this.http.delete<BranchUsersResult>(`/branches/${encodeURIComponent(branchId)}/users/${encodeURIComponent(userId)}`)
  }

  async changeStatus(id: string, status: BranchStatus) {
    const result = await this.http.put<{ branch: Branch }>(
      `/branches/${encodeURIComponent(id)}/status`,
      { status },
    )
    return result.branch
  }

  listLifecycleEvents(branchId: string) {
    return this.http.get<BranchLifecycleResult>(
      `/branches/${encodeURIComponent(branchId)}/lifecycle`,
    )
  }

  async create(input: BranchInput) {
    const result = await this.http.post<{ branch: Branch }>("/branches", input)
    return result.branch
  }

  async update(id: string, input: BranchUpdate) {
    const result = await this.http.put<{ branch: Branch }>(
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
