import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { PostgresBranchProductOptionsRepository } from "./postgres-branch-product-options-repository.js"

const groupSelect = `
  SELECT option_group.id, option_group.product_id, option_group.kind,
         option_group.name, option_group.min_selections, option_group.max_selections,
         option_group.position, option_group.is_active,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', option.id, 'name', option.name, 'position', option.position,
           'is_active', option.is_active
         ) ORDER BY option.position, option.name)
         FILTER (WHERE option.id IS NOT NULL), '[]'::jsonb) AS options
  FROM public.product_option_groups AS option_group
`

export class PostgresProductOptionsRepository extends PostgresBranchProductOptionsRepository {
  async listProductOptions(productId, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const product = await queryPostgres(this.pool, "SELECT id, name FROM public.products WHERE id = $1", [productId])
    if (!product.rows[0]) throw new AppError(404, "PRODUCT_NOT_FOUND", "No se encontró el producto indicado.")
    const { rows } = await queryPostgres(this.pool, `
      ${groupSelect}
      WHERE option_group.organization_id = $1 AND option_group.product_id = $2
      GROUP BY option_group.id
      ORDER BY option_group.position, option_group.name, option_group.id
    `, [organizationId, productId])
    return { product_id: productId, product_name: product.rows[0].name, groups: rows }
  }

  async createGroup(productId, input, actor) {
    return this.inTransaction(async (client) => {
      const organizationId = await this.assertOrganizationOwner(actor, client)
      const product = await client.query(`
        SELECT product.id FROM public.products AS product
        LEFT JOIN public.categories AS category ON category.id = product.category_id
        WHERE product.id = $1 AND product.is_active = true
          AND coalesce(category.is_active, true) = true
        FOR UPDATE OF product
      `, [productId])
      if (!product.rows[0]) throw new AppError(409, "PRODUCT_NOT_ACTIVE", "Solo los productos activos pueden recibir variantes.")
      const { rows } = await client.query(`
        INSERT INTO public.product_option_groups
          (organization_id, product_id, kind, name, min_selections, max_selections,
           position, is_active, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8, $8)
        RETURNING id, product_id, kind, name, min_selections, max_selections,
                  position, is_active
      `, [organizationId, productId, input.kind, input.name, input.min_selections,
        input.max_selections, input.position, actor.userId])
      const group = rows[0]
      await this.insertGlobalEvent(client, organizationId, productId, "group", group.id, "created", group, actor.userId)
      return { ...group, options: [] }
    })
  }

  async updateGroup(groupId, input, actor) {
    return this.inTransaction(async (client) => {
      const organizationId = await this.assertOrganizationOwner(actor, client)
      const current = await client.query(`
        SELECT * FROM public.product_option_groups
        WHERE id = $1 AND organization_id = $2 FOR UPDATE
      `, [groupId, organizationId])
      if (!current.rows[0]) throw new AppError(404, "PRODUCT_OPTION_GROUP_NOT_FOUND", "El grupo de opciones no existe.")
      const activeOptions = await client.query(
        "SELECT count(*)::integer AS count FROM public.product_options WHERE group_id = $1 AND is_active = true",
        [groupId],
      )
      if (input.is_active && activeOptions.rows[0].count < input.min_selections) {
        throw new AppError(409, "PRODUCT_OPTION_MINIMUM_REQUIRED", "Agrega suficientes opciones activas antes de habilitar el grupo.")
      }
      const productId = current.rows[0].product_id
      if (input.is_active) {
        const shortage = await client.query(`
          SELECT branch.id
          FROM public.branches AS branch
          LEFT JOIN public.product_options AS option
            ON option.group_id = $1 AND option.is_active = true
          LEFT JOIN public.branch_product_option_overrides AS override
            ON override.organization_id = branch.organization_id
           AND override.branch_id = branch.id AND override.option_id = option.id
          WHERE branch.organization_id = $2 AND branch.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM public.branch_catalog_product_exclusions AS excluded
              WHERE excluded.organization_id = branch.organization_id
                AND excluded.branch_id = branch.id AND excluded.product_id = $3
            )
            AND coalesce(override.is_enabled, true) = true
          GROUP BY branch.id
          HAVING count(option.id) < $4
          LIMIT 1
        `, [groupId, organizationId, productId, input.min_selections])
        if (shortage.rows[0]) {
          throw new AppError(409, "PRODUCT_OPTION_BRANCH_MINIMUM_REQUIRED", "El grupo dejaría una sucursal sin suficientes opciones disponibles.")
        }
      }
      const updated = await client.query(`
        UPDATE public.product_option_groups
        SET kind = $3, name = $4, min_selections = $5, max_selections = $6,
            position = $7, is_active = $8, updated_by_user_id = $9, updated_at = now()
        WHERE id = $1 AND organization_id = $2
        RETURNING id, product_id, kind, name, min_selections, max_selections,
                  position, is_active
      `, [groupId, organizationId, input.kind, input.name, input.min_selections,
        input.max_selections, input.position, input.is_active, actor.userId])
      const group = updated.rows[0]
      const oldActive = current.rows[0].is_active
      const eventType = !oldActive && group.is_active ? "activated"
        : oldActive && !group.is_active ? "deactivated" : "updated"
      await this.insertGlobalEvent(client, organizationId, productId, "group", group.id,
        eventType, group, actor.userId)
      return { ...group, options: [] }
    })
  }

  async createOption(groupId, input, actor) {
    return this.inTransaction(async (client) => {
      const organizationId = await this.assertOrganizationOwner(actor, client)
      const group = await client.query(`
        SELECT id, product_id FROM public.product_option_groups
        WHERE id = $1 AND organization_id = $2 FOR UPDATE
      `, [groupId, organizationId])
      if (!group.rows[0]) throw new AppError(404, "PRODUCT_OPTION_GROUP_NOT_FOUND", "El grupo de opciones no existe.")
      const { rows } = await client.query(`
        INSERT INTO public.product_options
          (group_id, name, position, is_active, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $5)
        RETURNING id, group_id, name, position, is_active
      `, [groupId, input.name, input.position, input.is_active, actor.userId])
      const option = rows[0]
      if (option.is_active) {
        const count = await client.query(
          "SELECT count(*)::integer AS count FROM public.product_options WHERE group_id = $1 AND is_active = true",
          [groupId],
        )
        const groupState = await client.query(
          "SELECT is_active, min_selections, product_id, kind, name, max_selections, position FROM public.product_option_groups WHERE id = $1",
          [groupId],
        )
        if (!groupState.rows[0].is_active && count.rows[0].count >= groupState.rows[0].min_selections) {
          const activated = await client.query(`
            UPDATE public.product_option_groups
            SET is_active = true, updated_by_user_id = $2, updated_at = now()
            WHERE id = $1
            RETURNING id, product_id, kind, name, min_selections, max_selections, position, is_active
          `, [groupId, actor.userId])
          await this.insertGlobalEvent(client, organizationId, groupState.rows[0].product_id,
            "group", groupId, "activated", activated.rows[0], actor.userId)
        }
      }
      await this.insertGlobalEvent(client, organizationId, group.rows[0].product_id,
        "option", option.id, "created", option, actor.userId)
      return option
    })
  }

  async updateOption(optionId, input, actor) {
    return this.inTransaction(async (client) => {
      const organizationId = await this.assertOrganizationOwner(actor, client)
      const current = await client.query(`
        SELECT option.id, option.group_id, option.name, option.position, option.is_active,
               option_group.product_id, option_group.is_active AS group_is_active,
               option_group.min_selections, option_group.kind
        FROM public.product_options AS option
        JOIN public.product_option_groups AS option_group ON option_group.id = option.group_id
        WHERE option.id = $1 AND option_group.organization_id = $2
        FOR UPDATE OF option, option_group
      `, [optionId, organizationId])
      if (!current.rows[0]) throw new AppError(404, "PRODUCT_OPTION_NOT_FOUND", "La opción no existe.")
      const updated = await client.query(`
        UPDATE public.product_options
        SET name = $2, position = $3, is_active = $4,
            updated_by_user_id = $5, updated_at = now()
        WHERE id = $1
        RETURNING id, group_id, name, position, is_active
      `, [optionId, input.name, input.position, input.is_active, actor.userId])
      const option = updated.rows[0]
      const group = current.rows[0]
      if (!group.group_is_active && option.is_active) {
        const count = await client.query(
          "SELECT count(*)::integer AS count FROM public.product_options WHERE group_id = $1 AND is_active = true",
          [group.group_id],
        )
        if (count.rows[0].count >= group.min_selections) {
          const activated = await client.query(`
            UPDATE public.product_option_groups
            SET is_active = true, updated_by_user_id = $2, updated_at = now()
            WHERE id = $1
            RETURNING id, product_id, kind, name, min_selections, max_selections, position, is_active
          `, [group.group_id, actor.userId])
          await this.insertGlobalEvent(client, organizationId, group.product_id, "group",
            group.group_id, "activated", activated.rows[0], actor.userId)
        }
      }
      const eventType = !group.is_active && option.is_active ? "activated"
        : group.is_active && !option.is_active ? "deactivated" : "updated"
      await this.insertGlobalEvent(client, organizationId, group.product_id, "option",
        option.id, eventType, option, actor.userId)
      return option
    })
  }
}
