"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type {
  Reservation,
  ReservationFilters,
  ReservationStatus,
  RestaurantTable,
} from "@/modules/operations/domain/models"

interface ReservationsManagementPanelProps {
  reservations: Reservation[]
  tables: RestaurantTable[]
  canWrite: boolean
  onCreate: (reservation: Omit<Reservation, "id" | "status">) => Promise<void>
  onUpdateStatus: (id: string, status: ReservationStatus) => Promise<void>
  onList: (filters: ReservationFilters) => Promise<void>
}

const statusLabels: Record<ReservationStatus, string> = {
  confirmed: "Confirmada",
  seated: "Cliente sentado",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No se presentó",
}

const statusOptions: ReservationStatus[] = [
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
]

function formatReservationDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function ReservationsManagementPanel({
  reservations,
  tables,
  canWrite,
  onCreate,
  onUpdateStatus,
  onList,
}: ReservationsManagementPanelProps) {
  const [dateFilter, setDateFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all")
  const [creating, setCreating] = useState(false)
  const [filtering, setFiltering] = useState(false)
  const [busyReservation, setBusyReservation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentFilters = (): ReservationFilters => ({
    ...(dateFilter ? { date: dateFilter } : {}),
    ...(statusFilter === "all" ? {} : { status: statusFilter }),
  })

  const applyFilters = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    setFiltering(true)
    setError(null)
    try {
      await onList(currentFilters())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron consultar las reservaciones.")
    } finally {
      setFiltering(false)
    }
  }

  const createReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const rawDate = String(form.get("reservation_date") ?? "")
    setCreating(true)
    setError(null)
    try {
      await onCreate({
        customer_name: String(form.get("customer_name") ?? "").trim(),
        customer_phone: String(form.get("customer_phone") ?? "").trim() || null,
        customer_email: String(form.get("customer_email") ?? "").trim().toLowerCase() || null,
        table_id: String(form.get("table_id") ?? ""),
        reservation_date: new Date(rawDate).toISOString(),
        party_size: Number(form.get("party_size")),
        notes: String(form.get("notes") ?? "").trim() || null,
      })
      formElement.reset()
      await onList(currentFilters())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la reservación.")
    } finally {
      setCreating(false)
    }
  }

  const changeStatus = async (reservation: Reservation, status: ReservationStatus) => {
    setBusyReservation(reservation.id)
    setError(null)
    try {
      await onUpdateStatus(reservation.id, status)
      await onList(currentFilters())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el estado de la reservación.")
    } finally {
      setBusyReservation(null)
    }
  }

  return (
    <section className="flex-1 space-y-6 overflow-auto p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Reservaciones</h1>
        <p className="text-sm text-muted-foreground">
          Consulta, registra y actualiza reservaciones de la sucursal activa.
        </p>
      </header>

      {!canWrite && (
        <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          La sucursal seleccionada está suspendida o cerrada. Las reservaciones están disponibles solo para consulta.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nueva reservación</CardTitle>
          <p className="text-sm text-muted-foreground">
            Registra los datos de contacto, tamaño del grupo, mesa, fecha y observaciones.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createReservation}>
            <label className="grid gap-1 text-sm">
              Nombre del cliente
              <Input required name="customer_name" minLength={1} maxLength={120} disabled={!canWrite || creating} />
            </label>
            <label className="grid gap-1 text-sm">
              Teléfono
              <Input name="customer_phone" maxLength={32} disabled={!canWrite || creating} />
            </label>
            <label className="grid gap-1 text-sm">
              Correo electrónico
              <Input name="customer_email" type="email" maxLength={254} disabled={!canWrite || creating} />
            </label>
            <label className="grid gap-1 text-sm">
              Mesa
              <select
                required
                name="table_id"
                className="h-10 rounded-md border bg-background px-3"
                disabled={!canWrite || creating || tables.length === 0}
                defaultValue=""
              >
                <option value="" disabled>Seleccionar mesa</option>
                {tables.map((table) => (
                  <option key={table.id} value={table.id}>
                    Mesa {table.number} · capacidad {table.capacity} · {table.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Número de personas
              <Input required name="party_size" type="number" min={1} max={100} step={1} disabled={!canWrite || creating} />
            </label>
            <label className="grid gap-1 text-sm">
              Fecha y hora
              <Input required name="reservation_date" type="datetime-local" disabled={!canWrite || creating} />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              Notas
              <textarea
                name="notes"
                maxLength={1000}
                rows={3}
                className="rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Indicaciones o información adicional"
                disabled={!canWrite || creating}
              />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!canWrite || creating || tables.length === 0}>
                {creating ? "Guardando…" : "Crear reservación"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Consulta de reservaciones</CardTitle>
          <p className="text-sm text-muted-foreground">Los filtros se aplican en la API de la sucursal activa.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]" onSubmit={(event) => void applyFilters(event)}>
            <label className="grid gap-1 text-sm">
              Fecha
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} disabled={filtering} />
            </label>
            <label className="grid gap-1 text-sm">
              Estado
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | "all")}
                disabled={filtering}
              >
                <option value="all">Todos</option>
                {statusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </label>
            <div className="flex items-end">
              <Button type="submit" variant="outline" disabled={filtering}>
                {filtering ? "Consultando…" : "Aplicar filtros"}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                disabled={filtering || (!dateFilter && statusFilter === "all")}
                onClick={() => {
                  setDateFilter("")
                  setStatusFilter("all")
                  setFiltering(true)
                  setError(null)
                  void onList({}).catch((cause: unknown) => {
                    setError(cause instanceof Error ? cause.message : "No se pudieron consultar las reservaciones.")
                  }).finally(() => setFiltering(false))
                }}
              >
                Limpiar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {reservations.map((reservation) => (
          <Card key={reservation.id}>
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">{reservation.customer_name} · {reservation.party_size} personas</p>
                  <p className="text-sm text-muted-foreground">
                    Mesa {reservation.table?.number ?? "—"}
                    {reservation.table ? " · capacidad " + reservation.table.capacity : ""}
                    {" · "}{formatReservationDate(reservation.reservation_date)}
                  </p>
                  <p className="text-xs text-muted-foreground">Reservación #{reservation.id.slice(0, 8)}</p>
                </div>
                <label className="grid min-w-48 gap-1 text-sm">
                  Estado
                  <select
                    className="h-10 rounded-md border bg-background px-3"
                    value={reservation.status}
                    disabled={!canWrite || busyReservation === reservation.id}
                    onChange={(event) => void changeStatus(reservation, event.target.value as ReservationStatus)}
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{statusLabels[status]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Teléfono:</span> {reservation.customer_phone || "No registrado"}</p>
                <p><span className="font-medium">Correo:</span> {reservation.customer_email || "No registrado"}</p>
              </div>
              {reservation.notes && (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <p className="mb-1 font-medium">Notas</p>
                  <p className="whitespace-pre-wrap">{reservation.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {reservations.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            No hay reservaciones para los filtros seleccionados.
          </p>
        )}
      </div>
    </section>
  )
}
