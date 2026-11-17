import type { ReservationsRepository } from "../domain/reservations-repository"
import type { Reservation } from "../domain/models"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ManageReservations {
  constructor(private readonly reservations: ReservationsRepository) {}

  getAll(signal?: AbortSignal) {
    return traceOperation("reservations.list", () => this.reservations.getAll(signal))
  }

  create(reservation: Omit<Reservation, "id" | "status">) {
    if (!reservation.customer_name.trim() || !reservation.table_id || reservation.party_size < 1) {
      throw new Error("Completa el cliente, la mesa y el número de personas.")
    }
    if (Number.isNaN(Date.parse(reservation.reservation_date))) {
      throw new Error("La fecha de reservación no es válida.")
    }
    return traceOperation("reservations.create", () => this.reservations.create(reservation))
  }

  updateStatus(id: string, status: string) {
    return traceOperation("reservations.update_status", () => this.reservations.updateStatus(id, status))
  }
}
