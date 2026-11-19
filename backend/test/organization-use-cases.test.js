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
  assert.equal(result.organization.name, "Chili POS Group")
  assert.equal(result.permissions.can_update, true)
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
    useCases.getProfile(owner),
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
  assert.equal(result.organization.commercial_name, "Chili POS")
  assert.equal(result.permissions.can_update, true)
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

test("organization profile response exposes update capability without exposing owner identity", async () => {
  const useCases = new OrganizationUseCases(repository())
  const result = await useCases.getProfile(owner)

  assert.deepEqual(result.permissions, { can_update: true })
  assert.equal(Object.hasOwn(result.organization, "owner_user_id"), false)
  assert.equal(Object.hasOwn(result.organization, "ownerUserId"), false)
})

test("non-owner administrators can read but cannot update the profile", async () => {
  const useCases = new OrganizationUseCases(repository())
  const result = await useCases.getProfile(admin)

  assert.deepEqual(result.permissions, { can_update: false })
  await assert.rejects(
    useCases.updateProfile({ commercial_name: "Forbidden" }, admin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})


test("organization history is restricted to the registered owner", async () => {
  let called = false
  const useCases = new OrganizationUseCases(repository({
    listHistory: async () => {
      called = true
      return []
    },
  }))

  await assert.rejects(
    useCases.listHistory({ limit: 50 }, admin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
})

test("organization history returns a stable next cursor when more events exist", async () => {
  const rows = [
    { id: "event-3", occurred_at: new Date("2027-01-03T00:00:00.000Z") },
    { id: "event-2", occurred_at: new Date("2027-01-02T00:00:00.000Z") },
    { id: "event-1", occurred_at: new Date("2027-01-01T00:00:00.000Z") },
  ]
  let received
  const useCases = new OrganizationUseCases(repository({
    listHistory: async (filters, actorUserId) => {
      received = { filters, actorUserId }
      return rows
    },
  }))

  const result = await useCases.listHistory({ limit: 2, resource_type: "branch" }, owner)

  assert.equal(received.actorUserId, owner.userId)
  assert.equal(received.filters.limit, 3)
  assert.equal(received.filters.resource_type, "branch")
  assert.deepEqual(result.events.map((event) => event.id), ["event-3", "event-2"])
  assert.deepEqual(result.next_cursor, {
    before_at: "2027-01-02T00:00:00.000Z",
    before_id: "event-2",
  })
})

test("organization history requires an initialized organization", async () => {
  const useCases = new OrganizationUseCases(repository({
    findProfile: async () => null,
  }))

  await assert.rejects(
    useCases.listHistory({ limit: 50 }, owner),
    { status: 404, code: "ORGANIZATION_NOT_INITIALIZED" },
  )
})

test("organization history query schema validates filters and complete cursors", async () => {
  const { organizationHistoryQuerySchema } = await import("../src/modules/organization/presentation/routes.js")
  const valid = organizationHistoryQuerySchema.safeParse({
    limit: "25",
    resource_type: "branch",
    branch_id: "11111111-1111-4111-8111-111111111111",
    before_at: "2027-01-02T00:00:00.000Z",
    before_id: "22222222-2222-4222-8222-222222222222",
  })

  assert.equal(valid.success, true)
  assert.equal(valid.data.limit, 25)
  assert.equal(organizationHistoryQuerySchema.safeParse({ before_at: "2027-01-02T00:00:00.000Z" }).success, false)
  assert.equal(organizationHistoryQuerySchema.safeParse({ before_id: "22222222-2222-4222-8222-222222222222" }).success, false)
  assert.equal(organizationHistoryQuerySchema.safeParse({ limit: "101" }).success, false)
  assert.equal(organizationHistoryQuerySchema.safeParse({ unknown: "value" }).success, false)
})


test("PostgreSQL organization repository reads history through its protected function", async () => {
  let queryCall
  const repository = new PostgresOrganizationRepository({
    query: async (...args) => {
      queryCall = args
      return { rows: [{ id: "event-id", actor_email: "owner@example.invalid" }] }
    },
  })

  const rows = await repository.listHistory({
    limit: 51,
    before_at: "2027-01-02T00:00:00.000Z",
    before_id: "22222222-2222-4222-8222-222222222222",
    resource_type: "branch",
    branch_id: "11111111-1111-4111-8111-111111111111",
  }, owner.userId)

  assert.match(queryCall[0], /public\\.list_organization_history/)
  assert.deepEqual(queryCall[1], [
    owner.userId,
    51,
    "2027-01-02T00:00:00.000Z",
    "22222222-2222-4222-8222-222222222222",
    "branch",
    "11111111-1111-4111-8111-111111111111",
  ])
  assert.equal(rows[0].actor_email, "owner@example.invalid")
})


test("PostgreSQL organization history maps a revoked owner authorization to 403", async () => {
  const repository = new PostgresOrganizationRepository({
    query: async () => {
      const error = new Error("Active organization owner required")
      error.code = "42501"
      throw error
    },
  })

  await assert.rejects(
    repository.listHistory({ limit: 50 }, owner.userId),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})
