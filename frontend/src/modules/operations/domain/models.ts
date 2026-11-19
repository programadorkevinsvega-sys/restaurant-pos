export type TableStatus = "available" | "occupied" | "reserved" | "maintenance"

export type ReservationStatus = "confirmed" | "seated" | "completed" | "cancelled" | "no_show"

export interface ReservationFilters {
  date?: string
  status?: ReservationStatus
}

export interface RestaurantTable {
  id: string
  number: string | number
  capacity: number
  status: TableStatus
  current_order?: {
    id: string
    total_amount: number
    status: string
    created_at: string
  } | null
}

export interface Reservation {
  id: string
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  table_id: string
  reservation_date: string
  party_size: number
  notes?: string | null
  status: ReservationStatus
  table?: Pick<RestaurantTable, "id" | "number" | "capacity">
}

export interface DeliveryOrder {
  id: string
  customer_name: string
  table_number: string
  total_amount: number
  status: string
  created_at: string
  delivery_info: Array<{
    address: string
    phone: string
    driver_name: string | null
    driver_phone: string | null
    estimated_time: string | null
  }> | null
}

export interface SalesReport {
  period: string
  total_orders: number
  total_revenue: number
  data: Array<{ period: string; orders: number; revenue: number }>
}

export interface BestSellingProduct {
  id: string
  name: string
  category: string
  total_quantity: number
  total_revenue: number
}

export type RestaurantSettings = Record<string, string>
