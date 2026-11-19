import { AppError } from "../../../shared/domain/app-error.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

function mapIngredient(row) {
  return { ...row, is_active: Boolean(row.is_active) }
}

function mapDatabaseConflict(error, fallbackMessage) {
  const cause = error?.cause ?? error
  if (cause?.code === "23505") {
    return new AppError(409, "INGREDIENT_NAME_EXISTS", "Ya existe un ingrediente con ese nombre en el catálogo corporativo.")
  }
  if (cause?.code === "23514") {
    return new AppError(409, "INGREDIENT_IN_USE", "El ingrediente está siendo utilizado por una receta y no admite este cambio.")
  }
  return new AppError(500, "PERSISTENCE_ERROR", fallbackMessage)
}

export class PostgresRecipesRepository {
  constructor(pool) {
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
      throw new AppError(403, "ORGANIZATION_OWNER_REQUIRED", "Solo el propietario corporativo puede administrar recetas e ingredientes.")
    }
    return rows[0].id
  }

  async listIngredients(actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT id, name, description, unit_code, is_active, created_at, updated_at
      FROM public.ingredients
      WHERE organization_id = $1
      ORDER BY is_active DESC, name, id
      LIMIT 1000
    `, [organizationId])
    return rows.map(mapIngredient)
  }

  async createIngredient(input, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    try {
      const { rows } = await queryPostgres(this.pool, `
        INSERT INTO public.ingredients
          (organization_id, name, description, unit_code, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $5, $5)
        RETURNING id, name, description, unit_code, is_active, created_at, updated_at
      `, [organizationId, input.name, input.description ?? null, input.unit_code, actor.userId])
      return mapIngredient(rows[0])
    } catch (error) {
      const mapped = mapDatabaseConflict(error, "No se pudo crear el ingrediente.")
      if (mapped.code !== "PERSISTENCE_ERROR") throw mapped
      throw error
    }
  }

  async updateIngredient(id, input, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const current = await client.query(`
        SELECT id, unit_code
        FROM public.ingredients
        WHERE id = $1 AND organization_id = $2 AND is_active = true
        FOR UPDATE
      `, [id, organizationId])
      if (!current.rows[0]) {
        throw new AppError(404, "INGREDIENT_NOT_FOUND", "El ingrediente no existe o está inactivo.")
      }

      if (current.rows[0].unit_code !== input.unit_code) {
        const used = await client.query(
          "SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id = $1 LIMIT 1",
          [id],
        )
        if (used.rows[0]) {
          throw new AppError(409, "INGREDIENT_UNIT_IN_USE", "No se puede cambiar la unidad de un ingrediente que ya forma parte de una receta.")
        }
      }

      const duplicate = await client.query(`
        SELECT id FROM public.ingredients
        WHERE organization_id = $1 AND lower(name) = lower($2) AND id <> $3
      `, [organizationId, input.name, id])
      if (duplicate.rows[0]) {
        throw new AppError(409, "INGREDIENT_NAME_EXISTS", "Ya existe un ingrediente con ese nombre en el catálogo corporativo.")
      }

      const { rows } = await client.query(`
        UPDATE public.ingredients
        SET name = $3, description = $4, unit_code = $5,
            updated_by_user_id = $6, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND is_active = true
        RETURNING id, name, description, unit_code, is_active, created_at, updated_at
      `, [id, organizationId, input.name, input.description ?? null, input.unit_code, actor.userId])
      await client.query("COMMIT")
      return mapIngredient(rows[0])
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      if (error instanceof AppError) throw error
      throw mapDatabaseConflict(error, "No se pudo actualizar el ingrediente.")
    } finally {
      client.release()
    }
  }

  async deactivateIngredient(id, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      const ingredient = await client.query(`
        SELECT id FROM public.ingredients
        WHERE id = $1 AND organization_id = $2 AND is_active = true
        FOR UPDATE
      `, [id, organizationId])
      if (!ingredient.rows[0]) {
        throw new AppError(404, "INGREDIENT_NOT_FOUND", "El ingrediente no existe o ya está inactivo.")
      }
      const used = await client.query(
        "SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id = $1 LIMIT 1",
        [id],
      )
      if (used.rows[0]) {
        throw new AppError(409, "INGREDIENT_IN_USE", "No se puede dar de baja un ingrediente que forma parte de una receta.")
      }
      await client.query(`
        UPDATE public.ingredients
        SET is_active = false, updated_by_user_id = $3, updated_at = now()
        WHERE id = $1 AND organization_id = $2 AND is_active = true
      `, [id, organizationId, actor.userId])
      await client.query("COMMIT")
      return { success: true, deactivated: true }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      if (error instanceof AppError) throw error
      throw mapDatabaseConflict(error, "No se pudo dar de baja el ingrediente.")
    } finally {
      client.release()
    }
  }

  async getRecipe(productId, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const { rows } = await queryPostgres(this.pool, `
      SELECT recipe.id, recipe.product_id, recipe.preparation_instructions,
             recipe.created_at, recipe.updated_at,
             coalesce(jsonb_agg(jsonb_build_object(
               'ingredient_id', ingredient.id,
               'name', ingredient.name,
               'unit_code', ingredient.unit_code,
               'quantity', line.quantity::text,
               'position', line.position,
               'is_active', ingredient.is_active
             ) ORDER BY line.position, ingredient.name)
             FILTER (WHERE line.ingredient_id IS NOT NULL), '[]'::jsonb) AS ingredients
      FROM public.product_recipes AS recipe
      LEFT JOIN public.recipe_ingredients AS line ON line.recipe_id = recipe.id
      LEFT JOIN public.ingredients AS ingredient ON ingredient.id = line.ingredient_id
      WHERE recipe.organization_id = $1 AND recipe.product_id = $2
      GROUP BY recipe.id
    `, [organizationId, productId])
    return rows[0] ?? null
  }

  async saveRecipe(productId, input, actor) {
    const organizationId = await this.assertOrganizationOwner(actor)
    const client = await this.pool.connect()
    let recipeId
    let eventType
    try {
      await client.query("BEGIN")
      const product = await client.query(`
        SELECT product.id
        FROM public.products AS product
        LEFT JOIN public.categories AS category ON category.id = product.category_id
        WHERE product.id = $1 AND product.is_active = true
          AND coalesce(category.is_active, true) = true
        FOR UPDATE OF product
      `, [productId])
      if (!product.rows[0]) {
        throw new AppError(409, "PRODUCT_NOT_ACTIVE", "Solo los productos activos del catálogo pueden tener una receta editable.")
      }

      const ingredientIds = input.ingredients.map((line) => line.ingredient_id)
      const available = await client.query(`
        SELECT id FROM public.ingredients
        WHERE organization_id = $1 AND is_active = true AND id = ANY($2::uuid[])
        FOR SHARE
      `, [organizationId, ingredientIds])
      if (available.rowCount !== ingredientIds.length) {
        throw new AppError(422, "RECIPE_INGREDIENT_INVALID", "La receta contiene ingredientes inexistentes, inactivos o fuera del catálogo corporativo.")
      }

      const existing = await client.query(
        "SELECT id FROM public.product_recipes WHERE organization_id = $1 AND product_id = $2 FOR UPDATE",
        [organizationId, productId],
      )
      eventType = existing.rows[0] ? "updated" : "created"
      const saved = await client.query(`
        INSERT INTO public.product_recipes
          (organization_id, product_id, preparation_instructions, created_by_user_id, updated_by_user_id)
        VALUES ($1, $2, $3, $4, $4)
        ON CONFLICT (product_id) DO UPDATE
          SET preparation_instructions = EXCLUDED.preparation_instructions,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              updated_at = now()
        RETURNING id
      `, [organizationId, productId, input.preparation_instructions, actor.userId])
      recipeId = saved.rows[0].id

      await client.query("DELETE FROM public.recipe_ingredients WHERE recipe_id = $1", [recipeId])
      for (let position = 0; position < input.ingredients.length; position += 1) {
        const line = input.ingredients[position]
        await client.query(`
          INSERT INTO public.recipe_ingredients (recipe_id, ingredient_id, quantity, position)
          VALUES ($1, $2, $3::numeric(18, 6), $4)
        `, [recipeId, line.ingredient_id, line.quantity, position])
      }

      const snapshot = await client.query(`
        SELECT jsonb_build_object(
          'product_id', $2::uuid,
          'preparation_instructions', $3::text,
          'ingredients', coalesce(jsonb_agg(jsonb_build_object(
            'ingredient_id', ingredient.id,
            'name', ingredient.name,
            'unit_code', ingredient.unit_code,
            'quantity', line.quantity::text,
            'position', line.position
          ) ORDER BY line.position), '[]'::jsonb)
        ) AS state
        FROM public.recipe_ingredients AS line
        JOIN public.ingredients AS ingredient ON ingredient.id = line.ingredient_id
        WHERE line.recipe_id = $1
      `, [recipeId, productId, input.preparation_instructions])
      await client.query(`
        INSERT INTO public.recipe_change_events
          (organization_id, recipe_id, event_type, snapshot, actor_user_id)
        VALUES ($1, $2, $3, $4::jsonb, $5)
      `, [organizationId, recipeId, eventType, JSON.stringify(snapshot.rows[0].state), actor.userId])
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      if (error instanceof AppError) throw error
      const cause = error?.cause ?? error
      if (cause?.code === "23505") {
        throw new AppError(409, "RECIPE_CONFLICT", "La receta contiene ingredientes repetidos o existe un conflicto de identidad.")
      }
      if (cause?.code === "23514") {
        throw new AppError(422, "RECIPE_INVARIANT_VIOLATION", "La receta no cumple las reglas de integridad.")
      }
      throw new AppError(500, "PERSISTENCE_ERROR", "No se pudo guardar la receta.")
    } finally {
      client.release()
    }
    return this.getRecipe(productId, actor)
  }
}
