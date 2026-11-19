import assert from "node:assert/strict"
import test from "node:test"
import { BranchUseCases } from "../src/modules/branches/application/branch-use-cases.js"
import { branchSchema, updateBranchSchema } from "../src/modules/branches/presentation/routes.js"

const owner = { userId: "organization-owner", role: "staff" }
const legacyAdmin = { userId: "legacy-admin", role: "admin" }
const legalEntityIds = ["legal-entity-1", "legal-entity-2"]
const branch = {
  id: "branch-id",
  code: "BOG-01",
  name: "Chili Bogotá Centro",
  legal_entities: [{ id: legalEntityIds[0], legal_name: "Chili Colombia S.A.S." }],
  created_at: new Date("2026-11-18T00:00:00.000Z"),
  updated_at: new Date("2026-11-18T00:00:00.000Z"),
}

function createRepository(overrides = {}) {
  return {
    findOrganizationOwnerId: async () => owner.userId,
    listBranches: async () => [branch],
    findBranchById: async () => branch,
    createBranch: async (input) => ({ ...branch, ...input, code: input.code.toUpperCase() }),
    updateBranch: async (id, input) => id === branch.id ? { ...branch, ...input } : null,
    assignLegalEntity: async () => branch,
    removeLegalEntity: async () => "REMOVED",
    ...overrides,
  }
}

test("branch schema requires one or more unique legal entities and normalizes the code", () => {
  const parsed = branchSchema.safeParse({
    code: "bog-01",
    name: " Chili Bogotá Centro ",
    legal_entity_ids: legalEntityIds,
  })

  assert.equal(parsed.success, true)
  assert.equal(parsed.data.code, "BOG-01")
  assert.equal(parsed.data.name, "Chili Bogotá Centro")
  assert.equal(branchSchema.safeParse({
    code: "BOG-01",
    name: "Bogotá",
    legal_entity_ids: [],
  }).success, false)
  assert.equal(branchSchema.safeParse({
    code: "BOG-01",
    name: "Bogotá",
    legal_entity_ids: [legalEntityIds[0], legalEntityIds[0]],
  }).success, false)
})

test("branch update schema accepts only base identity fields", () => {
  assert.equal(updateBranchSchema.safeParse({ code: "BOG-02", name: "Bogotá Norte" }).success, true)
  assert.equal(updateBranchSchema.safeParse({
    code: "BOG-02",
    name: "Bogotá Norte",
    timezone: "America/Bogota",
  }).success, false)
})

test("branch list is available to the registered organization owner", async () => {
  const useCases = new BranchUseCases(createRepository())
  const result = await useCases.list(owner)

  assert.equal(result.branches.length, 1)
  assert.deepEqual(result.permissions, { can_manage: true })
})

test("legacy administrators cannot read branch legal associations without owner assignment", async () => {
  const useCases = new BranchUseCases(createRepository())

  await assert.rejects(
    useCases.list(legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})

test("branch creation persists one-to-many legal entity associations", async () => {
  let inputReceived
  const useCases = new BranchUseCases(createRepository({
    createBranch: async (input) => {
      inputReceived = input
      return branch
    },
  }))

  const result = await useCases.create({
    code: "BOG-01",
    name: "Chili Bogotá Centro",
    legal_entity_ids: legalEntityIds,
  }, owner)

  assert.deepEqual(inputReceived.legal_entity_ids, legalEntityIds)
  assert.equal(result.legal_entities.length, 1)
})

test("branch cannot be created with legal entities outside the organization", async () => {
  const useCases = new BranchUseCases(createRepository({
    createBranch: async () => ({ outcome: "LEGAL_ENTITY_SCOPE_INVALID" }),
  }))

  await assert.rejects(
    useCases.create({ code: "BOG-01", name: "Bogotá", legal_entity_ids: [legalEntityIds[0]] }, owner),
    { status: 422, code: "LEGAL_ENTITY_SCOPE_INVALID" },
  )
})

test("a duplicate branch code returns a conflict", async () => {
  const useCases = new BranchUseCases(createRepository({
    createBranch: async () => ({ outcome: "BRANCH_CODE_ALREADY_EXISTS" }),
  }))

  await assert.rejects(
    useCases.create({ code: "BOG-01", name: "Bogotá", legal_entity_ids: [legalEntityIds[0]] }, owner),
    { status: 409, code: "BRANCH_CODE_ALREADY_EXISTS" },
  )
})

test("legacy admin cannot create branches without explicit organization ownership", async () => {
  let called = false
  const useCases = new BranchUseCases(createRepository({
    createBranch: async () => {
      called = true
      return branch
    },
  }))

  await assert.rejects(
    useCases.create({ code: "BOG-01", name: "Bogotá", legal_entity_ids: [legalEntityIds[0]] }, legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
})

test("the last legal entity association cannot be removed", async () => {
  const useCases = new BranchUseCases(createRepository({
    removeLegalEntity: async () => "LAST_LEGAL_ENTITY",
  }))

  await assert.rejects(
    useCases.removeLegalEntity(branch.id, legalEntityIds[0], owner),
    { status: 409, code: "BRANCH_REQUIRES_LEGAL_ENTITY" },
  )
})

test("branch entity association conflict is reported without widening scope", async () => {
  const useCases = new BranchUseCases(createRepository({ assignLegalEntity: async () => null }))

  await assert.rejects(
    useCases.assignLegalEntity(branch.id, "foreign-legal-entity-id", owner),
    { status: 409, code: "BRANCH_LEGAL_ENTITY_ASSIGNMENT_CONFLICT" },
  )
})

test("missing organization blocks branch management", async () => {
  const useCases = new BranchUseCases(createRepository({ findOrganizationOwnerId: async () => null }))

  await assert.rejects(
    useCases.list(owner),
    { status: 404, code: "ORGANIZATION_NOT_INITIALIZED" },
  )
})
