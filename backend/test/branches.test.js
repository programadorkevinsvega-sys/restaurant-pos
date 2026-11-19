import assert from "node:assert/strict"
import test from "node:test"
import { BranchUseCases } from "../src/modules/branches/application/branch-use-cases.js"
import {
  branchCalendarExceptionSchema,
  branchLocalConfigurationSchema,
  branchSchema,
  branchStatusSchema,
  updateBranchSchema,
} from "../src/modules/branches/presentation/routes.js"

const owner = { userId: "organization-owner", role: "staff" }
const legacyAdmin = { userId: "legacy-admin", role: "admin" }
const legalEntityIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
const branch = {
  id: "branch-id",
  code: "BOG-01",
  name: "Chili Bogotá Centro",
  status: "active",
  status_changed_at: new Date("2026-11-18T00:00:00.000Z"),
  closed_at: null,
  legal_entities: [{ id: legalEntityIds[0], legal_name: "Chili Colombia S.A.S." }],
  created_at: new Date("2026-11-18T00:00:00.000Z"),
  updated_at: new Date("2026-11-18T00:00:00.000Z"),
}

function createRepository(overrides = {}) {
  return {
    findOrganizationOwnerId: async () => owner.userId,
    listBranches: async () => [branch],
    listAvailableBranches: async () => [branch],
    listBranchUsers: async () => [{ id: "staff-id", email: "staff@example.com", role: "staff", assigned: true }],
    assignUserToBranch: async () => "ASSIGNED",
    removeUserFromBranch: async () => "REMOVED",
    findBranchById: async () => branch,
    createBranch: async (input) => ({ ...branch, ...input, code: input.code.toUpperCase() }),
    updateBranch: async (id, input) => id === branch.id ? { ...branch, ...input } : null,
    changeBranchStatus: async (id, status) => ({
      outcome: "CHANGED",
      branch: { ...branch, id, status, closed_at: status === "closed" ? new Date() : null },
    }),
    listLifecycleEvents: async () => [],
    updateBranchLocalConfiguration: async (id, input) => ({ outcome: "UPDATED", branch: { ...branch, id, ...input } }),
    listCalendarExceptions: async () => [],
    upsertCalendarException: async () => "SAVED",
    deleteCalendarException: async () => "DELETED",
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

test("operator branch listing is scoped to branches assigned to the authenticated user", async () => {
  const useCases = new BranchUseCases(createRepository({
    listAvailableBranches: async (userId) => {
      assert.equal(userId, "operator-id")
      return [branch]
    },
  }))
  const result = await useCases.listAvailable({ userId: "operator-id", role: "staff" })
  assert.equal(result.branches.length, 1)
  assert.equal(result.branches[0].legal_entities[0].tax_identifier, undefined)
})

test("unauthenticated operators cannot list available branches", async () => {
  const useCases = new BranchUseCases(createRepository())
  await assert.rejects(useCases.listAvailable(null), {
    status: 401,
    code: "AUTHENTICATION_REQUIRED",
  })
})

test("organization owner can assign active users to a branch", async () => {
  let assignment
  const useCases = new BranchUseCases(createRepository({
    assignUserToBranch: async (branchId, userId, actorUserId) => {
      assignment = { branchId, userId, actorUserId }
      return "ASSIGNED"
    },
  }))
  const result = await useCases.assignUser(branch.id, "staff-id", owner)
  assert.deepEqual(assignment, { branchId: branch.id, userId: "staff-id", actorUserId: owner.userId })
  assert.equal(result.users[0].assigned, true)
})

test("legacy administrators cannot assign users without corporate ownership", async () => {
  let called = false
  const useCases = new BranchUseCases(createRepository({
    assignUserToBranch: async () => { called = true; return "ASSIGNED" },
  }))
  await assert.rejects(useCases.assignUser(branch.id, "staff-id", legacyAdmin), {
    status: 403,
    code: "ORGANIZATION_OWNER_REQUIRED",
  })
  assert.equal(called, false)
})


test("branch status schema accepts only active, suspended, and closed", () => {
  for (const status of ["active", "suspended", "closed"]) {
    assert.equal(branchStatusSchema.safeParse({ status }).success, true)
  }
  assert.equal(branchStatusSchema.safeParse({ status: "deleted" }).success, false)
  assert.equal(branchStatusSchema.safeParse({ status: "closed", force: true }).success, false)
})

test("organization owner can suspend a branch and receives its persisted status", async () => {
  const useCases = new BranchUseCases(createRepository())
  const result = await useCases.changeStatus(branch.id, "suspended", owner)
  assert.equal(result.status, "suspended")
})

test("a closed branch cannot be reactivated", async () => {
  const useCases = new BranchUseCases(createRepository({
    changeBranchStatus: async () => "BRANCH_CLOSED",
  }))
  await assert.rejects(
    useCases.changeStatus(branch.id, "active", owner),
    { status: 409, code: "BRANCH_CLOSED_PERMANENTLY" },
  )
})

test("non-owner cannot change branch lifecycle", async () => {
  let called = false
  const useCases = new BranchUseCases(createRepository({
    changeBranchStatus: async () => { called = true; return "CHANGED" },
  }))
  await assert.rejects(
    useCases.changeStatus(branch.id, "suspended", legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
})

test("branch lifecycle history is available only to the corporate owner", async () => {
  const useCases = new BranchUseCases(createRepository({
    listLifecycleEvents: async () => [{ new_status: "active" }],
  }))
  const result = await useCases.listLifecycleEvents(branch.id, owner)
  assert.equal(result.events[0].new_status, "active")
  await assert.rejects(
    useCases.listLifecycleEvents(branch.id, legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})


test("branch local configuration schema validates address and parameter field shapes", () => {
  const parsed = branchLocalConfigurationSchema.safeParse({
    operational_address: {
      line_1: "Carrera 10 # 20-30",
      line_2: null,
      locality: "Medellín",
      administrative_area: "Antioquia",
      postal_code: "050001",
      country_code: "CO",
    },
    time_zone: "America/Bogota",
    currency_code: "COP",
    weekly_hours: [
      { weekday: 1, opens_at: "09:00", closes_at: "13:00", closes_next_day: false },
      { weekday: 1, opens_at: "14:00", closes_at: "22:00", closes_next_day: false },
      { weekday: 7, opens_at: "22:00", closes_at: "02:00", closes_next_day: true },
    ],
  })
  assert.equal(parsed.success, true)
  assert.equal(branchLocalConfigurationSchema.safeParse({
    operational_address: null,
    time_zone: "",
    currency_code: "COP",
    weekly_hours: [{ weekday: 1, opens_at: "29:00", closes_at: "18:00", closes_next_day: false }],
  }).success, false)
  assert.equal(branchLocalConfigurationSchema.safeParse({
    operational_address: null,
    time_zone: null,
    currency_code: "CO",
    weekly_hours: [],
  }).success, false)
  assert.equal(branchLocalConfigurationSchema.safeParse({
    operational_address: null,
    time_zone: null,
    currency_code: null,
    weekly_hours: [],
    inherited: true,
  }).success, false)
})

test("branch calendar schema distinguishes closure from special opening hours", () => {
  assert.equal(branchCalendarExceptionSchema.safeParse({
    kind: "closed",
    periods: [],
    reason: "Festivo local",
  }).success, true)
  assert.equal(branchCalendarExceptionSchema.safeParse({
    kind: "special_hours",
    periods: [{ opens_at: "10:00", closes_at: "14:00", closes_next_day: false }],
    reason: "Jornada especial",
  }).success, true)
  assert.equal(branchCalendarExceptionSchema.safeParse({
    kind: "closed",
    periods: [{ opens_at: "10:00", closes_at: "14:00", closes_next_day: false }],
    reason: "Festivo local",
  }).success, false)
  assert.equal(branchCalendarExceptionSchema.safeParse({
    kind: "special_hours",
    periods: [],
    reason: "",
  }).success, false)
})

test("organization owner can update branch-local configuration", async () => {
  const address = { line_1: "Carrera 10", locality: "Medellín", country_code: "CO" }
  const useCases = new BranchUseCases(createRepository())
  const result = await useCases.updateLocalConfiguration(branch.id, {
    operational_address: address,
    time_zone: "America/Bogota",
    currency_code: "COP",
    weekly_hours: [],
  }, owner)
  assert.deepEqual(result.operational_address, address)
  assert.equal(result.time_zone, "America/Bogota")
  assert.equal(result.currency_code, "COP")
})

test("non-owner cannot update branch-local configuration", async () => {
  let called = false
  const useCases = new BranchUseCases(createRepository({
    updateBranchLocalConfiguration: async () => { called = true; return "UPDATED" },
  }))
  await assert.rejects(
    useCases.updateLocalConfiguration(branch.id, {
      operational_address: null,
      time_zone: null,
      currency_code: null,
      weekly_hours: [],
    }, legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
})

test("inactive branch cannot change local configuration", async () => {
  const useCases = new BranchUseCases(createRepository({
    updateBranchLocalConfiguration: async () => "BRANCH_NOT_ACTIVE",
  }))
  await assert.rejects(
    useCases.updateLocalConfiguration(branch.id, {
      operational_address: null,
      time_zone: null,
      currency_code: null,
      weekly_hours: [],
    }, owner),
    { status: 409, code: "BRANCH_NOT_ACTIVE" },
  )
})

test("branch calendar reads are scoped to the corporate owner", async () => {
  const useCases = new BranchUseCases(createRepository({
    listCalendarExceptions: async (id, from, to) => [{
      id: "exception-1",
      local_date: "2027-01-01",
      kind: "closed",
      periods: [],
      reason: "Festivo",
      from,
      to,
    }],
  }))
  const result = await useCases.listCalendarExceptions(branch.id, "2027-01-01", "2027-03-31", owner)
  assert.equal(result.exceptions[0].local_date, "2027-01-01")
  await assert.rejects(
    useCases.listCalendarExceptions(branch.id, "2027-01-01", "2027-03-31", legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
})

test("calendar exception creation requires an active branch and configured timezone", async () => {
  const useCases = new BranchUseCases(createRepository())
  const result = await useCases.upsertCalendarException(branch.id, "2027-01-01", {
    kind: "closed",
    periods: [],
    reason: "Festivo local",
  }, owner)
  assert.deepEqual(result, { saved: true })

  const noTimezone = new BranchUseCases(createRepository({
    upsertCalendarException: async () => "TIME_ZONE_REQUIRED",
  }))
  await assert.rejects(
    noTimezone.upsertCalendarException(branch.id, "2027-01-01", {
      kind: "closed",
      periods: [],
      reason: "Festivo local",
    }, owner),
    { status: 409, code: "BRANCH_TIME_ZONE_REQUIRED" },
  )
})

test("calendar exceptions cannot be changed by a non-owner or on an inactive branch", async () => {
  let called = false
  const useCases = new BranchUseCases(createRepository({
    upsertCalendarException: async () => { called = true; return "BRANCH_NOT_ACTIVE" },
  }))
  await assert.rejects(
    useCases.upsertCalendarException(branch.id, "2027-01-01", {
      kind: "closed",
      periods: [],
      reason: "Festivo local",
    }, legacyAdmin),
    { status: 403, code: "ORGANIZATION_OWNER_REQUIRED" },
  )
  assert.equal(called, false)
  await assert.rejects(
    useCases.upsertCalendarException(branch.id, "2027-01-01", {
      kind: "closed",
      periods: [],
      reason: "Festivo local",
    }, owner),
    { status: 409, code: "BRANCH_NOT_ACTIVE" },
  )
})
