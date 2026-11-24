import type { Product } from "@/modules/catalog/domain/models"
import type { ProductOptionSelection } from "@/modules/variants/domain/models"

export type OrderType = "Comer aquí" | "Para llevar" | "A domicilio"

export interface CartItem {
  lineId: string
  product: Product
  quantity: number
  selectedOptions: ProductOptionSelection[]
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
    option_ids: string[]
  }>
}

export interface OrderReceipt {
  success: boolean
  orderId: string
  message?: string
  currency_code: string
  subtotal_before_discount: string
  discount_total: string
  tax_total: string
  delivery_fee_snapshot: string | null
  total_amount: string
  items: Array<{
    product_name: string
    quantity: number
    list_unit_price: string | null
    unit_discount: string | null
    line_total: string
    tax_mode: "inclusive" | "exclusive" | null
    tax_breakdown: Array<{
      tax_rule_id: string
      code: string
      name: string
      rate: number
      taxable_base: number
      amount: number
      price_mode: "inclusive" | "exclusive"
    }>
    promotion: {
      id: string
      name: string
      discount_type: "percentage" | "fixed_amount"
      discount_value: number
      discount_amount: number
    } | null
  }>
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
    variant_selection_snapshot: Array<{
      option_id: string
      group_id: string
      group_name: string
      group_kind: "presentation" | "modifier"
      name: string
      group_position: number
      position: number
    }>
    products: { id: string; name: string; image_url: string | null }
  }>
}
