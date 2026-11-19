import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

export function mapProductOptionWriteError(error, message) {
  const cause = error?.cause ?? error
  if (cause?.code === "23505") return new AppError(409, "PRODUCT_OPTION_DUPLICATE", "Ya existe un grupo u opción con ese nombre.")
  if (cause?.code === "23514") {
    const detail = String(cause.message ?? "")
    if (detail.includes("BRANCH_OPTION_WOULD_VIOLATE_GROUP_MINIMUM")) {
      return new AppError(409, "BRANCH_OPTION_MINIMUM_REQUIRED", "La excepción dejaría el grupo sin suficientes opciones disponibles en esta sucursal.")
    }
    if (detail.includes("PRODUCT_OPTION_REQUIRED_BY_GROUP")) {
      return new AppError(409, "PRODUCT_OPTION_MINIMUM_REQUIRED", "No puedes desactivar esta opción porque el grupo la necesita.")
    }
    if (detail.includes("PRODUCT_OPTION_REQUIRED_BY_BRANCH_EXCEPTION") ||
        detail.includes("PRODUCT_OPTION_BRANCH_MINIMUM_REQUIRED")) {
      return new AppError(409, "PRODUCT_OPTION_BRANCH_MINIMUM_REQUIRED", "El cambio dejaría una sucursal por debajo del mínimo de opciones requerido.")
    }
    if (detail.includes("BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED")) {
      return new AppError(409, "BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED", "No se puede habilitar el producto: las opciones disponibles no cumplen los mínimos de sus grupos.")
    }
    if (detail.includes("PRODUCT_OPTION_GROUP_CARDINALITY_INVALID")) {
      return new AppError(422, "PRODUCT_OPTION_SELECTION_INVALID", "La selección no cumple la cantidad requerida por sus grupos.")
    }
    return new AppError(422, "PRODUCT_OPTION_INTEGRITY", "La operación incumple las reglas de integridad de variantes.")
  }
  if (cause?.code === "55000" && String(cause.message).includes("BRANCH_NOT_ACTIVE")) {
    return new AppError(409, "BRANCH_NOT_ACTIVE", "La sucursal está suspendida o cerrada; solo se permite consultar su configuración.")
  }
  if (cause?.code === "55000" && String(cause.message).includes("PRODUCT_NOT_ENABLED_FOR_BRANCH")) {
    return new AppError(409, "PRODUCT_NOT_ENABLED_FOR_BRANCH", "El producto no está habilitado para esta sucursal.")
  }
  return new AppError(500, "PERSISTENCE_ERROR", message)
}

export class ProductOptionsRepositorySupport {
  constructor(pool) {
    this.pool = pool
  }

  async assertOrganizationOwner(actor, executor = this.pool) {
    const { rows } = await queryPostgres(executor, `
      SELECT organization.id
      FROM public.organizations AS organization
      JOIN public.app_users AS owner
        ON owner.id = organization.owner_user_id AND owner.is_active = true
      WHERE organization.installation_slot = 1 AND organization.owner_user_id = $1
    `, [actor?.userId ?? null])
    if (!rows[0]) throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario corporativo puede administrar variantes y sus excepciones.")
    return rows[0].id
  }

  async inTransaction(operation) {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const result = await operation(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      if (error instanceof AppError) throw error
      throw mapProductOptionWriteError(error, "No se pudo guardar la configuración de variantes.")
    } finally {
      client.release()
    }
  }

  async insertGlobalEvent(client, organizationId, productId, resourceType, resourceId, eventType, snapshot, actorUserId) {
    await client.query(`
      INSERT INTO public.product_option_change_events
        (organization_id, product_id, resource_type, resource_id, event_type, snapshot, actor_user_id)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    `, [organizationId, productId, resourceType, resourceId, eventType, JSON.stringify(snapshot), actorUserId])
  }

  async insertBranchEvent(client, organizationId, branchId, option, previousState, newState, reason, actorUserId) {
    await client.query(`
      INSERT INTO public.branch_product_option_events
        (organization_id, branch_id, product_id, option_id, option_name, group_name,
         previous_state, new_state, reason, actor_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [organizationId, branchId, option.product_id, option.id, option.option_name,
      option.group_name, previousState, newState, reason, actorUserId])
  }
}
