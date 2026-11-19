"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Branch } from "@/modules/branches/domain/models"
import type {
  OrganizationHistoryEvent,
  OrganizationHistoryFilters,
  OrganizationHistoryPage,
  OrganizationHistoryResourceType,
} from "@/modules/organization/domain/models"

interface OrganizationHistoryPanelProps {
  branches: Branch[]
  onListHistory: (filters: OrganizationHistoryFilters) => Promise<OrganizationHistoryPage>
  canViewHistory: boolean
}

const resourceLabels: Record<OrganizationHistoryResourceType, string> = {
  organization: "Organización",
  legal_entity: "Entidad legal",
  branch: "Sucursal",
  branch_legal_entity: "Relación sucursal / entidad legal",
}

const actionLabels: Record<string, string> = {
  created: "Creado",
  updated: "Actualizado",
  associated: "Entidad legal asociada",
  disassociated: "Entidad legal retirada",
  "branch.lifecycle.changed": "Cambio de estado",
  "configuration.updated": "Configuración local actualizada",
  "calendar.upserted": "Excepción de calendario guardada",
  "calendar.deleted": "Excepción de calendario eliminada",
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

const historyFieldLabels: Record<string, string> = {
  name: "Nombre",
  commercial_name: "Nombre comercial",
  contact_email: "Correo de contacto",
  contact_phone: "Teléfono de contacto",
  website_url: "Sitio web",
  headquarters_address: "Domicilio corporativo",
  line_1: "Dirección",
  line_2: "Complemento",
  locality: "Ciudad o localidad",
  administrative_area: "Departamento o región",
  postal_code: "Código postal",
  country_code: "País",
  legal_name: "Razón social",
  tax_country_code: "País de identificación",
  tax_identifier_type: "Tipo de identificación tributaria",
  tax_identifier: "Identificación tributaria (enmascarada)",
  registered_address: "Domicilio registrado",
  code: "Código de sucursal",
  status: "Estado",
  branch_id: "Sucursal",
  legal_entity_id: "Entidad legal",
  branch_code: "Código de sucursal",
  operational_address: "Dirección operativa",
  time_zone: "Zona horaria",
  currency_code: "Moneda declarada",
  weekly_hours: "Horario semanal",
  local_date: "Fecha local",
  kind: "Tipo de excepción",
  reason: "Motivo",
  opens_at: "Hora de apertura",
  closes_at: "Hora de cierre",
  closes_next_day: "Cierra al día siguiente",
  weekday: "Día de la semana",
}

function humanizeHistoryField(key: string) {
  return historyFieldLabels[key] ?? key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())
}

function formatHistoryValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Sin dato"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (Array.isArray(value)) return value.map((item) => formatHistoryValue(item)).join(" · ")
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${humanizeHistoryField(key)}: ${formatHistoryValue(nested)}`)
      .join(" · ")
  }
  return String(value)
}

function SnapshotDetails({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <p className="text-sm text-muted-foreground">Sin información anterior o posterior.</p>
  const entries = Object.entries(value)
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Sin cambios registrados.</p>

  return (
    <dl className="grid gap-2">
      {entries.map(([key, current]) => (
        <div key={key} className="grid gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">{humanizeHistoryField(key)}</dt>
          <dd className="break-words text-sm">{formatHistoryValue(current)}</dd>
        </div>
      ))}
    </dl>
  )
}

function HistoryEventCard({
  event,
  branchLabel,
}: {
  event: OrganizationHistoryEvent
  branchLabel?: string
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">
            {actionLabels[event.action] ?? event.action}
          </CardTitle>
          <time className="text-xs text-muted-foreground" dateTime={event.occurred_at}>
            {formatDate(event.occurred_at)}
          </time>
        </div>
        <p className="text-sm text-muted-foreground">
          {resourceLabels[event.resource_type]}
          {event.actor_email ? ` · ${event.actor_email}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {event.branch_id && (
          <p className="text-muted-foreground">Sucursal: {branchLabel ?? event.branch_id}</p>
        )}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer font-medium">Ver estado anterior y nuevo</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Anterior</p>
              <SnapshotDetails value={event.before_state} />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nuevo</p>
              <SnapshotDetails value={event.after_state} />
            </div>
          </div>
          {Object.keys(event.metadata).length > 0 && (
            <p className="mt-3 break-words text-xs text-muted-foreground">
              <SnapshotDetails value={event.metadata} />
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  )
}

export function OrganizationHistoryPanel({
  branches,
  onListHistory,
  canViewHistory,
}: OrganizationHistoryPanelProps) {
  const [resourceType, setResourceType] = useState<OrganizationHistoryResourceType | "all">("all")
  const [branchId, setBranchId] = useState("all")
  const [events, setEvents] = useState<OrganizationHistoryEvent[]>([])
  const [nextCursor, setNextCursor] = useState<OrganizationHistoryPage["next_cursor"]>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!canViewHistory) {
      setLoading(false)
      setEvents([])
      setNextCursor(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setEvents([])
    setNextCursor(null)

    const filters: OrganizationHistoryFilters = {
      limit: 50,
      ...(resourceType === "all" ? {} : { resource_type: resourceType }),
      ...(branchId === "all" ? {} : { branch_id: branchId }),
    }

    onListHistory(filters)
      .then((page) => {
        if (cancelled) return
        setEvents(page.events)
        setNextCursor(page.next_cursor)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [branchId, canViewHistory, onListHistory, resourceType])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await onListHistory({
        limit: 50,
        ...(resourceType === "all" ? {} : { resource_type: resourceType }),
        ...(branchId === "all" ? {} : { branch_id: branchId }),
        before_at: nextCursor.before_at,
        before_id: nextCursor.before_id,
      })
      setEvents((current) => [...current, ...page.events])
      setNextCursor(page.next_cursor)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el siguiente bloque.")
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Historial organizacional</h2>
        <p className="text-sm text-muted-foreground">
          Consulta quién realizó cambios en la organización, las entidades legales, las sucursales y sus relaciones.
        </p>
        <p className="text-xs text-muted-foreground">
          Los cambios de estado y la configuración local reutilizan sus bitácoras originales. Los datos tributarios se muestran enmascarados.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="grid flex-1 gap-1 text-sm">
          Tipo de recurso
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={resourceType}
            disabled={loading || loadingMore}
            onChange={(event) => setResourceType(event.target.value as OrganizationHistoryResourceType | "all")}
          >
            <option value="all">Todos los recursos</option>
            <option value="organization">Organización</option>
            <option value="legal_entity">Entidades legales</option>
            <option value="branch">Sucursales</option>
            <option value="branch_legal_entity">Relaciones sucursal / entidad</option>
          </select>
        </label>
        <label className="grid flex-1 gap-1 text-sm">
          Sucursal
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={branchId}
            disabled={loading || loadingMore}
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="all">Todas las sucursales</option>
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>{branch.code} · {branch.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!canViewHistory ? (
        <p className="text-sm text-muted-foreground">
          Solo el propietario corporativo registrado puede consultar el historial organizacional.
        </p>
      ) : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {canViewHistory && loading ? (
        <p className="text-sm text-muted-foreground">Cargando historial…</p>
      ) : canViewHistory && events.length > 0 ? (
        <>
          <div className="grid gap-3">
            {events.map((event) => {
              const branch = branches.find((item) => item.id === event.branch_id)
              return (
                <HistoryEventCard
                  key={event.id}
                  event={event}
                  branchLabel={branch ? `${branch.code} · ${branch.name}` : undefined}
                />
              )
            })}
          </div>
          {nextCursor && (
            <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </>
      ) : canViewHistory && !loading && !error ? (
        <p className="text-sm text-muted-foreground">No hay cambios registrados para estos filtros.</p>
      ) : null}
    </section>
  )
}
