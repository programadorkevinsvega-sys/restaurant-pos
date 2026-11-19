import type { HttpClient } from "@/shared/infrastructure/http-client"
import type {
  OrganizationProfileInput,
  OrganizationProfileResult,
  OrganizationProfileUpdate,
  OrganizationHistoryFilters,
  OrganizationHistoryPage,
} from "../domain/models"
import type { OrganizationRepository } from "../domain/organization-repository"

export class HttpOrganizationRepository implements OrganizationRepository {
  constructor(private readonly http: HttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.get<OrganizationProfileResult>("/organization", signal)
  }

  bootstrap(input: OrganizationProfileInput) {
    return this.http.post<OrganizationProfileResult>("/organization/bootstrap", input)
  }

  update(input: OrganizationProfileUpdate) {
    return this.http.patch<OrganizationProfileResult>("/organization", input)
  }

  listHistory(filters: OrganizationHistoryFilters) {
    const query = new URLSearchParams({ limit: String(filters.limit) })
    if (filters.resource_type) query.set("resource_type", filters.resource_type)
    if (filters.branch_id) query.set("branch_id", filters.branch_id)
    if (filters.before_at) query.set("before_at", filters.before_at)
    if (filters.before_id) query.set("before_id", filters.before_id)
    return this.http.get<OrganizationHistoryPage>(`/organization/history?${query.toString()}`)
  }
}
