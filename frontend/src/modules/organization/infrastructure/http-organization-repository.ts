import type { HttpClient } from "@/shared/infrastructure/http-client"
import type {
  OrganizationProfileInput,
  OrganizationProfileResult,
  OrganizationProfileUpdate,
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
}
