export class CatalogRepository {
  async listCategories() {
    throw new Error("Not implemented")
  }

  async listProducts(categoryId) {
    throw new Error("Not implemented")
  }

  async findProduct(id) {
    throw new Error("Not implemented")
  }

  async listCorporateProducts() {
    throw new Error("Not implemented")
  }

  async listCorporateCategories() {
    throw new Error("Not implemented")
  }

  async listBranchProducts(branchId) {
    throw new Error("Not implemented")
  }

  async setBranchProductEnabled(branchId, productId, enabled) {
    throw new Error("Not implemented")
  }

  async createCategory(category) {
    throw new Error("Not implemented")
  }

  async updateCategory(id, category) {
    throw new Error("Not implemented")
  }

  async deactivateCategory(id) {
    throw new Error("Not implemented")
  }

  async createProduct(product) {
    throw new Error("Not implemented")
  }

  async updateProduct(id, product) {
    throw new Error("Not implemented")
  }

  async deactivateProduct(id) {
    throw new Error("Not implemented")
  }
}
