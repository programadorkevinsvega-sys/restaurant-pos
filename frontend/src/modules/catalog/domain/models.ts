export interface Category {
  id: string
  name: string
  icon: string | null
  item_count: number
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  discount_percentage: number
  type: "Veg" | "Non Veg"
  category_id: string
  categories?: { id: string; name: string; icon: string | null } | null
}

export interface BranchCatalogProduct extends Product {
  enabled: boolean
  last_changed_at: string | null
  last_changed_by_user_id: string | null
  last_changed_by_email: string | null
}

export type NewProduct = Omit<Product, "id" | "categories">
