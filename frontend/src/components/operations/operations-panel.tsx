"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Category } from "@/modules/catalog/domain/models"
import type {
  BestSellingProduct,
  DeliveryOrder,
  Reservation,
  RestaurantSettings,
  RestaurantTable,
  SalesReport,
} from "@/modules/operations/domain/models"
import type { AppSection } from "@/components/sidebar-nav"
import { OrganizationProfileCard } from "@/components/organization/organization-profile-card"
import type { OrganizationProfile, OrganizationProfileInput, OrganizationProfileUpdate } from "@/modules/organization/domain/models"
import { HttpError } from "@/shared/infrastructure/http-client"

interface OperationsPanelProps {
  section: Extract<AppSection, "reservations" | "delivery" | "accounting" | "settings">
  tables: RestaurantTable[]
  reservations: Reservation[]
  deliveries: DeliveryOrder[]
  salesReport: SalesReport | null
  bestSellingProducts: BestSellingProduct[]
  settings: RestaurantSettings
  categories: Category[]
  onCreateReservation: (reservation: Omit<Reservation, "id" | "status">) => Promise<void>
  onUpdateReservationStatus: (id: string, status: string) => Promise<void>
  onAssignDriver: (orderId: string, name: string, phone: string, eta: string) => Promise<void>
  onUpdateSettings: (settings: RestaurantSettings) => Promise<void>
  onCreateCategory: (name: string) => Promise<void>
  organization: OrganizationProfile | null
  organizationLoading: boolean
  canUpdateOrganization: boolean
  canBootstrapOrganization: boolean
  organizationLoadError: string | null
  onBootstrapOrganization: (input: OrganizationProfileInput) => Promise<void>
  onUpdateOrganization: (input: OrganizationProfileUpdate) => Promise<void>
}

const reservationFieldLabels: Record<string, string> = {
  customer_name: "nombre del cliente",
  customer_phone: "teléfono del cliente",
  customer_email: "correo del cliente",
  table_id: "mesa",
  reservation_date: "fecha y hora",
  party_size: "número de personas",
  notes: "notas",
}

function getErrorMessage(error: unknown) {
  if (error instanceof HttpError && error.details.length > 0) {
    const fields = [...new Set(error.details.map(({ field }) => {
      const name = field.split(".").pop() ?? field
      return reservationFieldLabels[name] ?? name.replaceAll("_", " ")
    }))]
    return `${error.message} Revisa: ${fields.join(", ")}.`
  }

  return error instanceof Error ? error.message : "No se pudo completar la operación."
}

export function OperationsPanel(props: OperationsPanelProps) {
  const {
    section, tables, reservations, deliveries, salesReport, bestSellingProducts, settings, categories,
    onCreateReservation, onUpdateReservationStatus, onAssignDriver, onUpdateSettings, onCreateCategory,
    organization, organizationLoading, canUpdateOrganization, canBootstrapOrganization, organizationLoadError,
    onBootstrapOrganization, onUpdateOrganization,
  } = props
  const [busy, setBusy] = useState(false)
  const [categoryName, setCategoryName] = useState("")
  const [message, setMessage] = useState("")

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setMessage("")
    try {
      await operation()
    } catch (error) {
      setMessage(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (section === "reservations") {
    const handleReservation = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const formElement = event.currentTarget
      const form = new FormData(formElement)
      const rawDate = String(form.get("reservation_date"))
      void run(async () => {
        await onCreateReservation({
          customer_name: String(form.get("customer_name")),
          customer_phone: String(form.get("customer_phone")),
          table_id: String(form.get("table_id")),
          reservation_date: new Date(rawDate).toISOString(),
          party_size: Number(form.get("party_size")),
          notes: String(form.get("notes") ?? ""),
        })
        formElement.reset()
      })
    }

    return (
      <section className="flex-1 space-y-6 overflow-auto p-6">
        <div><h1 className="text-2xl font-bold">Reservaciones</h1><p className="text-sm text-muted-foreground">Administra reservas y asignación de mesas.</p></div>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <Card>
          <CardHeader><CardTitle className="text-lg">Nueva reservación</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleReservation}>
              <Input required name="customer_name" placeholder="Nombre del cliente" />
              <Input name="customer_phone" placeholder="Teléfono" />
              <select required name="table_id" className="h-10 rounded-md border bg-background px-3">
                <option value="">Seleccionar mesa</option>
                {tables.map((table) => <option key={table.id} value={table.id}>Mesa {table.number} ({table.capacity} personas)</option>)}
              </select>
              <Input required name="party_size" type="number" min="1" placeholder="Personas" />
              <Input required name="reservation_date" type="datetime-local" />
              <Input name="notes" placeholder="Notas (opcional)" />
              <Button type="submit" disabled={busy || tables.length === 0} className="sm:col-span-2">Crear reservación</Button>
            </form>
          </CardContent>
        </Card>
        <div className="grid gap-3">
          {reservations.map((reservation) => (
            <Card key={reservation.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div><p className="font-medium">{reservation.customer_name} · {reservation.party_size} personas</p>
                <p className="text-sm text-muted-foreground">Mesa {reservation.table?.number ?? "—"} · {new Date(reservation.reservation_date).toLocaleString()}</p>
                <p className="text-xs">{reservation.status}</p></div>
              <Button variant="outline" disabled={busy || reservation.status === "cancelled"} onClick={() => void run(() => onUpdateReservationStatus(reservation.id, "cancelled"))}>Cancelar</Button>
            </CardContent></Card>
          ))}
          {reservations.length === 0 && <p className="text-sm text-muted-foreground">No hay reservaciones.</p>}
        </div>
      </section>
    )
  }

  if (section === "delivery") {
    return (
      <section className="flex-1 space-y-6 overflow-auto p-6">
        <div><h1 className="text-2xl font-bold">Entregas</h1><p className="text-sm text-muted-foreground">Asigna repartidores a pedidos a domicilio.</p></div>
        {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
        <div className="grid gap-3">
          {deliveries.map((delivery) => (
            <Card key={delivery.id}><CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div><p className="font-medium">{delivery.customer_name || "Cliente"} · Pedido {delivery.id.slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">{delivery.status} · ${Number(delivery.total_amount).toFixed(2)}</p>
                <p className="text-sm">{delivery.delivery_info?.[0]?.address || "Dirección no disponible"}</p></div>
              <form className="grid gap-2 sm:grid-cols-3" onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                void run(() => onAssignDriver(delivery.id, String(form.get("driver_name")), String(form.get("driver_phone")), String(form.get("estimated_time"))))
              }}>
                <Input required name="driver_name" placeholder="Repartidor" defaultValue={delivery.delivery_info?.[0]?.driver_name ?? ""} />
                <Input name="driver_phone" placeholder="Teléfono" defaultValue={delivery.delivery_info?.[0]?.driver_phone ?? ""} />
                <div className="flex gap-2"><Input name="estimated_time" placeholder="Tiempo estimado" /><Button type="submit" disabled={busy}>Asignar</Button></div>
              </form>
            </CardContent></Card>
          ))}
          {deliveries.length === 0 && <p className="text-sm text-muted-foreground">No hay pedidos a domicilio pendientes.</p>}
        </div>
      </section>
    )
  }

  if (section === "accounting") {
    return (
      <section className="flex-1 space-y-6 overflow-auto p-6">
        <div><h1 className="text-2xl font-bold">Contabilidad</h1><p className="text-sm text-muted-foreground">Resumen de pedidos completados y productos más vendidos.</p></div>
        {salesReport ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Ventas totales</p><p className="mt-2 text-2xl font-bold">${Number(salesReport.total_revenue).toFixed(2)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pedidos completados</p><p className="mt-2 text-2xl font-bold">{salesReport.total_orders}</p></CardContent></Card>
            </div>
            <Card><CardHeader><CardTitle className="text-lg">Ventas por período</CardTitle></CardHeader><CardContent className="space-y-2">
              {salesReport.data.map((item) => <div key={item.period} className="flex justify-between border-b py-2 text-sm"><span>{item.period}</span><span>{item.orders} pedidos · ${Number(item.revenue).toFixed(2)}</span></div>)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg">Productos más vendidos</CardTitle></CardHeader><CardContent className="space-y-2">
              {bestSellingProducts.map((item) => <div key={item.id} className="flex justify-between border-b py-2 text-sm"><span>{item.name} · {item.category}</span><span>{item.total_quantity} vendidos · ${Number(item.total_revenue).toFixed(2)}</span></div>)}
              {bestSellingProducts.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ventas completadas.</p>}
            </CardContent></Card>
          </>
        ) : <p className="text-sm text-muted-foreground">No se pudo cargar el reporte.</p>}
      </section>
    )
  }

  return (
    <section className="flex-1 space-y-6 overflow-auto p-6">
      <div><h1 className="text-2xl font-bold">Configuración</h1><p className="text-sm text-muted-foreground">Ajustes del restaurante guardados en el backend.</p></div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <OrganizationProfileCard
        organization={organization}
        loading={organizationLoading}
        canUpdate={canUpdateOrganization}
        canBootstrap={canBootstrapOrganization}
        loadError={organizationLoadError}
        onBootstrap={onBootstrapOrganization}
        onUpdate={onUpdateOrganization}
      />
      <Card><CardHeader><CardTitle className="text-lg">Categorías de menú</CardTitle></CardHeader><CardContent>
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault()
          void run(async () => { await onCreateCategory(categoryName); setCategoryName("") })
        }}>
          <Input required value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Nombre de categoría" />
          <Button type="submit" disabled={busy}>Agregar</Button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">{categories.map((category) => <li className="rounded-full bg-muted px-3 py-1 text-sm" key={category.id}>{category.name}</li>)}</ul>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-lg">Preferencias</CardTitle></CardHeader><CardContent>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          const nextSettings = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]))
          void run(() => onUpdateSettings(nextSettings))
        }}>
          {Object.entries(settings).map(([key, value]) => <label htmlFor={`setting-${key}`} key={key} className="grid gap-1 text-sm font-medium">{key}<Input id={`setting-${key}`} name={key} defaultValue={value} /></label>)}
          {Object.keys(settings).length === 0 && <p className="text-sm text-muted-foreground">No hay preferencias configuradas por el backend.</p>}
          {Object.keys(settings).length > 0 && <Button type="submit" disabled={busy}>Guardar preferencias</Button>}
        </form>
      </CardContent></Card>
    </section>
  )
}
