import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { AccountingRepository } from "../domain/accounting-repository"
import type { DeliveriesRepository } from "../domain/deliveries-repository"
import type { ReservationsRepository } from "../domain/reservations-repository"
import type { SettingsRepository } from "../domain/settings-repository"
import type { TablesRepository } from "../domain/tables-repository"
import type {
  BestSellingProduct,
  DeliveryOrder,
  Reservation,
  RestaurantSettings,
  RestaurantTable,
  SalesReport,
} from "../domain/models"

export class HttpTablesRepository implements TablesRepository {
  constructor(private readonly http: HttpClient) {}

  getAll(signal?: AbortSignal) {
    return this.http.get<RestaurantTable[]>("/tables", signal)
  }

  create(table: { number: string; capacity: number }) {
    return this.http.post<RestaurantTable>("/tables", table)
  }

  updateStatus(id: string, status: string) {
    return this.http.put<RestaurantTable>(`/tables/${encodeURIComponent(id)}/status`, { status })
  }
}

export class HttpReservationsRepository implements ReservationsRepository {
  constructor(private readonly http: HttpClient) {}

  getAll(signal?: AbortSignal) {
    return this.http.get<Reservation[]>("/reservations", signal)
  }

  create(reservation: Omit<Reservation, "id" | "status">) {
    return this.http.post<Reservation>("/reservations", reservation)
  }

  updateStatus(id: string, status: string) {
    return this.http.put<Reservation>(`/reservations/${encodeURIComponent(id)}/status`, { status })
  }
}

export class HttpDeliveriesRepository implements DeliveriesRepository {
  constructor(private readonly http: HttpClient) {}

  getAll(signal?: AbortSignal) {
    return this.http.get<DeliveryOrder[]>("/delivery", signal)
  }

  async assignDriver(orderId: string, name: string, phone: string, estimatedTime: string) {
    await this.http.post("/delivery/assign", {
      order_id: orderId,
      driver_name: name,
      driver_phone: phone,
      estimated_time: estimatedTime,
    })
  }
}

export class HttpAccountingRepository implements AccountingRepository {
  constructor(private readonly http: HttpClient) {}

  getSalesReport(signal?: AbortSignal) {
    return this.http.get<SalesReport>("/accounting/sales", signal)
  }

  getBestSellingProducts(signal?: AbortSignal) {
    return this.http.get<BestSellingProduct[]>("/accounting/products", signal)
  }
}

export class HttpSettingsRepository implements SettingsRepository {
  constructor(private readonly http: HttpClient) {}

  get(signal?: AbortSignal) {
    return this.http.get<RestaurantSettings>("/admin/settings", signal)
  }

  async update(settings: RestaurantSettings) {
    await this.http.put("/admin/settings", settings)
  }
}
