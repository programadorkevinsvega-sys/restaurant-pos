export function toPublicOrganizationProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    commercial_name: profile.commercialName,
    contact_email: profile.contactEmail,
    contact_phone: profile.contactPhone,
    website_url: profile.websiteUrl,
    headquarters_address: profile.headquartersAddress,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  }
}
