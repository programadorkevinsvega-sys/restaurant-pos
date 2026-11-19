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

function stateSummary(value: Record<string, unknown> | null) {
  if (!value) return "—"
  return Object.entries(value)
    .map(([key, current]) => `${key}: ${typeof current === "string" ? current : JSON.stringify(current)}`)
    .join(" · ")
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
              <p className="break-words">{stateSummary(event.before_state)}</p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Nuevo</p>
              <p className="break-words">{stateSummary(event.after_state)}</p>
            </div>
          </div>
          {Object.keys(event.metadata).length > 0 && (
            <p className="mt-3 break-words text-xs text-muted-foreground">
              {stateSummary(event.metadata)}
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
            {events.map((event) => (
              <HistoryEventCard
                key={event.id}
                event={event}
                branchLabel={branches.find((branch) => branch.id === event.branch_id)
                  ? (() => {
                    const branch = branches.find((item) => item.id === event.branch_id)
                    return branch ? `${branch.code} · ${branch.name}` : undefined
                  })()
                  : undefined}
              />
            ))}
          </div>
          {nextCursor && (
            <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Cargando…" : "Cargar más"}
            </Button>
          )}
        </>
      ) : canViewHistory && !loading ? (
        <p className="text-sm text-muted-foreground">No hay cambios registrados para estos filtros.</p>
      ) : null}
    </section>
  )
}
