import type {
  OrganizationProfileInput,
  OrganizationProfileResult,
  OrganizationProfileUpdate,
} from "./models"

export interface OrganizationRepository {
  get(signal?: AbortSignal): Promise<OrganizationProfileResult>
  bootstrap(input: OrganizationProfileInput): Promise<OrganizationProfileResult>
  update(input: OrganizationProfileUpdate): Promise<OrganizationProfileResult>
}
