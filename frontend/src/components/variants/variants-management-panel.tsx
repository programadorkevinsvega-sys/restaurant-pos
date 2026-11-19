"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Branch } from "@/modules/branches/domain/models"
import type { Product } from "@/modules/catalog/domain/models"
import type { ManageVariants } from "@/modules/variants/application/manage-variants"
import type {
  BranchOptionOverride,
  ProductOptionConfiguration,
  ProductOptionGroup,
  ProductOptionGroupInput,
} from "@/modules/variants/domain/models"

interface VariantsManagementPanelProps {
  products: Product[]
  branches: Branch[]
  canManage: boolean
  loading: boolean
  application: ManageVariants
}

type View = "corporate" | "branches"

export function VariantsManagementPanel({
  products, branches, canManage, loading, application,
}: VariantsManagementPanelProps) {
  const [view, setView] = useState<View>("corporate")
  const [productId, setProductId] = useState("")
  const [configuration, setConfiguration] = useState<ProductOptionConfiguration | null>(null)
  const [branchId, setBranchId] = useState("")
  const [branchRows, setBranchRows] = useState<BranchOptionOverride[]>([])
  const [branchEvents, setBranchEvents] = useState<Array<{
    sequence: string; option_name: string; group_name: string; previous_state: string
    new_state: string; reason: string; actor_email: string; occurred_at: string
  }>>([])
  const [newGroup, setNewGroup] = useState<ProductOptionGroupInput>({
    kind: "presentation", name: "", min_selections: 1, max_selections: 1, position: 0, is_active: false,
  })
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  const activeProducts = useMemo(() => products.filter((product) => product.is_active !== false), [products])

  useEffect(() => {
    if (!productId && activeProducts[0]) setProductId(activeProducts[0].id)
    if (productId && !products.some((product) => product.id === productId)) setProductId(activeProducts[0]?.id ?? "")
  }, [activeProducts, productId, products])

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id)
    if (branchId && !branches.some((branch) => branch.id === branchId)) setBranchId(branches[0]?.id ?? "")
  }, [branchId, branches])

  const loadProduct = async () => {
    if (!productId) {
      setConfiguration(null)
      return
    }
    setError("")
    setConfiguration(await application.getProductOptions(productId))
  }

  const loadBranch = async () => {
    if (!branchId) {
      setBranchRows([])
      setBranchEvents([])
      return
    }
    const result = await application.getBranchOptions(branchId)
    setBranchRows(result.options)
    setBranchEvents(result.events)
  }

  useEffect(() => {
    if (view !== "corporate" || !productId || !canManage) return
    let active = true
    application.getProductOptions(productId)
      .then((result) => { if (active) setConfiguration(result) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las variantes.") })
    return () => { active = false }
  }, [application, canManage, productId, view])

  useEffect(() => {
    if (view !== "branches" || !branchId || !canManage) return
    let active = true
    application.getBranchOptions(branchId)
      .then((result) => {
        if (!active) return
        setBranchRows(result.options)
        setBranchEvents(result.events)
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar las excepciones.") })
    return () => { active = false }
  }, [application, branchId, canManage, view])

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await action()
      setMessage(successMessage)
      if (view === "corporate") await loadProduct()
      else await loadBranch()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el cambio.")
    } finally {
      setBusy(false)
    }
  }

  const submitGroup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!productId) return
    await run(async () => { await application.createGroup(productId, newGroup) }, "Grupo creado. Agrega sus opciones para habilitarlo.")
    setNewGroup({ kind: "presentation", name: "", min_selections: 1, max_selections: 1, position: 0, is_active: false })
  }

  const saveGroupFromInputs = (group: ProductOptionGroup, isActive: boolean) => {
    const name = document.getElementById(`option-group-name-${group.id}`) as HTMLInputElement | null
    const kind = document.getElementById(`option-group-kind-${group.id}`) as HTMLSelectElement | null
    const minimum = document.getElementById(`option-group-min-${group.id}`) as HTMLInputElement | null
    const maximum = document.getElementById(`option-group-max-${group.id}`) as HTMLInputElement | null
    if (!name || !kind || !minimum || !maximum) return
    const input: ProductOptionGroupInput = {
      kind: kind.value as ProductOptionGroupInput["kind"],
      name: name.value.trim(),
      min_selections: Number(minimum.value),
      max_selections: Number(maximum.value),
      position: group.position,
      is_active: isActive,
    }
    if (!input.name || !Number.isInteger(input.min_selections) || !Number.isInteger(input.max_selections)) {
      setError("Completa el nombre y una cardinalidad válida para el grupo.")
      return
    }
    if (input.min_selections < 0 || input.max_selections < 1 || input.min_selections > input.max_selections || input.max_selections > 10) {
      setError("La cardinalidad debe cumplir 0 ≤ mínimo ≤ máximo ≤ 10 y el máximo debe ser al menos 1.")
      return
    }
    if (input.kind === "presentation" && (input.min_selections !== 1 || input.max_selections !== 1)) {
      setError("Una presentación exige exactamente una opción.")
      return
    }
    void run(() => application.updateGroup(group.id, input), "Grupo actualizado.")
  }

  const createOption = (group: ProductOptionGroup) => {
    const name = newOptionNames[group.id]?.trim()
    if (!name) return
    return run(async () => {
      await application.createOption(group.id, { name, position: group.options.length, is_active: true })
      setNewOptionNames((current) => ({ ...current, [group.id]: "" }))
    }, "Opción creada.")
  }

  const updateOption = (optionId: string, name: string, active: boolean, position: number) =>
    run(() => application.updateOption(optionId, { name, position, is_active: active }), "Opción actualizada.")

  const changeBranchOption = (row: BranchOptionOverride, enabled: boolean) => {
    const reason = reasons[row.option_id]?.trim()
    if (!reason) {
      setError("Indica el motivo de la excepción antes de guardar.")
      return
    }
    return run(
      () => application.setBranchOptionAvailability(branchId, row.option_id, enabled, reason),
      enabled ? "Opción habilitada explícitamente en la sucursal." : "Opción restringida en la sucursal.",
    )
  }

  const inheritBranchOption = (row: BranchOptionOverride) => {
    const reason = reasons[row.option_id]?.trim()
    if (!reason) {
      setError("Indica el motivo para volver a heredar la disponibilidad.")
      return
    }
    return run(
      () => application.clearBranchOptionOverride(branchId, row.option_id, reason),
      "La opción volvió a heredar la disponibilidad corporativa.",
    )
  }

  return (
    <section className="min-w-0 flex-1 space-y-4 overflow-auto p-4">
      <header>
        <h1 className="text-2xl font-semibold">Variantes y modificadores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura presentaciones y opciones del menú, y controla sus excepciones por sucursal sin duplicar el producto maestro.
        </p>
      </header>
      <div className="flex flex-wrap gap-2 border-b pb-3">
        <Button variant={view === "corporate" ? "default" : "outline"} onClick={() => setView("corporate")}>Configuración corporativa</Button>
        <Button variant={view === "branches" ? "default" : "outline"} onClick={() => setView("branches")}>Excepciones por sucursal</Button>
      </div>
      {!canManage && <p role="alert" className="rounded-md border p-4 text-sm">Solo el propietario corporativo puede administrar las variantes y sus excepciones.</p>}
      {loading && <p className="py-8 text-center text-muted-foreground">Cargando catálogo corporativo…</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-md border p-3 text-sm">{message}</p>}

      {view === "corporate" && !loading && canManage && (
        <div className="space-y-4">
          <label className="grid max-w-xl gap-1 text-sm font-medium">
            Producto del catálogo maestro
            <select className="h-10 rounded-md border bg-background px-3" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Selecciona un producto</option>
              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <form onSubmit={(event) => void submitGroup(event)} className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
            <h2 className="font-semibold md:col-span-2">Crear grupo de opciones</h2>
            <label className="grid gap-1 text-sm">Tipo
              <select className="h-10 rounded-md border bg-background px-3" value={newGroup.kind} onChange={(event) => setNewGroup((current) => ({
                ...current, kind: event.target.value as ProductOptionGroupInput["kind"],
                min_selections: event.target.value === "presentation" ? 1 : 0,
                max_selections: event.target.value === "presentation" ? 1 : 1,
              }))}>
                <option value="presentation">Presentación (obligatoria, una opción)</option>
                <option value="modifier">Modificadores (mínimo y máximo)</option>
              </select>
            </label>
            <div className="grid gap-1 text-sm"><span>Nombre del grupo</span>
              <Input id="new-option-group-name" aria-label="Nombre del grupo" value={newGroup.name} maxLength={100} onChange={(event) => setNewGroup((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Tamaño o Extras" />
            </div>
            {newGroup.kind === "modifier" && (
              <>
                <div className="grid gap-1 text-sm"><span>Mínimo de selecciones</span>
                  <Input id="new-option-group-min" aria-label="Mínimo de selecciones" type="number" min="0" max="10" value={newGroup.min_selections} onChange={(event) => setNewGroup((current) => ({ ...current, min_selections: Number(event.target.value) }))} />
                </div>
                <div className="grid gap-1 text-sm"><span>Máximo de selecciones</span>
                  <Input id="new-option-group-max" aria-label="Máximo de selecciones" type="number" min="1" max="10" value={newGroup.max_selections} onChange={(event) => setNewGroup((current) => ({ ...current, max_selections: Number(event.target.value) }))} />
                </div>
              </>
            )}
            <Button type="submit" className="md:col-span-2" disabled={busy || !productId || !newGroup.name.trim() || newGroup.min_selections > newGroup.max_selections}>
              Crear grupo
            </Button>
          </form>

          <div className="space-y-3">
            <h2 className="font-semibold">Grupos y opciones</h2>
            {configuration?.groups.length ? configuration.groups.map((group) => (
              <article key={group.id} className="space-y-3 rounded-lg border bg-card p-4">
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_110px_110px_auto] md:items-end">
                  <label htmlFor={"option-group-name-" + group.id} className="grid gap-1 text-xs text-muted-foreground">Nombre del grupo</label>
                  <Input defaultValue={group.name} maxLength={100} id={`option-group-name-${group.id}`} />
                  <label className="grid gap-1 text-xs text-muted-foreground">Tipo
                    <select className="h-10 rounded-md border bg-background px-2 text-sm" defaultValue={group.kind} id={`option-group-kind-${group.id}`}>
                      <option value="presentation">Presentación</option><option value="modifier">Modificadores</option>
                    </select>
                  </label>
                  <div className="grid gap-1 text-xs text-muted-foreground"><span>Mínimo</span>
                    <Input type="number" min="0" max="10" defaultValue={group.min_selections} id={`option-group-min-${group.id}`} aria-label={`Mínimo de ${group.name}`} />
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground"><span>Máximo</span>
                    <Input type="number" min="1" max="10" defaultValue={group.max_selections} id={`option-group-max-${group.id}`} aria-label={`Máximo de ${group.name}`} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button disabled={busy} variant="outline" onClick={() => saveGroupFromInputs(group, group.is_active)}>Guardar cambios</Button>
                    <Button disabled={busy} variant={group.is_active ? "ghost" : "default"} onClick={() => saveGroupFromInputs(group, !group.is_active)}>
                      {group.is_active ? "Desactivar" : "Habilitar"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {group.kind === "presentation" ? "El comprador debe elegir exactamente una presentación." : `Selecciones permitidas: ${group.min_selections}–${group.max_selections}.`}
                  {" · "}{group.is_active ? "Activo" : "Inactivo"}
                </p>
                <div className="space-y-2">
                  {group.options.map((option) => (
                    <OptionEditor
                      key={option.id}
                      name={option.name}
                      active={option.is_active}
                      busy={busy}
                      onSave={(name, active) => updateOption(option.id, name, active, option.position)}
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Input className="max-w-sm" value={newOptionNames[group.id] ?? ""} onChange={(event) => setNewOptionNames((current) => ({ ...current, [group.id]: event.target.value }))} placeholder="Nombre de la opción" maxLength={100} />
                    <Button variant="outline" disabled={busy || !newOptionNames[group.id]?.trim()} onClick={() => void createOption(group)}>Agregar opción</Button>
                  </div>
                </div>
              </article>
            )) : <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">Este producto aún no tiene grupos de presentaciones o modificadores.</p>}
          </div>
        </div>
      )}

      {view === "branches" && !loading && canManage && (
        <div className="space-y-4">
          <label className="grid max-w-xl gap-1 text-sm font-medium">
            Sucursal
            <select className="h-10 rounded-md border bg-background px-3" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Selecciona una sucursal</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name} ({branch.status})</option>)}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            Sin una excepción la opción hereda la disponibilidad corporativa. Cada cambio requiere un motivo y queda en el historial de esta sucursal.
          </p>
          {branchRows.map((row) => (
            <div key={row.option_id} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_140px_minmax(180px,1fr)_auto] md:items-center">
              <div>
                <p className="font-medium">{row.product_name} · {row.group_name}</p>
                <p className="text-sm">{row.option_name}</p>
                <p className="text-xs text-muted-foreground">{row.product_enabled ? "Producto habilitado en la sucursal" : "Producto excluido del surtido"} · {row.group_is_active && row.option_is_active ? "Opción corporativa activa" : "Opción corporativa inactiva"}</p>
              </div>
              <div className="text-sm">
                <p className="font-medium">{row.state === "inherited" ? "Heredado" : row.state === "enabled" ? "Habilitado localmente" : "Restringido localmente"}</p>
                <p className="text-xs text-muted-foreground">{row.effective_enabled ? "Disponible" : "No disponible"}</p>
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground"><span>Motivo de la excepción</span>
                <Input id={`branch-option-reason-${row.option_id}`} aria-label={`Motivo de excepción para ${row.option_name}`} value={reasons[row.option_id] ?? ""} maxLength={500} onChange={(event) => setReasons((current) => ({ ...current, [row.option_id]: event.target.value }))} placeholder="Motivo obligatorio" />
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" disabled={busy || !row.product_enabled || !row.group_is_active || !row.option_is_active || row.state === "enabled"} onClick={() => void changeBranchOption(row, true)}>Habilitar</Button>
                <Button size="sm" variant="outline" disabled={busy || !row.product_enabled || !row.group_is_active || !row.option_is_active || row.state === "disabled"} onClick={() => void changeBranchOption(row, false)}>Restringir</Button>
                <Button size="sm" variant="ghost" disabled={busy || row.state === "inherited"} onClick={() => void inheritBranchOption(row)}>Heredar</Button>
              </div>
            </div>
          ))}
          {!branchRows.length && <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No hay opciones configuradas para esta sucursal.</p>}
          <div className="space-y-2 border-t pt-4">
            <h2 className="font-semibold">Historial de excepciones</h2>
            {branchEvents.length ? branchEvents.map((event) => (
              <div key={event.sequence} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{event.group_name} · {event.option_name}: {event.previous_state} → {event.new_state}</p>
                <p className="text-muted-foreground">{event.reason} · {event.actor_email} · {new Date(event.occurred_at).toLocaleString()}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No hay excepciones registradas.</p>}
          </div>
        </div>
      )}
    </section>
  )
}

function OptionEditor({
  name, active, busy, onSave,
}: {
  name: string; active: boolean; busy: boolean
  onSave: (name: string, active: boolean) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(name)
  const [enabled, setEnabled] = useState(active)
  useEffect(() => { setDraft(name); setEnabled(active) }, [active, name])
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/30 p-2">
      <Input className="max-w-sm" value={draft} maxLength={100} onChange={(event) => setDraft(event.target.value)} aria-label={`Nombre de opción ${name}`} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Activa
      </label>
      <Button size="sm" variant="outline" disabled={busy || !draft.trim() || (draft === name && enabled === active)} onClick={() => void onSave(draft, enabled)}>Guardar opción</Button>
    </div>
  )
}
