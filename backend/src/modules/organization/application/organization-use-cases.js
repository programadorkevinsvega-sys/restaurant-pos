import { AppError } from "../../../shared/domain/app-error.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"
import { toPublicOrganizationProfile } from "../domain/organization-profile.js"

export class OrganizationUseCases {
  constructor(repository) {
    this.repository = repository
  }

  getProfile(actor) {
    return traceOperation("organization.get_profile", async () => {
      const profile = await this.repository.findProfile()
      if (!profile) {
        throw new AppError(
          404,
          "ORGANIZATION_NOT_INITIALIZED",
          "La organización todavía no está configurada.",
        )
      }
      return {
        organization: toPublicOrganizationProfile(profile),
        permissions: { can_update: actor?.userId === profile.ownerUserId },
      }
    })
  }

  bootstrapProfile(input, actor) {
    return traceOperation("organization.bootstrap_profile", async () => {
      if (!actor || actor.role !== "admin") {
        throw new AppError(
          403,
          "ORGANIZATION_BOOTSTRAP_FORBIDDEN",
          "Solo un administrador activo puede configurar la organización por primera vez.",
        )
      }

      const profile = await this.repository.createProfile(input, actor.userId)
      if (!profile) {
        throw new AppError(
          409,
          "ORGANIZATION_ALREADY_INITIALIZED",
          "La organización ya fue configurada en esta instalación.",
        )
      }
      return {
        organization: toPublicOrganizationProfile(profile),
        permissions: { can_update: true },
      }
    })
  }

  updateProfile(input, actor) {
    return traceOperation("organization.update_profile", async () => {
      if (!actor?.userId) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
      }
      if (Object.keys(input).length === 0) {
        throw new AppError(400, "EMPTY_UPDATE", "Debes proporcionar al menos un campo para actualizar.")
      }

      const current = await this.repository.findProfile()
      if (!current) {
        throw new AppError(
          404,
          "ORGANIZATION_NOT_INITIALIZED",
          "La organización todavía no está configurada.",
        )
      }
      if (current.ownerUserId !== actor.userId) {
        throw new AppError(
          403,
          "ORGANIZATION_OWNER_REQUIRED",
          "Solo el propietario registrado puede modificar los datos corporativos.",
        )
      }

      const updated = await this.repository.updateProfile(input, actor.userId)
      if (!updated) {
        throw new AppError(
          409,
          "ORGANIZATION_UPDATE_CONFLICT",
          "No fue posible actualizar el perfil. Vuelve a consultar su estado.",
        )
      }
      return {
        organization: toPublicOrganizationProfile(updated),
        permissions: { can_update: true },
      }
    })
  }
}
