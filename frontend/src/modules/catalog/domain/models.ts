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
}

export type NewProduct = Omit<Product, "id">
