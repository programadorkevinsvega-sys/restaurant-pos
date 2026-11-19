export function toLegalEntityDto(entity) {
  return {
    id: entity.id,
    legal_name: entity.legal_name,
    commercial_name: entity.commercial_name,
    tax_country_code: entity.tax_country_code,
    tax_identifier_type: entity.tax_identifier_type,
    tax_identifier: entity.tax_identifier,
    registered_address: entity.registered_address,
    contact_email: entity.contact_email,
    contact_phone: entity.contact_phone,
    branch_count: entity.branch_count ?? 0,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  }
}
