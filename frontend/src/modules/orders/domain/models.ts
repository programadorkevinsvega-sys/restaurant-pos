import type { Product } from "@/modules/catalog/domain/models"

export type OrderType = "Comer aquí" | "Para llevar" | "A domicilio"

export interface CartItem {
  product: Product
  quantity: number
}

export interface NewOrder {
  table_number: string
  customer_name: string
  order_type: OrderType
  total_amount: number
  items: Array<{
    id: string
    name: string
    price: number
    quantity: number
    image_url?: string | null
  }>
}

export interface OrderReceipt {
  success: boolean
  orderId: string
  message?: string
}
