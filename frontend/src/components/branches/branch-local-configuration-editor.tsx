"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  Branch,
  BranchCalendarException,
  BranchCalendarExceptionInput,
  BranchLocalConfiguration,
  BranchOpeningPeriod,
  BranchWeeklyHour,
} from "@/modules/branches/domain/models"

interface BranchLocalConfigurationEditorProps {
  branch: Branch
  canManage: boolean
  onSaveConfiguration: (branchId: string, input: BranchLocalConfiguration) => Promise<void>
  onListCalendar: (branchId: string, from: string, to: string) => Promise<BranchCalendarException[]>
  onSaveCalendarException: (
    branchId: string,
    localDate: string,
    input: BranchCalendarExceptionInput,
  ) => Promise<void>
  onDeleteCalendarException: (branchId: string, localDate: string) => Promise<void>
}

const weekdays = [
  "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo",
]

type EditableOpeningPeriod = BranchOpeningPeriod & { localId: string }
type EditableWeeklyHour = BranchWeeklyHour & { localId: string }

function createLocalId() {
  return globalThis.crypto.randomUUID()
}

const emptyPeriod = (): EditableOpeningPeriod => ({
  localId: createLocalId(),
  opens_at: "09:00",
  closes_at: "18:00",
  closes_next_day: false,
})

function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function calendarRange() {
  const from = new Date()
  const to = new Date(from)
  to.setDate(to.getDate() + 90)
  return { from: localDate(from), to: localDate(to) }
}

function addressValue(branch: Branch) {
  return {
    line_1: branch.operational_address?.line_1 ?? "",
    line_2: branch.operational_address?.line_2 ?? "",
    locality: branch.operational_address?.locality ?? "",
    administrative_area: branch.operational_address?.administrative_area ?? "",
    postal_code: branch.operational_address?.postal_code ?? "",
    country_code: branch.operational_address?.country_code ?? "",
  }
}

export function BranchLocalConfigurationEditor({
  branch,
  canManage,
  onSaveConfiguration,
  onListCalendar,
  onSaveCalendarException,
  onDeleteCalendarException,
}: BranchLocalConfigurationEditorProps) {
  const [expanded, setExpanded] = useState(false)
  const [address, setAddress] = useState(() => addressValue(branch))
  const [timeZone, setTimeZone] = useState(branch.time_zone ?? "")
  const [currencyCode, setCurrencyCode] = useState(branch.currency_code ?? "")
  const [weeklyHours, setWeeklyHours] = useState<EditableWeeklyHour[]>(() => (
    (branch.weekly_hours ?? []).map((period) => ({ ...period, localId: createLocalId() }))
  ))
  const [exceptions, setExceptions] = useState<BranchCalendarException[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [exceptionDate, setExceptionDate] = useState(() => localDate(new Date()))
  const [exceptionKind, setExceptionKind] = useState<"closed" | "special_hours">("closed")
  const [exceptionPeriods, setExceptionPeriods] = useState<EditableOpeningPeriod[]>([emptyPeriod()])
  const [exceptionReason, setExceptionReason] = useState("")

  const loadCalendar = async () => {
    setCalendarLoading(true)
    setMessage("")
    try {
      const range = calendarRange()
      const result = await onListCalendar(branch.id, range.from, range.to)
      setExceptions(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo consultar el calendario.")
    } finally {
      setCalendarLoading(false)
    }
  }

  const toggleExpanded = () => {
    const next = !expanded
    setExpanded(next)
    if (next) void loadCalendar()
  }

  const updateAddress = (field: keyof typeof address, value: string) => {
    setAddress((current) => ({ ...current, [field]: field === "country_code" ? value.toUpperCase() : value }))
  }

  const updateWeeklyPeriod = (index: number, field: keyof BranchWeeklyHour, value: string | number | boolean) => {
    setWeeklyHours((current) => current.map((period, position) => {
      if (position !== index) return period
      if (field === "weekday") return { ...period, weekday: value as number }
      if (field === "opens_at") return { ...period, opens_at: value as string }
      if (field === "closes_at") return { ...period, closes_at: value as string }
      return { ...period, closes_next_day: value as boolean }
    }))
  }

  const submitConfiguration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    const hasAddress = Object.values(address).some((value) => value.trim().length > 0)
    const input: BranchLocalConfiguration = {
      operational_address: hasAddress ? {
        line_1: address.line_1.trim(),
        line_2: address.line_2.trim() || null,
        locality: address.locality.trim(),
        administrative_area: address.administrative_area.trim() || null,
        postal_code: address.postal_code.trim() || null,
        country_code: address.country_code.trim().toUpperCase(),
      } : null,
      time_zone: timeZone.trim() || null,
      currency_code: currencyCode.trim().toUpperCase() || null,
      weekly_hours: weeklyHours.map(({ localId, ...period }) => period),
    }
    try {
      await onSaveConfiguration(branch.id, input)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuración.")
    } finally {
      setSaving(false)
    }
  }

  const updateExceptionPeriod = (
    index: number,
    field: keyof BranchOpeningPeriod,
    value: string | boolean,
  ) => {
    setExceptionPeriods((current) => current.map((period, position) => {
      if (position !== index) return period
      if (field === "opens_at") return { ...period, opens_at: value as string }
      if (field === "closes_at") return { ...period, closes_at: value as string }
      return { ...period, closes_next_day: value as boolean }
    }))
  }

  const submitException = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    const input: BranchCalendarExceptionInput = {
      kind: exceptionKind,
      periods: exceptionKind === "closed"
        ? []
        : exceptionPeriods.map(({ localId, ...period }) => period),
      reason: exceptionReason.trim(),
    }
    try {
      await onSaveCalendarException(branch.id, exceptionDate, input)
      setExceptionReason("")
      await loadCalendar()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la excepción.")
    } finally {
      setSaving(false)
    }
  }

  const removeException = async (localDateValue: string) => {
    setSaving(true)
    setMessage("")
    try {
      await onDeleteCalendarException(branch.id, localDateValue)
      await loadCalendar()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar la excepción.")
    } finally {
      setSaving(false)
    }
  }

  const editable = canManage && branch.status === "active"

  return (
    <section className="border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Dirección y parámetros locales
          </p>
          <p className="text-xs text-muted-foreground">
            {branch.time_zone ?? "Zona horaria sin configurar"}
            {branch.currency_code ? ` · ${branch.currency_code}` : " · Moneda sin configurar"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={toggleExpanded}>
          {expanded ? "Ocultar" : "Configurar"}
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4">
          {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
          <form className="space-y-4" onSubmit={submitConfiguration}>
            <fieldset disabled={!editable || saving} className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor={`branch-address-${branch.id}`}>Dirección operativa del local</Label>
                  <Input
                    id={`branch-address-${branch.id}`}
                    value={address.line_1}
                    onChange={(event) => updateAddress("line_1", event.target.value)}
                    maxLength={180}
                    placeholder="Calle, carrera, número o dirección"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-address-line2-${branch.id}`}>Complemento</Label>
                  <Input
                    id={`branch-address-line2-${branch.id}`}
                    value={address.line_2}
                    onChange={(event) => updateAddress("line_2", event.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-locality-${branch.id}`}>Ciudad / localidad</Label>
                  <Input
                    id={`branch-locality-${branch.id}`}
                    value={address.locality}
                    onChange={(event) => updateAddress("locality", event.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-region-${branch.id}`}>Departamento / región</Label>
                  <Input
                    id={`branch-region-${branch.id}`}
                    value={address.administrative_area}
                    onChange={(event) => updateAddress("administrative_area", event.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-postal-${branch.id}`}>Código postal</Label>
                  <Input
                    id={`branch-postal-${branch.id}`}
                    value={address.postal_code}
                    onChange={(event) => updateAddress("postal_code", event.target.value)}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-country-${branch.id}`}>País (ISO alpha-2)</Label>
                  <Input
                    id={`branch-country-${branch.id}`}
                    value={address.country_code}
                    onChange={(event) => updateAddress("country_code", event.target.value)}
                    minLength={2}
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-timezone-${branch.id}`}>Zona horaria IANA</Label>
                  <Input
                    id={`branch-timezone-${branch.id}`}
                    value={timeZone}
                    onChange={(event) => setTimeZone(event.target.value)}
                    maxLength={100}
                    placeholder="America/Bogota"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`branch-currency-${branch.id}`}>Moneda (ISO 4217)</Label>
                  <Input
                    id={`branch-currency-${branch.id}`}
                    value={currencyCode}
                    onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())}
                    minLength={3}
                    maxLength={3}
                    placeholder="COP"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Horario semanal (hora local)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={weeklyHours.length >= 35}
                    onClick={() => setWeeklyHours((current) => [...current, { weekday: 1, ...emptyPeriod() }])}
                  >
                    Añadir intervalo
                  </Button>
                </div>
                {weeklyHours.map((period, index) => (
                  <div key={period.localId} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label>Día</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={period.weekday}
                        onChange={(event) => updateWeeklyPeriod(index, "weekday", Number(event.target.value))}
                      >
                        {weekdays.map((day, dayIndex) => <option key={day} value={dayIndex + 1}>{day}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Abre</Label>
                      <Input type="time" value={period.opens_at} onChange={(event) => updateWeeklyPeriod(index, "opens_at", event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cierra</Label>
                      <Input type="time" value={period.closes_at} onChange={(event) => updateWeeklyPeriod(index, "closes_at", event.target.value)} />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-xs">
                      <input
                        type="checkbox"
                        checked={period.closes_next_day}
                        onChange={(event) => updateWeeklyPeriod(index, "closes_next_day", event.target.checked)}
                      />
                      Día siguiente
                    </label>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setWeeklyHours((current) => current.filter((_, position) => position !== index))}>
                      Quitar
                    </Button>
                  </div>
                ))}
                {weeklyHours.length === 0 && (
                  <p className="text-xs text-muted-foreground">No se ha definido un horario semanal.</p>
                )}
              </div>
            </fieldset>

            <p className="text-xs text-muted-foreground">
              La dirección es la del establecimiento, independiente del domicilio fiscal de la entidad legal.
              La zona horaria y moneda se almacenan como parámetros locales; todavía no alteran la precedencia fiscal/contable,
              conversiones monetarias ni reglas de corte.
            </p>
            {editable && (
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando…" : "Guardar configuración local"}
              </Button>
            )}
            {!editable && (
              <p className="text-xs text-muted-foreground">
                La sucursal está en modo de solo lectura. Su configuración y calendario se conservan para consulta.
              </p>
            )}
          </form>

          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Excepciones del calendario</p>
                <p className="text-xs text-muted-foreground">Consulta los próximos 90 días en fechas locales de la sucursal.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadCalendar()} disabled={calendarLoading}>
                Actualizar
              </Button>
            </div>
            {editable && (
              <form className="space-y-3 rounded-md border p-3" onSubmit={submitException}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`branch-exception-date-${branch.id}`}>Fecha local</Label>
                    <Input
                      id={`branch-exception-date-${branch.id}`}
                      type="date"
                      required
                      min={calendarRange().from}
                      max={calendarRange().to}
                      value={exceptionDate}
                      onChange={(event) => setExceptionDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipo</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={exceptionKind}
                      onChange={(event) => setExceptionKind(event.target.value as "closed" | "special_hours")}
                    >
                      <option value="closed">Cerrado</option>
                      <option value="special_hours">Horario especial</option>
                    </select>
                  </div>
                </div>
                {exceptionKind === "special_hours" && exceptionPeriods.map((period, index) => (
                  <div key={period.localId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                    <div className="space-y-1">
                      <Label>Abre</Label>
                      <Input type="time" value={period.opens_at} onChange={(event) => updateExceptionPeriod(index, "opens_at", event.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cierra</Label>
                      <Input type="time" value={period.closes_at} onChange={(event) => updateExceptionPeriod(index, "closes_at", event.target.value)} />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-xs">
                      <input
                        type="checkbox"
                        checked={period.closes_next_day}
                        onChange={(event) => updateExceptionPeriod(index, "closes_next_day", event.target.checked)}
                      />
                      Día siguiente
                    </label>
                    <Button type="button" size="sm" variant="ghost" disabled={exceptionPeriods.length === 1} onClick={() => setExceptionPeriods((current) => current.filter((_, position) => position !== index))}>
                      Quitar
                    </Button>
                  </div>
                ))}
                {exceptionKind === "special_hours" && exceptionPeriods.length < 5 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setExceptionPeriods((current) => [...current, emptyPeriod()])}>
                    Añadir intervalo especial
                  </Button>
                )}
                <div className="space-y-1">
                  <Label htmlFor={`branch-exception-reason-${branch.id}`}>Motivo</Label>
                  <Input
                    id={`branch-exception-reason-${branch.id}`}
                    required
                    minLength={1}
                    maxLength={500}
                    value={exceptionReason}
                    onChange={(event) => setExceptionReason(event.target.value)}
                    placeholder="Festivo local, mantenimiento, evento…"
                  />
                </div>
                <Button type="submit" disabled={saving || !timeZone.trim()}>
                  {saving ? "Guardando…" : "Guardar excepción"}
                </Button>
                {!timeZone.trim() && <p className="text-xs text-muted-foreground">Configura primero la zona horaria de la sucursal.</p>}
              </form>
            )}
            {calendarLoading ? (
              <p className="text-sm text-muted-foreground">Cargando calendario…</p>
            ) : exceptions.length > 0 ? (
              <div className="space-y-2">
                {exceptions.map((exception) => (
                  <div key={exception.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <div>
                      <p className="font-medium">{exception.local_date} · {exception.kind === "closed" ? "Cerrado" : "Horario especial"}</p>
                      <p className="text-xs text-muted-foreground">{exception.reason}</p>
                      {exception.periods.map((period, index) => (
                        <p key={`${exception.local_date}-${period.opens_at}-${period.closes_at}-${period.closes_next_day}`} className="text-xs text-muted-foreground">
                          {period.opens_at}–{period.closes_at}{period.closes_next_day ? " (día siguiente)" : ""}
                        </p>
                      ))}
                    </div>
                    {editable && (
                      <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => void removeException(exception.local_date)}>
                        Eliminar
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay excepciones registradas en el rango consultado.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Los festivos no se importan automáticamente. Cada excepción se registra explícitamente con su motivo.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
