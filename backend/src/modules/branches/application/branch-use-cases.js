import { AppError } from "../../../shared/domain/app-error.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"
import { toAvailableBranchDto, toBranchDto } from "../domain/branch.js"

export class BranchUseCases {
  constructor(repository) {
    this.repository = repository
  }

  async requireActor(actor) {
    if (!actor?.userId) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    }
  }

  async requireOrganizationOwner(actor) {
    await this.requireActor(actor)
    const ownerUserId = await this.repository.findOrganizationOwnerId()
    if (!ownerUserId) {
      throw new AppError(404, "ORGANIZATION_NOT_INITIALIZED", "La organización todavía no está configurada.")
    }
    if (ownerUserId !== actor.userId) {
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario registrado puede administrar sucursales y sus entidades legales.")
    }
  }

  listAvailable(actor) {
    return traceOperation("branches.list_available", async () => {
      await this.requireActor(actor)
      return {
        branches: (await this.repository.listAvailableBranches(actor.userId)).map(toAvailableBranchDto),
      }
    })
  }

  list(actor) {
    return traceOperation("branches.list", async () => {
      await this.requireOrganizationOwner(actor)
      return {
        branches: (await this.repository.listBranches()).map(toBranchDto),
        permissions: { can_manage: true },
      }
    })
  }

  listUsers(branchId, actor) {
    return traceOperation("branches.list_users", async () => {
      await this.requireOrganizationOwner(actor)
      if (!await this.repository.findBranchById(branchId)) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "No se encontró la sucursal indicada.")
      }
      const users = await this.repository.listBranchUsers(branchId)
      return {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          assigned: user.assigned,
        })),
      }
    })
  }

  assignUser(branchId, userId, actor) {
    return traceOperation("branches.assign_user", async () => {
      await this.requireOrganizationOwner(actor)
      const outcome = await this.repository.assignUserToBranch(branchId, userId, actor.userId)
      if (outcome === "BRANCH_NOT_FOUND") {
        throw new AppError(404, "BRANCH_NOT_FOUND", "No se encontró la sucursal indicada.")
      }
      if (outcome === "USER_NOT_FOUND") {
        throw new AppError(404, "USER_NOT_FOUND", "El usuario no existe o está desactivado.")
      }
      if (outcome === "ALREADY_ASSIGNED") {
        throw new AppError(409, "USER_ALREADY_ASSIGNED", "El usuario ya está asignado a esta sucursal.")
      }
      if (outcome !== "ASSIGNED") {
        throw new AppError(409, "BRANCH_USER_ASSIGNMENT_CONFLICT", "No se pudo asignar el usuario a la sucursal.")
      }
      return this.listUsers(branchId, actor)
    })
  }

  removeUser(branchId, userId, actor) {
    return traceOperation("branches.remove_user", async () => {
      await this.requireOrganizationOwner(actor)
      const outcome = await this.repository.removeUserFromBranch(branchId, userId, actor.userId)
      if (outcome === "BRANCH_NOT_FOUND") {
        throw new AppError(404, "BRANCH_NOT_FOUND", "No se encontró la sucursal indicada.")
      }
      if (outcome === "NOT_ASSIGNED") {
        throw new AppError(404, "BRANCH_USER_ASSIGNMENT_NOT_FOUND", "El usuario no está asignado a esta sucursal.")
      }
      if (outcome !== "REMOVED") {
        throw new AppError(409, "BRANCH_USER_ASSIGNMENT_CONFLICT", "No se pudo retirar la asignación del usuario.")
      }
      return this.listUsers(branchId, actor)
    })
  }

  create(input, actor) {
    return traceOperation("branches.create", async () => {
      await this.requireOrganizationOwner(actor)
      const result = await this.repository.createBranch(input, actor.userId)
      if (!result) {
        throw new AppError(409, "BRANCH_CODE_ALREADY_EXISTS", "Ya existe una sucursal con ese código o no se pudo completar el alta.")
      }
      if (result.outcome === "BRANCH_CODE_ALREADY_EXISTS") {
        throw new AppError(409, "BRANCH_CODE_ALREADY_EXISTS", "Ya existe una sucursal con ese código en la organización.")
      }
      if (result.outcome === "LEGAL_ENTITY_REQUIRED" || result.outcome === "DUPLICATE_LEGAL_ENTITY_IDS") {
        throw new AppError(400, "INVALID_BRANCH_LEGAL_ENTITIES", "Selecciona una o varias entidades legales distintas.")
      }
      if (result.outcome === "LEGAL_ENTITY_SCOPE_INVALID") {
        throw new AppError(422, "LEGAL_ENTITY_SCOPE_INVALID", "Una o varias entidades legales no pertenecen a esta organización.")
      }
      return toBranchDto(result)
    })
  }

  update(id, input, actor) {
    return traceOperation("branches.update", async () => {
      await this.requireOrganizationOwner(actor)
      const branch = await this.repository.updateBranch(id, input, actor.userId)
      if (!branch) {
        throw new AppError(409, "BRANCH_UPDATE_CONFLICT", "No se pudo actualizar la sucursal. Verifica su existencia y que el código no esté repetido.")
      }
      return toBranchDto(branch)
    })
  }

  assignLegalEntity(branchId, legalEntityId, actor) {
    return traceOperation("branches.assign_legal_entity", async () => {
      await this.requireOrganizationOwner(actor)
      const branch = await this.repository.assignLegalEntity(branchId, legalEntityId, actor.userId)
      if (!branch) {
        throw new AppError(409, "BRANCH_LEGAL_ENTITY_ASSIGNMENT_CONFLICT", "La sucursal y la entidad legal deben pertenecer a esta organización y la relación no debe existir previamente.")
      }
      return toBranchDto(branch)
    })
  }

  removeLegalEntity(branchId, legalEntityId, actor) {
    return traceOperation("branches.remove_legal_entity", async () => {
      await this.requireOrganizationOwner(actor)
      const outcome = await this.repository.removeLegalEntity(branchId, legalEntityId, actor.userId)
      if (outcome === "LAST_LEGAL_ENTITY") {
        throw new AppError(409, "BRANCH_REQUIRES_LEGAL_ENTITY", "Una sucursal debe conservar al menos una entidad legal asociada.")
      }
      if (outcome === "BRANCH_NOT_FOUND" || outcome === "ASSIGNMENT_NOT_FOUND") {
        throw new AppError(404, "BRANCH_LEGAL_ENTITY_NOT_FOUND", "No se encontró la sucursal o la relación indicada.")
      }
      if (outcome !== "REMOVED") {
        throw new AppError(409, "BRANCH_LEGAL_ENTITY_REMOVE_CONFLICT", "No se pudo retirar la entidad legal de la sucursal.")
      }
      const branch = await this.repository.findBranchById(branchId)
      return toBranchDto(branch)
    })
  }

  changeStatus(id, status, actor) {
    return traceOperation("branches.change_status", async () => {
      await this.requireOrganizationOwner(actor)
      const result = await this.repository.changeBranchStatus(id, status, actor.userId)
      if (result === "BRANCH_NOT_FOUND") {
        throw new AppError(404, "BRANCH_NOT_FOUND", "No se encontró la sucursal indicada.")
      }
      if (result === "BRANCH_CLOSED") {
        throw new AppError(409, "BRANCH_CLOSED_PERMANENTLY", "Una sucursal cerrada no puede reactivarse.")
      }
      if (result === "INVALID_STATUS") {
        throw new AppError(400, "INVALID_BRANCH_STATUS", "El estado solicitado no es válido.")
      }
      if (!result?.branch) {
        throw new AppError(409, "BRANCH_STATUS_CHANGE_CONFLICT", "No se pudo actualizar el estado de la sucursal.")
      }
      return toBranchDto(result.branch)
    })
  }

  listLifecycleEvents(id, actor) {
    return traceOperation("branches.list_lifecycle_events", async () => {
      await this.requireOrganizationOwner(actor)
      if (!await this.repository.findBranchById(id)) {
        throw new AppError(404, "BRANCH_NOT_FOUND", "No se encontró la sucursal indicada.")
      }
      return { events: await this.repository.listLifecycleEvents(id) }
    })
  }
}
