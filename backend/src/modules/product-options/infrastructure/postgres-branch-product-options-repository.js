import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { ProductOptionsRepositorySupport } from "./product-options-repository-support.js"

export class PostgresBranchProductOptionsRepository extends ProductOptionsRepositorySupport {
  async listBranchOptions(branchId, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const branch = await queryPostgres(this.pool, `
      SELECT id, name, code, status FROM public.branches
      WHERE id = $1 AND organization_id = $2
    `, [branchId, organizationId])
    if (!branch.rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "La sucursal no pertenece a la organización.")
    const { rows } = await queryPostgres(this.pool, `
      SELECT option_group.product_id, product.name AS product_name,
             option_group.id AS group_id, option_group.name AS group_name,
             option_group.kind, option_group.min_selections, option_group.max_selections,
             option_group.is_active AS group_is_active,
             option.id AS option_id, option.name AS option_name, option.position,
             option.is_active AS option_is_active,
             override.is_enabled AS override_enabled, override.reason,
             override.changed_by_user_id, actor.email AS changed_by_email,
             override.updated_at,
             CASE WHEN override.option_id IS NULL THEN 'inherited'
                  WHEN override.is_enabled THEN 'enabled' ELSE 'disabled' END AS state,
             coalesce(override.is_enabled, true) AS effective_enabled,
             NOT EXISTS (
               SELECT 1 FROM public.branch_catalog_product_exclusions AS excluded
               WHERE excluded.organization_id = option_group.organization_id
                 AND excluded.branch_id = $1 AND excluded.product_id = option_group.product_id
             ) AS product_enabled
      FROM public.product_option_groups AS option_group
      JOIN public.products AS product ON product.id = option_group.product_id
      JOIN public.product_options AS option ON option.group_id = option_group.id
      LEFT JOIN public.branch_product_option_overrides AS override
        ON override.organization_id = option_group.organization_id
       AND override.branch_id = $1 AND override.option_id = option.id
      LEFT JOIN public.app_users AS actor ON actor.id = override.changed_by_user_id
      WHERE option_group.organization_id = $2
      ORDER BY product.name, option_group.position, option_group.name, option.position, option.name
      LIMIT 2000
    `, [branchId, organizationId])
    const events = await queryPostgres(this.pool, `
      SELECT event.sequence, event.product_id, event.option_id, event.option_name,
             event.group_name, event.previous_state, event.new_state, event.reason,
             event.actor_user_id, actor.email AS actor_email, event.occurred_at
      FROM public.branch_product_option_events AS event
      JOIN public.app_users AS actor ON actor.id = event.actor_user_id
      WHERE event.organization_id = $1 AND event.branch_id = $2
      ORDER BY event.sequence DESC LIMIT 100
    `, [organizationId, branchId])
    return { branch: branch.rows[0], options: rows, events: events.rows }
  }

  async setBranchOptionAvailability(branchId, optionId, input, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT public.set_branch_product_option_availability($1::uuid, $2::uuid, $3::boolean, $4::text, $5::uuid) AS outcome
    `, [branchId, optionId, input.enabled, input.reason, actor.userId])
    return this.mapBranchOutcome(rows[0]?.outcome, "La opción no existe, está inactiva o no pertenece a esta sucursal.")
  }

  async clearBranchOptionOverride(branchId, optionId, reason, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT public.clear_branch_product_option_override($1::uuid, $2::uuid, $3::text, $4::uuid) AS outcome
    `, [branchId, optionId, reason, actor.userId])
    return this.mapBranchOutcome(rows[0]?.outcome, "La opción no pertenece a esta sucursal.")
  }

  mapBranchOutcome(outcome, notFoundMessage) {
    const errors = {
      BRANCH_NOT_ACTIVE: [409, "BRANCH_NOT_ACTIVE", "Solo una sucursal activa admite cambios de disponibilidad."],
      PRODUCT_NOT_ENABLED_FOR_BRANCH: [409, "PRODUCT_NOT_ENABLED_FOR_BRANCH", "Habilita primero el producto en el surtido de la sucursal."],
      OPTION_NOT_ACTIVE: [404, "PRODUCT_OPTION_NOT_FOUND", notFoundMessage],
      OPTION_NOT_FOUND: [404, "PRODUCT_OPTION_NOT_FOUND", notFoundMessage],
    }
    if (errors[outcome]) throw new AppError(...errors[outcome])
    if (!["CHANGED", "UNCHANGED"].includes(outcome)) {
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo guardar la excepción de disponibilidad.")
    }
    return { success: true, changed: outcome === "CHANGED", state: outcome === "UNCHANGED" ? undefined : null }
  }

  async listForActiveBranch(productId, actor) {
    if (!actor?.activeBranchId) throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa para consultar opciones.")
    const branch = await queryPostgres(this.pool, `
      SELECT branch.id, branch.status
      FROM public.branches AS branch
      JOIN public.branch_user_assignments AS assignment
        ON assignment.organization_id = branch.organization_id
       AND assignment.branch_id = branch.id AND assignment.user_id = $2
      JOIN public.app_users AS actor ON actor.id = assignment.user_id AND actor.is_active = true
      WHERE branch.id = $1
    `, [actor.activeBranchId, actor.userId])
    if (!branch.rows[0]) throw new AppError(403, "BRANCH_ACCESS_REQUIRED", "No tienes asignación a la sucursal activa.")
    if (branch.rows[0].status !== "active") throw new AppError(409, "BRANCH_NOT_ACTIVE", "La sucursal está suspendida o cerrada.")
    const product = await queryPostgres(this.pool, `
      SELECT product.id FROM public.products AS product
      LEFT JOIN public.categories AS category ON category.id = product.category_id
      WHERE product.id = $1 AND product.is_active = true
        AND (product.category_id IS NULL OR category.is_active = true)
        AND NOT EXISTS (
          SELECT 1 FROM public.branch_catalog_product_exclusions AS excluded
          WHERE excluded.organization_id = (
            SELECT organization_id FROM public.branches WHERE id = $2
          )
            AND excluded.branch_id = $2 AND excluded.product_id = product.id
        )
    `, [productId, actor.activeBranchId])
    if (!product.rows[0]) throw new AppError(404, "PRODUCT_NOT_AVAILABLE", "El producto no está activo o no está habilitado para esta sucursal.")
    const { rows } = await queryPostgres(this.pool, `
      SELECT option_group.id, option_group.kind, option_group.name,
             option_group.min_selections, option_group.max_selections, option_group.position,
             coalesce(jsonb_agg(jsonb_build_object(
               'id', option.id, 'name', option.name, 'position', option.position
             ) ORDER BY option.position, option.name)
             FILTER (WHERE option.id IS NOT NULL), '[]'::jsonb) AS options
      FROM public.branches AS branch
      JOIN public.products AS product ON product.id = $1
      JOIN public.product_option_groups AS option_group
        ON option_group.organization_id = branch.organization_id
       AND option_group.product_id = product.id AND option_group.is_active = true
      LEFT JOIN public.product_options AS option
        ON option.group_id = option_group.id AND option.is_active = true
      LEFT JOIN public.branch_product_option_overrides AS override
        ON override.organization_id = branch.organization_id
       AND override.branch_id = branch.id AND override.option_id = option.id
      WHERE branch.id = $2 AND coalesce(override.is_enabled, true) = true
      GROUP BY option_group.id
      ORDER BY option_group.position, option_group.name, option_group.id
    `, [productId, actor.activeBranchId])
    return { product_id: productId, groups: rows }
  }
}
