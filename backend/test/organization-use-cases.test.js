import assert from "node:assert/strict"
import test from "node:test"
import { OrganizationUseCases } from "../src/modules/organization/application/organization-use-cases.js"
import { PostgresOrganizationRepository } from "../src/modules/organization/infrastructure/postgres-organization-repository.js"

const admin = { userId: "admin-user-id", role: "admin" }
const owner = { userId: "owner-user-id", role: "staff" }
const profile = {
  id: "organization-id",
  name: "Chili POS Group",
  commercialName: "Chili POS",
  contactEmail: "contact@example.com",
  contactPhone: "+57 300 000 0000",
  websiteUrl: "https://example.com",
  headquartersAddress: { country_code: "CO" },
  ownerUserId: owner.userId,
  createdAt: new Date("2026-11-18T00:00:00.000Z"),
  updatedAt: new Date("2026-11-18T00:00:00.000Z"),
}

function repository(overrides = {}) {
  return {
    findProfile: async () => profile,
    createProfile: async (input, actorUserId) => ({ ...profile, ...input, ownerUserId: actorUserId }),
    updateProfile: async (input, actorUserId) => ({ ...profile, ...input, ownerUserId: actorUserId }),
    ...overrides,
  }
}

test("organization bootstrap records the authenticated administrator as explicit owner", async () => {
  let createdBy
  const useCases = new OrganizationUseCases(repository({
    createProfile: async (input, actorUserId) => {
      createdBy = actorUserId
      return { ...profile, ...input, ownerUserId: actorUserId }
    },
  }))

  const result = await useCases.bootstrapProfile({ name: "Chili POS Group" }, admin)

  assert.equal(createdBy, admin.userId)
  assert.equal(result.name, "Chili POS Group")
  assert.equal(Object.hasOwn(result, "ownerUserId"), false)
})

test("staff cannot bootstrap an organization", async () => {
  let called = false
  const useCases = new OrganizationUseCases(repository({
    createProfile: async () => {
      called = true
      return profile
    },
  }))

  await assert.rejects(
    useCases.bootstrapProfile({ name: "Chili POS Group" }, owner),
    { status: 403, code: "ORGANIZATION_BOOTSTRAP_FORBIDDEN" },
  )
  assert.equal(called, false)
})

test("bootstrap reports a conflict when the installation already has an organization", async () => {
  const useCases = new OrganizationUseCases(repository({ createProfile: async () => null }))

  await assert.rejects(
    useCases.bootstrapProfile({ name: "Duplicate" }, admin),
    { status: 409, code: "ORGANIZATION_ALREADY_INITIALIZED" },
  )
})

test("reading an uninitialized organization returns a stable not-configured error", async () => {
  const useCases = new OrganizationUseCases(repository({ findProfile: async () => null }))

  await assert.rejects(
    useCases.getProfile(),
    { status: 404, code: "ORGANIZATION_NOT_INITIALIZED" },
  )
})

test("only the explicitly registered owner may update the organization profile", async () => {
  let updated = false
  const useCases = new OrganizationUseCases(repository({
    findProfile: async () => profile,
    updateProfile: async () => {
      updated = true
      return profile
    },
  }))

  await assert.rejects(
    useCases.updateProfile({ commercial_name: "Changed" }, admin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(updated, false)
})

test("organization owner can update profile fields without changing ownership", async () => {
  let updateInput
  let updateActor
  const useCases = new OrganizationUseCases(repository({
    updateProfile: async (input, actorUserId) => {
      updateInput = input
      updateActor = actorUserId
      return { ...profile, ...input }
    },
  }))

  const result = await useCases.updateProfile({ commercial_name: "Chili POS" }, owner)

  assert.deepEqual(updateInput, { commercial_name: "Chili POS" })
  assert.equal(updateActor, owner.userId)
  assert.equal(result.commercial_name, "Chili POS")
})

test("empty profile updates are rejected", async () => {
  const useCases = new OrganizationUseCases(repository())

  await assert.rejects(
    useCases.updateProfile({}, owner),
    { status: 400, code: "EMPTY_UPDATE" },
  )
})


test("organization profile schema trims and normalizes corporate contact details", async () => {
  const { organizationProfileSchema } = await import("../src/modules/organization/presentation/routes.js")
  const parsed = organizationProfileSchema.safeParse({
    name: "  Chili POS Group  ",
    contact_email: "  CONTACT@EXAMPLE.COM ",
    contact_phone: "+57 300 000 0000",
    website_url: "https://example.com",
    headquarters_address: {
      line_1: "  Main Street 1 ",
      country_code: "CO",
    },
  })

  assert.equal(parsed.success, true)
  assert.equal(parsed.data.name, "Chili POS Group")
  assert.equal(parsed.data.contact_email, "contact@example.com")
  assert.equal(parsed.data.contact_phone, "+57 300 000 0000")
})

test("organization profile schema rejects non-HTTP websites, invalid country codes and unknown fields", async () => {
  const { organizationProfileSchema } = await import("../src/modules/organization/presentation/routes.js")

  assert.equal(organizationProfileSchema.safeParse({
    name: "Chili POS",
    website_url: "ftp://example.com",
  }).success, false)

  assert.equal(organizationProfileSchema.safeParse({
    name: "Chili POS",
    headquarters_address: { country_code: "co" },
  }).success, false)

  assert.equal(organizationProfileSchema.safeParse({
    name: "Chili POS",
    nit: "900000000",
  }).success, false)
})

test("organization update schema rejects empty patches", async () => {
  const { updateOrganizationProfileSchema } = await import("../src/modules/organization/presentation/routes.js")
  assert.equal(updateOrganizationProfileSchema.safeParse({}).success, false)
})


test("PostgreSQL organization repository serializes structured address and maps the profile", async () => {
  let call
  const repository = new PostgresOrganizationRepository({
    query: async (...args) => {
      call = args
      return {
        rows: [{
          id: profile.id,
          name: profile.name,
          commercial_name: profile.commercialName,
          contact_email: profile.contactEmail,
          contact_phone: profile.contactPhone,
          website_url: profile.websiteUrl,
          headquarters_address: profile.headquartersAddress,
          owner_user_id: profile.ownerUserId,
          created_at: profile.createdAt,
          updated_at: profile.updatedAt,
        }],
      }
    },
  })

  const created = await repository.createProfile({
    name: profile.name,
    headquarters_address: profile.headquartersAddress,
  }, admin.userId)

  assert.match(call[0], /bootstrap_organization_profile/)
  assert.equal(call[1][0], profile.name)
  assert.equal(call[1][5], JSON.stringify(profile.headquartersAddress))
  assert.equal(call[1][6], admin.userId)
  assert.equal(created.ownerUserId, profile.ownerUserId)
})

test("PostgreSQL organization repository preserves omitted fields during partial updates", async () => {
  let call
  const repository = new PostgresOrganizationRepository({
    query: async (...args) => {
      call = args
      return { rows: [] }
    },
  })

  const updated = await repository.updateProfile({
    commercial_name: "Chili POS Corporate",
  }, owner.userId)

  assert.match(call[0], /update_organization_profile/)
  assert.equal(call[1].length, 13)
  assert.deepEqual(call[1], [
    owner.userId,
    false, null,
    true, "Chili POS Corporate",
    false, null,
    false, null,
    false, null,
    false, null,
  ])
  assert.equal(updated, null)
})
