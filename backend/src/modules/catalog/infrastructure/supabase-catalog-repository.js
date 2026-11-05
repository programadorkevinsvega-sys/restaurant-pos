import { unwrapSupabase } from "../../../shared/infrastructure/unwrap-supabase.js"
import { CatalogRepository } from "../domain/catalog-repository.js"

export class SupabaseCatalogRepository extends CatalogRepository {
  constructor(client) {
    super()
    this.client = client
  }

  async listCategories() {
    return unwrapSupabase(
      await this.client.from("categories").select("id,name,icon,item_count").order("name").limit(100),
    )
  }

  async listProducts(categoryId) {
    let query = this.client
      .from("products")
      .select("id,name,description,price,image_url,discount_percentage,type,category_id,categories(id,name,icon)")
      .order("name")
      .limit(200)
    if (categoryId) query = query.eq("category_id", categoryId)
    return unwrapSupabase(await query)
  }

  async findProduct(id) {
    const result = await this.client
      .from("products")
      .select("id,name,description,price,image_url,discount_percentage,type,category_id,categories(id,name,icon)")
      .eq("id", id)
      .maybeSingle()
    return unwrapSupabase(result)
  }

  async createCategory(category) {
    return unwrapSupabase(
      await this.client.from("categories").insert(category).select("id,name,icon,item_count").single(),
    )
  }

  async createProduct(product) {
    return unwrapSupabase(
      await this.client
        .from("products")
        .insert(product)
        .select("id,name,description,price,image_url,discount_percentage,type,category_id")
        .single(),
    )
  }
}
