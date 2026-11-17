import type { CatalogRepository } from "../domain/catalog-repository"
import type { NewProduct } from "../domain/models"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class CreateProduct {
  constructor(private readonly catalog: CatalogRepository) {}

  execute(product: NewProduct) {
    if (!product.name.trim()) {
      throw new Error("El nombre del producto es obligatorio.")
    }
    if (!Number.isFinite(product.price) || product.price <= 0) {
      throw new Error("El precio debe ser mayor que cero.")
    }
    if (!product.category_id) {
      throw new Error("Selecciona una categoría.")
    }

    return traceOperation("catalog.create_product", () => this.catalog.createProduct(product))
  }
}
