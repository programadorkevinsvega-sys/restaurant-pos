import { CatalogRepository } from "../domain/catalog-repository.js"
import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

export class PostgresCatalogRepository extends CatalogRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async listCategories() {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT id, name, icon, item_count
       FROM public.categories
       ORDER BY name
       LIMIT 100`,
    )
    return rows
  }

  async listProducts(categoryId) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT p.id, p.name, p.description, p.price, p.image_url,
              p.discount_percentage, p.type, p.category_id,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
              END AS categories
       FROM public.products p
       LEFT JOIN public.categories c ON c.id = p.category_id
       WHERE $1::uuid IS NULL OR p.category_id = $1::uuid
       ORDER BY p.name
       LIMIT 200`,
      [categoryId ?? null],
    )
    return rows.map((row) => ({ ...row, price: Number(row.price) }))
  }

  async findProduct(id) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT p.id, p.name, p.description, p.price, p.image_url,
              p.discount_percentage, p.type, p.category_id,
              CASE WHEN c.id IS NULL THEN NULL
                   ELSE jsonb_build_object('id', c.id, 'name', c.name, 'icon', c.icon)
              END AS categories
       FROM public.products p
       LEFT JOIN public.categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [id],
    )
    const product = rows[0]
    return product ? { ...product, price: Number(product.price) } : null
  }

  async createCategory(category) {
    const { rows } = await queryPostgres(
      this.pool,
      `INSERT INTO public.categories (name, icon)
       VALUES ($1, $2)
       RETURNING id, name, icon, item_count`,
      [category.name, category.icon ?? null],
    )
    return rows[0]
  }

  async createProduct(product) {
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
