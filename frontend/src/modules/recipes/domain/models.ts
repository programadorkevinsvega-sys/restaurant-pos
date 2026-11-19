export interface Ingredient {
  id: string
  name: string
  description: string | null
  unit_code: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface IngredientInput {
  name: string
  description: string | null
  unit_code: string
}

export interface RecipeIngredient {
  ingredient_id: string
  name: string
  unit_code: string
  quantity: string
  position: number
  is_active: boolean
}

export interface ProductRecipe {
  id: string
  product_id: string
  preparation_instructions: string
  created_at: string
  updated_at: string
  ingredients: RecipeIngredient[]
}

export interface RecipeInput {
  preparation_instructions: string
  ingredients: Array<{ ingredient_id: string; quantity: string }>
}
