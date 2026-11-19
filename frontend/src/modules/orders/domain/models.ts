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


export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled"

export interface OrderListFilters {
  status?: OrderStatus
  limit?: number
}

export interface OrderSummary {
  id: string
  table_number: string
  customer_name: string | null
  order_type: OrderType
  total_amount: number
  status: OrderStatus
  created_at: string
  branch_id: string
  legal_entity_id: string
  order_items: Array<{
    id: string
    quantity: number
    price_at_order: number
    products: { id: string; name: string; image_url: string | null }
  }>
}
