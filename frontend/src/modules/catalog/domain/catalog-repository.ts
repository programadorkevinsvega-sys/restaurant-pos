import type { BranchCatalogProduct, Category, NewProduct, Product } from "./models"

export interface CatalogRepository {
  getCategories(signal?: AbortSignal): Promise<Category[]>
  getProducts(categoryId?: string, signal?: AbortSignal): Promise<Product[]>
  getBranchProducts(branchId: string): Promise<BranchCatalogProduct[]>
  setBranchProductEnabled(branchId: string, productId: string, enabled: boolean): Promise<{ success: boolean; changed: boolean }>
  createProduct(product: NewProduct): Promise<Product>
  createCategory(name: string): Promise<Category>
}
