import assert from "node:assert/strict"
import test from "node:test"
import { LegalEntityUseCases } from "../src/modules/legal-entities/application/legal-entity-use-cases.js"
import { legalEntitySchema } from "../src/modules/legal-entities/presentation/routes.js"

const owner = { userId: "organization-owner", role: "staff" }
const admin = { userId: "legacy-admin", role: "admin" }
const entity = {
  id: "legal-entity-id",
  legal_name: "Restaurantes de Colombia S.A.S.",
  commercial_name: "Chili Colombia",
  tax_country_code: "CO",
  tax_identifier_type: "NIT",
  tax_identifier: "900123456-7",
  registered_address: { country_code: "CO", locality: "Medellín" },
  contact_email: "legal@example.com",
  contact_phone: "+57 300 000 0000",
  branch_count: 0,
  created_at: new Date("2026-11-18T00:00:00.000Z"),
  updated_at: new Date("2026-11-18T00:00:00.000Z"),
}

function createRepository(overrides = {}) {
  return {
    findOrganizationOwnerId: async () => owner.userId,
    listLegalEntities: async () => [entity],
    createLegalEntity: async (input) => ({ ...entity, ...input }),
    updateLegalEntity: async (id, input) => id === entity.id ? { ...entity, ...input } : null,
    ...overrides,
  }
}

test("legal entity schema normalizes jurisdiction and identifier type", () => {
  const parsed = legalEntitySchema.safeParse({
    legal_name: "  Restaurantes de Colombia S.A.S. ",
    tax_country_code: "co",
    tax_identifier_type: "nit",
    tax_identifier: " 900123456-7 ",
    contact_email: " LEGAL@EXAMPLE.COM ",
  })

  assert.equal(parsed.success, true)
  assert.equal(parsed.data.legal_name, "Restaurantes de Colombia S.A.S.")
  assert.equal(parsed.data.tax_country_code, "CO")
  assert.equal(parsed.data.tax_identifier_type, "NIT")
  assert.equal(parsed.data.tax_identifier, "900123456-7")
  assert.equal(parsed.data.contact_email, "legal@example.com")
})

test("legal entity schema rejects invalid country, identifier scheme and unknown fiscal fields", () => {
  const base = {
    legal_name: "Restaurantes de Colombia S.A.S.",
    tax_country_code: "CO",
    tax_identifier_type: "NIT",
    tax_identifier: "900123456-7",
  }

  assert.equal(legalEntitySchema.safeParse({ ...base, tax_country_code: "COL" }).success, false)
  assert.equal(legalEntitySchema.safeParse({ ...base, tax_identifier_type: "1" }).success, false)
  assert.equal(legalEntitySchema.safeParse({ ...base, tax_regime: "ordinary" }).success, false)
})

test("legal entity list is readable by an authenticated user without granting management", async () => {
  const useCases = new LegalEntityUseCases(createRepository())
  const result = await useCases.list(admin)

  assert.equal(result.legal_entities.length, 1)
  assert.deepEqual(result.permissions, { can_manage: false })
})

test("organization owner can create a legal entity", async () => {
  let actor
  const useCases = new LegalEntityUseCases(createRepository({
    createLegalEntity: async (input, actorUserId) => {
      actor = actorUserId
      return { ...entity, ...input }
    },
  }))

  const result = await useCases.create({ legal_name: entity.legal_name }, owner)

  assert.equal(actor, owner.userId)
  assert.equal(result.legal_name, entity.legal_name)
})

test("legacy admin cannot manage legal entities without being the registered organization owner", async () => {
  let called = false
  const useCases = new LegalEntityUseCases(createRepository({
    createLegalEntity: async () => {
      called = true
      return entity
    },
  }))

  await assert.rejects(
    useCases.create({ legal_name: entity.legal_name }, admin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
})

test("duplicate tax identity returns a conflict", async () => {
  const useCases = new LegalEntityUseCases(createRepository({ createLegalEntity: async () => null }))

  await assert.rejects(
    useCases.create({ legal_name: entity.legal_name }, owner),
    { status: 409, code: "LEGAL_ENTITY_TAX_ID_ALREADY_EXISTS" },
  )
})

test("legal entity update is limited to the organization owner", async () => {
  const useCases = new LegalEntityUseCases(createRepository())

  await assert.rejects(
    useCases.update(entity.id, { legal_name: "Changed" }, admin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})

test("legal entity list requires an initialized organization", async () => {
  const useCases = new LegalEntityUseCases(createRepository({ findOrganizationOwnerId: async () => null }))

  await assert.rejects(
    useCases.list(owner),
    { status: 404, code: "ORGANIZATION_NOT_INITIALIZED" },
  )
})
