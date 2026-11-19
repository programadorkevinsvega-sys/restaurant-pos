import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { CatalogRepository } from "../domain/catalog-repository"
import type { BranchCatalogProduct, Category, CategoryInput, NewProduct, Product, ProductInput } from "../domain/models"

export class HttpCatalogRepository implements CatalogRepository {
  constructor(private readonly http: HttpClient) {}

  getCategories(signal?: AbortSignal) {
    return this.http.get<Category[]>("/categories", signal)
  }

  getProducts(categoryId?: string, signal?: AbortSignal) {
    const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : ""
    return this.http.get<Product[]>(`/products${query}`, signal).then((products) =>
      products.map((product) => ({
        ...product,
        price: Number(product.price),
        discount_percentage: Number(product.discount_percentage ?? 0),
      })),
    )
  }

  getCorporateCategories() {
    return this.http.get<Category[]>("/admin/catalog/categories")
  }

  getCorporateProducts() {
    return this.http.get<Product[]>("/admin/catalog/products").then((products) =>
      products.map((product) => ({
        ...product,
        price: Number(product.price),
        discount_percentage: Number(product.discount_percentage ?? 0),
      })),
    )
  }

  getBranchProducts(branchId: string) {
    return this.http.get<BranchCatalogProduct[]>(
      `/admin/catalog/branches/${encodeURIComponent(branchId)}/products`,
    ).then((products) => products.map((product) => ({
      ...product,
      price: Number(product.price),
      discount_percentage: Number(product.discount_percentage ?? 0),
    })))
  }

  setBranchProductEnabled(branchId: string, productId: string, enabled: boolean) {
    return this.http.put<{ success: boolean; changed: boolean }>(
      `/admin/catalog/branches/${encodeURIComponent(branchId)}/products/${encodeURIComponent(productId)}`,
      { enabled },
    )
  }

  createProduct(product: NewProduct) {
    return this.http.post<Product>("/admin/products", product)
  }

  updateProduct(id: string, product: ProductInput) {
    return this.http.patch<Product>(`/admin/products/${encodeURIComponent(id)}`, product)
  }

  deactivateProduct(id: string) {
    return this.http.delete<{ success: boolean; deactivated: boolean }>(
      `/admin/products/${encodeURIComponent(id)}`,
    )
  }

  createCategory(category: CategoryInput) {
    return this.http.post<Category>("/admin/categories", category)
  }

  updateCategory(id: string, category: CategoryInput) {
    return this.http.patch<Category>(`/admin/categories/${encodeURIComponent(id)}`, category)
  }

  deactivateCategory(id: string) {
    return this.http.delete<{ success: boolean; deactivated: boolean }>(
      `/admin/categories/${encodeURIComponent(id)}`,
    )
  }
}
