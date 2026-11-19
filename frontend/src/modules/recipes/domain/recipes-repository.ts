import type { Ingredient, IngredientInput, ProductRecipe, RecipeInput } from "./models"

export interface RecipesRepository {
  listIngredients(): Promise<Ingredient[]>
  createIngredient(input: IngredientInput): Promise<Ingredient>
  updateIngredient(id: string, input: IngredientInput): Promise<Ingredient>
  deactivateIngredient(id: string): Promise<{ success: boolean; deactivated: boolean }>
  getRecipe(productId: string): Promise<ProductRecipe | null>
  saveRecipe(productId: string, input: RecipeInput): Promise<ProductRecipe>
}
