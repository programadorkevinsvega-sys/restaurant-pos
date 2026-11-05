import type { Category, NewProduct, Product } from "./models"

export interface CatalogRepository {
  getCategories(signal?: AbortSignal): Promise<Category[]>
  getProducts(categoryId?: string, signal?: AbortSignal): Promise<Product[]>
  createProduct(product: NewProduct): Promise<Product>
  createCategory(name: string): Promise<Category>
}
