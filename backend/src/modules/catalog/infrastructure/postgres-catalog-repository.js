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
    const { rows } = await queryPostgres(this.pool, `
      SELECT organization.id
      FROM public.organizations AS organization
      JOIN public.app_users AS owner
        ON owner.id = organization.owner_user_id AND owner.is_active = true
      WHERE organization.installation_slot = 1 AND organization.owner_user_id = $1
    `, [actor?.userId ?? null])
    if (!rows[0]) {
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario corporativo puede administrar el catálogo maestro.")
    }
    return rows[0].id
  }

  async assertBranchAccess(actor) {
    requireBranch(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT branch.id
      FROM public.branches AS branch
      JOIN public.branch_user_assignments AS assignment
        ON assignment.organization_id = branch.organization_id
       AND assignment.branch_id = branch.id
      JOIN public.app_users AS actor
        ON actor.id = assignment.user_id AND actor.is_active = true
      WHERE branch.id = $1 AND assignment.user_id = $2
    `, [actor.activeBranchId, actor.userId])
    if (!rows[0]) throw new AppError(404, "BRANCH_NOT_FOUND", "La sucursal activa no está asignada al usuario.")
  }

  async listCategories(actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT category.id, category.name, category.icon,
             count(product.id)::integer AS item_count
      FROM public.categories AS category
      LEFT JOIN public.products AS product
        ON product.category_id = category.id AND product.is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
         WHERE exclusion.branch_id = $1 AND exclusion.product_id = product.id
       )
      WHERE category.is_active = true
      GROUP BY category.id, category.name, category.icon
      ORDER BY category.name
      LIMIT 100
    `, [actor.activeBranchId])
    return rows
  }

  async listProducts(categoryId, actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT p.id, p.name, p.description, p.price, p.image_url,
             p.discount_percentage, p.type, p.category_id,
             CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon) END AS categories
      FROM public.products AS p
      LEFT JOIN public.categories AS c ON c.id = p.category_id
      WHERE p.is_active = true AND (p.category_id IS NULL OR c.is_active = true)
        AND ($1::uuid IS NULL OR p.category_id = $1::uuid)
        AND NOT EXISTS (
          SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
          WHERE exclusion.branch_id = $2 AND exclusion.product_id = p.id
        )
      ORDER BY p.name, p.id
      LIMIT 200
    `, [categoryId ?? null, actor.activeBranchId])
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  async findProduct(id, actor) {
    await this.assertBranchAccess(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT p.id, p.name, p.description, p.price, p.image_url,
             p.discount_percentage, p.type, p.category_id,
             jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon) AS categories
      FROM public.products AS p
      LEFT JOIN public.categories AS c ON c.id = p.category_id
      WHERE p.id = $1 AND p.is_active = true AND (p.category_id IS NULL OR c.is_active = true)
        AND NOT EXISTS (
          SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
          WHERE exclusion.branch_id = $2 AND exclusion.product_id = p.id
        )
    `, [id, actor.activeBranchId])
    return rows[0] ? { ...rows[0], price: Number(rows[0].price) } : null
  }

  async listCorporateProducts(actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT p.id, p.name, p.description, p.price, p.image_url,
             p.discount_percentage, p.type, p.category_id, p.is_active,
             CASE WHEN c.id IS NULL THEN NULL
               ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
             END AS categories
      FROM public.products AS p
      LEFT JOIN public.categories AS c ON c.id = p.category_id
      ORDER BY p.is_active DESC, p.name, p.id
      LIMIT 1000
    `)
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  async listCorporateCategories(actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT category.id, category.name, category.icon, category.is_active,
             (
               SELECT count(*)::integer
               FROM public.products AS product
               WHERE product.category_id = category.id AND product.is_active = true
             ) AS item_count
      FROM public.categories AS category
      ORDER BY category.is_active DESC, category.name, category.id
      LIMIT 500
    `)
    return rows
  }

  async listBranchProducts(branchId, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT catalog.*
      FROM public.list_branch_catalog_products($1::uuid, $2::uuid) AS catalog
      JOIN public.products AS product ON product.id = catalog.id AND product.is_active = true
      LEFT JOIN public.categories AS category ON category.id = product.category_id
      WHERE product.is_active = true AND (product.category_id IS NULL OR category.is_active = true)
    `, [branchId, actor.userId])
    return rows.map(mapProduct)
  }

  async setBranchProductEnabled(branchId, productId, enabled, actor) {
    await this.assertOrganizationOwner(actor)
    const activeProduct = await queryPostgres(this.pool, `
      SELECT product.id
      FROM public.products AS product
      LEFT JOIN public.categories AS category ON category.id = product.category_id
      WHERE product.id = $1 AND product.is_active = true
        AND (product.category_id IS NULL OR category.is_active = true)
    `, [productId])
    if (!activeProduct.rows[0]) {
      throw new AppError(409, "PRODUCT_NOT_ACTIVE", "No se puede cambiar el surtido de un producto inactivo.")
    }
    const { rows } = await queryPostgres(this.pool,
      "SELECT public.set_branch_catalog_product_enabled($1::uuid, $2::uuid, $3::boolean, $4::uuid) AS outcome",
      [branchId, productId, enabled, actor.userId])
    const outcome = rows[0]?.outcome
    const errors = {
      BRANCH_NOT_FOUND: [404, "BRANCH_NOT_FOUND", "La sucursal no pertenece a la organización."],
      BRANCH_NOT_ACTIVE: [409, "BRANCH_NOT_ACTIVE", "No se puede cambiar el catálogo de una sucursal suspendida o cerrada."],
      PRODUCT_NOT_FOUND: [404, "PRODUCT_NOT_FOUND", "El producto no existe en el catálogo corporativo."],
      INVALID_ENABLED_STATE: [400, "INVALID_ENABLED_STATE", "El estado de disponibilidad no es válido."],
    }
    if (errors[outcome]) throw new AppError(...errors[outcome])
    if (!["CHANGED", "UNCHANGED"].includes(outcome)) {
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo actualizar el catálogo de la sucursal.")
    }
    return { success: true, changed: outcome === "CHANGED" }
  }

  async createCategory(category, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      INSERT INTO public.categories (name, icon) VALUES ($1, $2)
      RETURNING id, name, icon, is_active, 0::integer AS item_count
    `, [category.name, category.icon ?? null])
    return rows[0]
  }

  async updateCategory(id, category, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      UPDATE public.categories SET name = $2, icon = $3, updated_at = now()
      WHERE id = $1 AND is_active = true
      RETURNING id, name, icon, is_active
    `, [id, category.name, category.icon ?? null])
    if (!rows[0]) throw new AppError(404, "CATEGORY_NOT_FOUND", "La categoría no existe o está dada de baja.")
    return rows[0]
  }

  async deactivateCategory(id, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      UPDATE public.categories AS category
      SET is_active = false, updated_at = now()
      WHERE category.id = $1 AND category.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM public.products AS product
          WHERE product.category_id = category.id AND product.is_active = true
        )
      RETURNING category.id
    `, [id])
    if (!rows[0]) {
      const exists = await queryPostgres(this.pool,
        "SELECT id FROM public.categories WHERE id = $1 AND is_active = true", [id])
      if (!exists.rows[0]) throw new AppError(404, "CATEGORY_NOT_FOUND", "La categoría no existe o ya está dada de baja.")
      throw new AppError(409, "CATEGORY_HAS_ACTIVE_PRODUCTS", "No se puede dar de baja una categoría que contiene productos activos.")
    }
    return { success: true, deactivated: true }
  }

  async createProduct(product, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      INSERT INTO public.products
        (name, description, price, image_url, discount_percentage, type, category_id)
      SELECT $1, $2, $3, $4, $5, $6, category.id
      FROM public.categories AS category
      WHERE category.id = $7 AND category.is_active = true
      RETURNING id, name, description, price, image_url, discount_percentage,
                type, category_id, is_active
    `, [product.name, product.description ?? null, product.price, product.image_url ?? null,
      product.discount_percentage, product.type, product.category_id])
    if (!rows[0]) throw new AppError(422, "CATEGORY_NOT_AVAILABLE", "Selecciona una categoría activa.")
    return { ...rows[0], price: Number(rows[0].price) }
  }

  async updateProduct(id, product, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      UPDATE public.products AS target
      SET name = $2, description = $3, price = $4, image_url = $5,
          discount_percentage = $6, type = $7, category_id = category.id,
          updated_at = now()
      FROM public.categories AS category
      WHERE target.id = $1 AND target.is_active = true
        AND category.id = $8 AND category.is_active = true
      RETURNING target.id, target.name, target.description, target.price,
        target.image_url, target.discount_percentage, target.type,
        target.category_id, target.is_active
    `, [id, product.name, product.description ?? null, product.price,
      product.image_url ?? null, product.discount_percentage, product.type, product.category_id])
    if (!rows[0]) throw new AppError(404, "PRODUCT_OR_CATEGORY_NOT_FOUND", "El producto no existe o la categoría seleccionada no está activa.")
    return { ...rows[0], price: Number(rows[0].price) }
  }

  async deactivateProduct(id, actor) {
    await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      UPDATE public.products SET is_active = false, updated_at = now()
      WHERE id = $1 AND is_active = true
      RETURNING id
    `, [id])
    if (!rows[0]) throw new AppError(404, "PRODUCT_NOT_FOUND", "El producto no existe o ya está dado de baja.")
    return { success: true, deactivated: true }
  }
}
