export interface OrganizationAddress {
  line_1?: string | null
  line_2?: string | null
  locality?: string | null
  administrative_area?: string | null
  postal_code?: string | null
  country_code?: string | null
}

export interface OrganizationProfile {
  id: string
  name: string
  commercial_name: string | null
  contact_email: string | null
  contact_phone: string | null
  website_url: string | null
  headquarters_address: OrganizationAddress | null
  created_at: string
  updated_at: string
}

export interface OrganizationProfileInput {
  name: string
  commercial_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  website_url?: string | null
  headquarters_address?: OrganizationAddress | null
}

export type OrganizationProfileUpdate = Partial<OrganizationProfileInput>

export interface OrganizationProfileResult {
  organization: OrganizationProfile
  permissions: {
    can_update: boolean
  }
}

export type OrganizationHistoryResourceType =
  | "organization"
  | "legal_entity"
  | "branch"
  | "branch_legal_entity"

export interface OrganizationHistoryCursor {
  before_at: string
  before_id: string
}

export interface OrganizationHistoryFilters {
  limit: number
  resource_type?: OrganizationHistoryResourceType
  branch_id?: string
  before_at?: string
  before_id?: string
}

export interface OrganizationHistoryEvent {
  id: string
  resource_type: OrganizationHistoryResourceType
  resource_id: string
  branch_id: string | null
  action: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  metadata: Record<string, unknown>
  actor_user_id: string
  actor_email: string
  occurred_at: string
}

export interface OrganizationHistoryPage {
  events: OrganizationHistoryEvent[]
  next_cursor: OrganizationHistoryCursor | null
}
