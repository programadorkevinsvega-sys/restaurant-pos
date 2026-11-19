import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class RecipesUseCases {
  constructor(repository) {
    this.repository = repository
  }

  listIngredients(actor) {
    return traceOperation("recipes.list_ingredients", () => this.repository.listIngredients(actor))
  }

  createIngredient(input, actor) {
    return traceOperation("recipes.create_ingredient", () => this.repository.createIngredient(input, actor))
  }

  updateIngredient(id, input, actor) {
    return traceOperation("recipes.update_ingredient", () => this.repository.updateIngredient(id, input, actor))
  }

  deactivateIngredient(id, actor) {
    return traceOperation("recipes.deactivate_ingredient", () => this.repository.deactivateIngredient(id, actor))
  }

  getRecipe(productId, actor) {
    return traceOperation("recipes.get_product_recipe", () => this.repository.getRecipe(productId, actor))
  }

  saveRecipe(productId, input, actor) {
    return traceOperation("recipes.save_product_recipe", () => this.repository.saveRecipe(productId, input, actor))
  }
}
