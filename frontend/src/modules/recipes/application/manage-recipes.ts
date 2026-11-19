import { traceOperation } from "@/shared/infrastructure/tracing"
import type { RecipesRepository } from "../domain/recipes-repository"
import type { IngredientInput, RecipeInput } from "../domain/models"

export class ManageRecipes {
  constructor(private readonly repository: RecipesRepository) {}

  listIngredients() {
    return traceOperation("recipes.list_ingredients", () => this.repository.listIngredients())
  }

  createIngredient(input: IngredientInput) {
    return traceOperation("recipes.create_ingredient", () => this.repository.createIngredient(input))
  }

  updateIngredient(id: string, input: IngredientInput) {
    return traceOperation("recipes.update_ingredient", () => this.repository.updateIngredient(id, input))
  }

  deactivateIngredient(id: string) {
    return traceOperation("recipes.deactivate_ingredient", () => this.repository.deactivateIngredient(id))
  }

  getRecipe(productId: string) {
    return traceOperation("recipes.get_product_recipe", () => this.repository.getRecipe(productId))
  }

  saveRecipe(productId: string, input: RecipeInput) {
    return traceOperation("recipes.save_product_recipe", () => this.repository.saveRecipe(productId, input))
  }
}
