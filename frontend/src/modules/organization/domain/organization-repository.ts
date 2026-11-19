import type {
  OrganizationProfileInput,
  OrganizationProfileResult,
  OrganizationProfileUpdate,
} from "./models"
import type {
  OrganizationHistoryFilters,
  OrganizationHistoryPage,
} from "./models"

export interface OrganizationRepository {
  get(signal?: AbortSignal): Promise<OrganizationProfileResult>
  bootstrap(input: OrganizationProfileInput): Promise<OrganizationProfileResult>
  update(input: OrganizationProfileUpdate): Promise<OrganizationProfileResult>
  listHistory(filters: OrganizationHistoryFilters): Promise<OrganizationHistoryPage>
}
