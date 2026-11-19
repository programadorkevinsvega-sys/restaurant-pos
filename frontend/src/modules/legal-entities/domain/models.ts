export interface LegalEntityAddress {
  line_1?: string | null
  line_2?: string | null
  locality?: string | null
  administrative_area?: string | null
  postal_code?: string | null
  country_code?: string | null
}

export interface LegalEntity {
  id: string
  legal_name: string
  commercial_name: string | null
  tax_country_code: string
  tax_identifier_type: string
  tax_identifier: string
  registered_address: LegalEntityAddress | null
  contact_email: string | null
  contact_phone: string | null
  branch_count: number
  created_at: string
  updated_at: string
}

export interface LegalEntityInput {
  legal_name: string
  commercial_name?: string | null
  tax_country_code: string
  tax_identifier_type: string
  tax_identifier: string
  registered_address?: LegalEntityAddress | null
  contact_email?: string | null
  contact_phone?: string | null
}

export interface LegalEntitiesResult {
  legal_entities: LegalEntity[]
  permissions: {
    can_manage: boolean
  }
}
