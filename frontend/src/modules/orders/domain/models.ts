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
  legal_entity_id: string
  delivery_address?: string
  delivery_phone?: string
  items: Array<{
    id: string
    quantity: number
  }>
}

export interface OrderReceipt {
  success: boolean
  orderId: string
  message?: string
}
