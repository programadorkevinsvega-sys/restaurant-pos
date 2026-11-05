import type { Reservation } from "./models"

export interface ReservationsRepository {
  getAll(signal?: AbortSignal): Promise<Reservation[]>
  create(reservation: Omit<Reservation, "id" | "status">): Promise<Reservation>
  updateStatus(id: string, status: string): Promise<Reservation>
}
