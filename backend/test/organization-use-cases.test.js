import assert from "node:assert/strict"
import test from "node:test"
import { OrganizationUseCases } from "../src/modules/organization/application/organization-use-cases.js"

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
