"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { OrderSummary } from "@/modules/orders/domain/models"
import type { RestaurantTable, TableStatus } from "@/modules/operations/domain/models"

interface TableManagementProps {
  tables: RestaurantTable[]
  orders: OrderSummary[]
  canWrite: boolean
  onCreate: (number: string, capacity: number) => Promise<void>
  onUpdateTable: (id: string, status: TableStatus, currentOrderId?: string | null) => Promise<void>
}

const statusLabels: Record<TableStatus, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
  maintenance: "En mantenimiento",
}

const statusOptions: TableStatus[] = ["available", "occupied", "reserved", "maintenance"]

export function TableManagement({
  tables,
  orders,
  canWrite,
  onCreate,
  onUpdateTable,
}: TableManagementProps) {
  const [number, setNumber] = useState("")
  const [capacity, setCapacity] = useState("4")
  const [creating, setCreating] = useState(false)
  const [busyTable, setBusyTable] = useState<string | null>(null)
  const [orderSelections, setOrderSelections] = useState<Record<string, string>>({})

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreating(true)
    try {
      await onCreate(number, Number(capacity))
      setNumber("")
      setCapacity("4")
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (table: RestaurantTable, status: TableStatus) => {
    setBusyTable(table.id)
    try {
      await onUpdateTable(table.id, status)
    } finally {
      setBusyTable(null)
    }
  }

  const handleOrderChange = async (table: RestaurantTable) => {
    const selected = orderSelections[table.id] ?? "__unchanged__"
    if (selected === "__unchanged__") return

    setBusyTable(table.id)
    try {
      await onUpdateTable(
        table.id,
        table.status,
        selected === "__clear__" ? null : selected,
      )
      setOrderSelections((current) => ({ ...current, [table.id]: "__unchanged__" }))
    } finally {
      setBusyTable(null)
    }
  }

  return (
    <section className="flex-1 space-y-6 overflow-auto p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Gestión de mesas</h1>
        <p className="text-sm text-muted-foreground">
          Administra capacidad, estado operativo y pedido vinculado de cada mesa de la sucursal activa.
        </p>
      </header>

      {!canWrite && (
        <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          La sucursal seleccionada está suspendida o cerrada. Puedes consultar las mesas, pero no modificarlas.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agregar mesa</CardTitle>
          <p className="text-sm text-muted-foreground">
            El número se valida dentro de la sucursal activa; otra sucursal puede utilizar el mismo número.
          </p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]" onSubmit={handleCreate}>
            <label className="grid gap-1 text-sm">
              Número o nombre
              <Input
                required
                minLength={1}
                maxLength={30}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                disabled={!canWrite || creating}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Capacidad (personas)
              <Input
                required
                type="number"
                min={1}
                max={100}
                step={1}
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                disabled={!canWrite || creating}
              />
            </label>
            <div className="flex items-end">
              <Button type="submit" disabled={!canWrite || creating || !number.trim()}>
                {creating ? "Creando…" : "Crear mesa"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {tables.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No hay mesas registradas en esta sucursal.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => {
            const selectedOrder = orderSelections[table.id] ?? "__unchanged__"
            return (
              <Card key={table.id}>
                <CardHeader className="space-y-1 pb-3">
                  <CardTitle className="text-base">Mesa {table.number}</CardTitle>
                  <p className="text-sm text-muted-foreground">Capacidad: {table.capacity} personas</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="grid gap-1 text-sm">
                    Estado de la mesa
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={table.status}
                      disabled={!canWrite || busyTable === table.id}
                      onChange={(event) => void handleStatusChange(table, event.target.value as TableStatus)}
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>{statusLabels[status]}</option>
                      ))}
                    </select>
                  </label>

                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    <p className="font-medium">Pedido vinculado</p>
                    {table.current_order ? (
                      <>
                        <p>Pedido #{table.current_order.id.slice(0, 8)} · {table.current_order.status}</p>
                        <p className="text-muted-foreground">
                          Total: {Number(table.current_order.total_amount).toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(table.current_order.created_at).toLocaleString()}
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No hay un pedido vinculado.</p>
                    )}
                  </div>

                  <label className="grid gap-1 text-sm">
                    Cambiar pedido vinculado
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={selectedOrder}
                      disabled={!canWrite || busyTable === table.id}
                      onChange={(event) => setOrderSelections((current) => ({
                        ...current,
                        [table.id]: event.target.value,
                      }))}
                    >
                      <option value="__unchanged__">No modificar vínculo actual</option>
                      <option value="__clear__">Quitar pedido vinculado</option>
                      {orders.map((order) => (
                        <option key={order.id} value={order.id}>
                          #{order.id.slice(0, 8)} · {order.status} · {order.order_type} · {Number(order.total_amount).toFixed(2)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!canWrite || busyTable === table.id || selectedOrder === "__unchanged__"}
                    onClick={() => void handleOrderChange(table)}
                  >
                    {busyTable === table.id ? "Guardando…" : "Guardar vínculo de pedido"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
