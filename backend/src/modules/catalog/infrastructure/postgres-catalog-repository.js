import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { CatalogRepository } from "../domain/catalog-repository.js"

function requireBranch(actor) {
  if (!actor?.activeBranchId) {
    throw new AppError(409, "ACTIVE_BRANCH_REQUIRED", "Selecciona una sucursal activa para consultar el catálogo.")
  }
}

function mapProduct(row) {
  return {
    ...row,
    price: Number(row.price),
    categories: row.category_name === undefined
      ? row.categories
      : row.category_id
        ? { id: row.category_id, name: row.category_name, icon: row.category_icon }
        : null,
  }
}

export class PostgresCatalogRepository extends CatalogRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async assertOrganizationOwner(actor) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT o.id
       FROM public.organizations AS o
       JOIN public.app_users AS owner
         ON owner.id = o.owner_user_id AND owner.is_active = true
       WHERE o.installation_slot = 1 AND o.owner_user_id = $1`,
      [actor?.userId ?? null],
    )
    if (!rows[0]) {
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario corporativo puede administrar el catálogo maestro.")
    }
    return rows[0].id
  }

  async assertBranchAccess(actor) {
    requireBranch(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT branch.id
       FROM public.branches AS branch
       JOIN public.branch_user_assignments AS assignment
         ON assignment.organization_id = branch.organization_id
        AND assignment.branch_id = branch.id
       JOIN public.app_users AS actor
         ON actor.id = assignment.user_id AND actor.is_active = true
       WHERE branch.id = $1 AND assignment.user_id = $2`,
      [actor.activeBranchId, actor.userId],
    )
    if (!rows[0]) {
      throw new AppError(404, "BRANCH_NOT_FOUND", "La sucursal activa no está asignada al usuario.")
    }
  }

  async listCategories(actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT category.id, category.name, category.icon,
              count(product.id)::integer AS item_count
       FROM public.categories AS category
       LEFT JOIN public.products AS product
         ON product.category_id = category.id
        AND NOT EXISTS (
          SELECT 1
          FROM public.branch_catalog_product_exclusions AS exclusion
          WHERE exclusion.branch_id = $1
            AND exclusion.product_id = product.id
        )
       GROUP BY category.id, category.name, category.icon
       ORDER BY category.name
       LIMIT 100`,
      [actor.activeBranchId],
    )
    return rows
  }

  async listProducts(categoryId, actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT p.id, p.name, p.description, p.price, p.image_url,
              p.discount_percentage, p.type, p.category_id,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
              END AS categories
       FROM public.products AS p
       LEFT JOIN public.categories AS c ON c.id = p.category_id
       WHERE ($1::uuid IS NULL OR p.category_id = $1::uuid)
         AND NOT EXISTS (
           SELECT 1
           FROM public.branch_catalog_product_exclusions AS exclusion
           WHERE exclusion.branch_id = $2
             AND exclusion.product_id = p.id
         )
       ORDER BY p.name, p.id
       LIMIT 200`,
      [categoryId ?? null, actor.activeBranchId],
    )
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  async findProduct(id, actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT p.id, p.name, p.description, p.price, p.image_url,
              p.discount_percentage, p.type, p.category_id,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
              END AS categories
       FROM public.products AS p
       LEFT JOIN public.categories AS c ON c.id = p.category_id
       WHERE p.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
           WHERE exclusion.branch_id = $2 AND exclusion.product_id = p.id
         )`,
      [id, actor.activeBranchId],
    )
    const product = rows[0]
    return product ? { ...product, price: Number(product.price) } : null
  }

  async listCorporateProducts(actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT p.id, p.name, p.description, p.price, p.image_url,
              p.discount_percentage, p.type, p.category_id,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
              END AS categories
       FROM public.products AS p
       LEFT JOIN public.categories AS c ON c.id = p.category_id
       ORDER BY p.name, p.id
       LIMIT 500`,
    )
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  async listBranchProducts(branchId, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(
      this.pool,
      "SELECT * FROM public.list_branch_catalog_products($1::uuid, $2::uuid)",
      [branchId, actor.userId],
    )
    return rows.map(mapProduct)
  }

  async setBranchProductEnabled(branchId, productId, enabled, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(
      this.pool,
      "SELECT public.set_branch_catalog_product_enabled($1::uuid, $2::uuid, $3::boolean, $4::uuid) AS outcome",
      [branchId, productId, enabled, actor.userId],
    )
    const outcome = rows[0]?.outcome
    if (outcome === "BRANCH_NOT_FOUND") {
      throw new AppError(404, "BRANCH_NOT_FOUND", "La sucursal no pertenece a la organización.")
    }
    if (outcome === "BRANCH_NOT_ACTIVE") {
      throw new AppError(409, "BRANCH_NOT_ACTIVE", "No se puede cambiar el catálogo de una sucursal suspendida o cerrada.")
    }
    if (outcome === "PRODUCT_NOT_FOUND") {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "El producto no existe en el catálogo corporativo.")
    }
    if (outcome === "INVALID_ENABLED_STATE") {
      throw new AppError(400, "INVALID_ENABLED_STATE", "El estado de disponibilidad no es válido.")
    }
    if (!["CHANGED", "UNCHANGED"].includes(outcome)) {
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo actualizar el catálogo de la sucursal.")
    }
    return { success: true, changed: outcome === "CHANGED" }
  }

  async createCategory(category, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.categories (name, icon)
       VALUES ($1, $2)
       RETURNING id, name, icon, item_count`,
      [category.name, category.icon ?? null],
    )
    return rows[0]
  }

  async createProduct(product, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.products
         (name, description, price, image_url, discount_percentage, type, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, price, image_url,
                 discount_percentage, type, category_id`,
      [
        product.name,
        product.description ?? null,
        product.price,
        product.image_url ?? null,
        product.discount_percentage,
        product.type,
        product.category_id,
      ],
    )
    return { ...rows[0], price: Number(rows[0].price) }
  }
}
