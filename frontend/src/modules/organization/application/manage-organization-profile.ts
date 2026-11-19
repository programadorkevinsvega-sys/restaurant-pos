import type { OrganizationRepository } from "../domain/organization-repository"
import type {
  OrganizationProfileInput,
  OrganizationProfileResult,
  OrganizationProfileUpdate,
} from "../domain/models"

export class ManageOrganizationProfile {
  constructor(private readonly repository: OrganizationRepository) {}

  get(signal?: AbortSignal): Promise<OrganizationProfileResult> {
    return this.repository.get(signal)
  }

  bootstrap(input: OrganizationProfileInput): Promise<OrganizationProfileResult> {
    return this.repository.bootstrap(input)
  }

  update(input: OrganizationProfileUpdate): Promise<OrganizationProfileResult> {
    return this.repository.update(input)
  }
}
