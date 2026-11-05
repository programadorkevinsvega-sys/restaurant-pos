export class CatalogUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listCategories() {
    return this.repository.listCategories()
  }

  listProducts(categoryId) {
    return this.repository.listProducts(categoryId)
  }

  findProduct(id) {
    return this.repository.findProduct(id)
  }

  createCategory(input) {
    return this.repository.createCategory(input)
  }

  createProduct(input) {
    return this.repository.createProduct(input)
  }
}
