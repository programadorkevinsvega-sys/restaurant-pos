import type { Reservation, ReservationFilters } from "./models"

export interface ReservationsRepository {
  getAll(filters?: ReservationFilters, signal?: AbortSignal): Promise<Reservation[]>
  create(reservation: Omit<Reservation, "id" | "status">): Promise<Reservation>
  updateStatus(id: string, status: string): Promise<Reservation>
}
