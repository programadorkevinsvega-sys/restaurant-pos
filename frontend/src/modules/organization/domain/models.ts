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
