import { AppError } from "../../../shared/domain/app-error.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"
import { toLegalEntityDto } from "../domain/legal-entity.js"

export class LegalEntityUseCases {
  constructor(repository) {
    this.repository = repository
  }

  async requireOrganizationOwner(actor) {
    if (!actor?.userId) {
      throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    }
    const ownerUserId = await this.repository.findOrganizationOwnerId()
    if (!ownerUserId) {
      throw new AppError(404, "ORGANIZATION_NOT_INITIALIZED", "La organización todavía no está configurada.")
    }
    if (ownerUserId !== actor.userId) {
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario registrado puede administrar entidades legales.")
    }
  }

  list(actor) {
    return traceOperation("legal_entities.list", async () => {
      if (!actor?.userId) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
      }
      const ownerUserId = await this.repository.findOrganizationOwnerId()
      if (!ownerUserId) {
        throw new AppError(404, "ORGANIZATION_NOT_INITIALIZED", "La organización todavía no está configurada.")
      }
      return {
        legal_entities: (await this.repository.listLegalEntities()).map(toLegalEntityDto),
        permissions: { can_manage: ownerUserId === actor.userId },
      }
    })
  }

  create(input, actor) {
    return traceOperation("legal_entities.create", async () => {
      await this.requireOrganizationOwner(actor)
      const entity = await this.repository.createLegalEntity(input, actor.userId)
      if (!entity) {
        throw new AppError(409, "LEGAL_ENTITY_TAX_ID_ALREADY_EXISTS", "Ya existe una entidad legal con ese identificador tributario en la organización.")
      }
      return toLegalEntityDto(entity)
    })
  }

  update(id, input, actor) {
    return traceOperation("legal_entities.update", async () => {
      await this.requireOrganizationOwner(actor)
      const entity = await this.repository.updateLegalEntity(id, input, actor.userId)
      if (!entity) {
        throw new AppError(409, "LEGAL_ENTITY_UPDATE_CONFLICT", "No se pudo actualizar la entidad legal. Verifica que exista y que su identificador tributario no esté repetido.")
      }
      return toLegalEntityDto(entity)
    })
  }
}
