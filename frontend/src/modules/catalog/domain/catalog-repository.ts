import type { BranchCatalogProduct, Category, CategoryInput, NewProduct, Product, ProductInput } from "./models"

export interface CatalogRepository {
  getCategories(signal?: AbortSignal): Promise<Category[]>
  getProducts(categoryId?: string, signal?: AbortSignal): Promise<Product[]>
  getCorporateCategories(): Promise<Category[]>
  getCorporateProducts(): Promise<Product[]>
  getBranchProducts(branchId: string): Promise<BranchCatalogProduct[]>
  setBranchProductEnabled(branchId: string, productId: string, enabled: boolean): Promise<{ success: boolean; changed: boolean }>
  createProduct(product: NewProduct): Promise<Product>
  updateProduct(id: string, product: ProductInput): Promise<Product>
  deactivateProduct(id: string): Promise<{ success: boolean; deactivated: boolean }>
  createCategory(category: CategoryInput): Promise<Category>
  updateCategory(id: string, category: CategoryInput): Promise<Category>
  deactivateCategory(id: string): Promise<{ success: boolean; deactivated: boolean }>
}
