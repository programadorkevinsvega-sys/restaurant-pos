"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { RestaurantTable } from "@/modules/operations/domain/models"

interface TableManagementProps {
  tables: RestaurantTable[]
  onCreate: (number: string, capacity: number) => Promise<void>
  onUpdateStatus: (id: string, status: string) => Promise<void>
}

const statusLabels: Record<string, string> = {
  available: "Disponible",
  occupied: "Ocupada",
  reserved: "Reservada",
}

export function TableManagement({ tables, onCreate, onUpdateStatus }: TableManagementProps) {
  const [number, setNumber] = useState("")
  const [capacity, setCapacity] = useState("4")
  const [busyTable, setBusyTable] = useState<string | null>(null)

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onCreate(number, Number(capacity))
    setNumber("")
    setCapacity("4")
  }

  const handleStatusChange = async (table: RestaurantTable) => {
    setBusyTable(table.id)
    try {
      await onUpdateStatus(table.id, table.status === "available" ? "occupied" : "available")
    } finally {
      setBusyTable(null)
    }
  }

  return (
    <section className="flex-1 space-y-6 overflow-auto p-6">
      <div>
        <h1 className="text-2xl font-bold">Gestión de mesas</h1>
        <p className="text-sm text-muted-foreground">Consulta disponibilidad y administra la capacidad del salón.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Agregar mesa</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleCreate}>
            <Input required placeholder="Número o nombre" value={number} onChange={(event) => setNumber(event.target.value)} />
            <Input required type="number" min="1" max="50" aria-label="Capacidad" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            <Button type="submit">Crear mesa</Button>
          </form>
        </CardContent>
      </Card>
      {tables.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No hay mesas registradas.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => (
            <Card key={table.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <h2 className="font-semibold">Mesa {table.number}</h2>
                  <p className="text-sm text-muted-foreground">Capacidad: {table.capacity}</p>
                  <p className="mt-1 text-sm">{statusLabels[table.status] ?? table.status}</p>
                </div>
                <Button
                  variant={table.status === "available" ? "outline" : "secondary"}
                  disabled={busyTable === table.id || table.status === "reserved"}
                  onClick={() => handleStatusChange(table)}
                >
                  {busyTable === table.id ? "Actualizando..." : table.status === "available" ? "Ocupar" : "Liberar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
