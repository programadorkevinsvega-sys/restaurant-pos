import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { RecipesRepository } from "../domain/recipes-repository"
import type { Ingredient, IngredientInput, ProductRecipe, RecipeInput } from "../domain/models"

export class HttpRecipesRepository implements RecipesRepository {
  constructor(private readonly http: HttpClient) {}

  listIngredients() {
    return this.http.get<Ingredient[]>("/admin/recipes/ingredients")
  }

  createIngredient(input: IngredientInput) {
    return this.http.post<Ingredient>("/admin/recipes/ingredients", input)
  }

  updateIngredient(id: string, input: IngredientInput) {
    return this.http.patch<Ingredient>("/admin/recipes/ingredients/" + encodeURIComponent(id), input)
  }

  deactivateIngredient(id: string) {
    return this.http.delete<{ success: boolean; deactivated: boolean }>(
      "/admin/recipes/ingredients/" + encodeURIComponent(id),
    )
  }

  getRecipe(productId: string) {
    return this.http.get<ProductRecipe | null>(
      "/admin/recipes/products/" + encodeURIComponent(productId),
    )
  }

  saveRecipe(productId: string, input: RecipeInput) {
    return this.http.put<ProductRecipe>(
      "/admin/recipes/products/" + encodeURIComponent(productId),
      input,
    )
  }
}
