import type { HttpClient } from "@/shared/infrastructure/http-client"
import type {
  AvailableBranchesResult,
  Branch,
  BranchCalendarExceptionInput,
  BranchCalendarResult,
  BranchInput,
  BranchLifecycleResult,
  BranchLocalConfiguration,
  BranchStatus,
  BranchesResult,
  BranchUpdate,
  BranchUsersResult,
} from "../domain/models"
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

  async updateLocalConfiguration(id: string, input: BranchLocalConfiguration) {
    const result = await this.http.put<{ branch: Branch }>(
      `/branches/${encodeURIComponent(id)}/configuration`,
      input,
    )
    return result.branch
  }

  listCalendar(branchId: string, from: string, to: string, signal?: AbortSignal) {
    const query = new URLSearchParams({ from, to })
    return this.http.get<BranchCalendarResult>(
      `/branches/${encodeURIComponent(branchId)}/calendar?${query.toString()}`,
      signal,
    )
  }

  async upsertCalendarException(branchId: string, localDate: string, input: BranchCalendarExceptionInput) {
    await this.http.put(
      `/branches/${encodeURIComponent(branchId)}/calendar/${encodeURIComponent(localDate)}`,
      input,
    )
  }

  async deleteCalendarException(branchId: string, localDate: string) {
    await this.http.delete(
      `/branches/${encodeURIComponent(branchId)}/calendar/${encodeURIComponent(localDate)}`,
    )
  }

  listLifecycleEvents(branchId: string, signal?: AbortSignal) {
    return this.http.get<BranchLifecycleResult>(
      `/branches/${encodeURIComponent(branchId)}/lifecycle`,
      signal,
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
