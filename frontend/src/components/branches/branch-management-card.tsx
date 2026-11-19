"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Branch, BranchInput, BranchUpdate } from "@/modules/branches/domain/models"
import type { LegalEntity } from "@/modules/legal-entities/domain/models"

interface BranchManagementCardProps {
  branches: Branch[]
  legalEntities: LegalEntity[]
  loading: boolean
  canManage: boolean
  onCreate: (input: BranchInput) => Promise<void>
  onUpdate: (id: string, input: BranchUpdate) => Promise<void>
  onAssign: (branchId: string, legalEntityId: string) => Promise<void>
  onRemove: (branchId: string, legalEntityId: string) => Promise<void>
}

export function BranchManagementCard({
  branches,
  legalEntities,
  loading,
  canManage,
  onCreate,
  onUpdate,
  onAssign,
  onRemove,
}: BranchManagementCardProps) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [selectedLegalEntityIds, setSelectedLegalEntityIds] = useState<string[]>([])
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!editingBranch) {
      setCode("")
      setName("")
      setSelectedLegalEntityIds([])
    }
  }, [editingBranch])

  const toggleLegalEntity = (id: string, checked: boolean) => {
    setSelectedLegalEntityIds((current) => checked
      ? [...current, id]
      : current.filter((value) => value !== id))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      if (editingBranch) {
        await onUpdate(editingBranch.id, { code: code.trim().toUpperCase(), name: name.trim() })
      } else {
        await onCreate({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          legal_entity_ids: selectedLegalEntityIds,
        })
      }
      setEditingBranch(null)
      setCode("")
      setName("")
      setSelectedLegalEntityIds([])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la sucursal.")
    } finally {
      setBusy(false)
    }
  }

  const runAssociation = async (operation: () => Promise<void>) => {
    setBusy(true)
    setMessage("")
    try {
      await operation()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar la relación con la entidad legal.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sucursales y entidades legales asociadas</CardTitle>
        <p className="text-sm text-muted-foreground">
          Una sucursal puede operar con una o varias entidades legales. Cada asociación pertenece a la misma organización.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando sucursales…</p>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => {
              const availableEntities = legalEntities.filter(
                (entity) => !branch.legal_entities.some((assigned) => assigned.id === entity.id),
              )
              const selectedId = assignmentSelections[branch.id] ?? ""
              return (
                <article key={branch.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{branch.name}</p>
                      <p className="text-sm text-muted-foreground">Código: {branch.code}</p>
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditingBranch(branch)
                          setCode(branch.code)
                          setName(branch.name)
                          setSelectedLegalEntityIds([])
                          setMessage("")
                        }}
                      >
                        Editar identidad
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Entidades legales habilitadas
                    </p>
                    {branch.legal_entities.map((entity) => (
                      <div key={entity.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          {entity.legal_name} · {entity.tax_identifier_type} {entity.tax_identifier}
                        </span>
                        {canManage && branch.legal_entities.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void runAssociation(() => onRemove(branch.id, entity.id))}
                          >
                            Retirar
                          </Button>
                        )}
                      </div>
                    ))}
                    {branch.legal_entities.length === 1 && (
                      <p className="text-xs text-muted-foreground">
                        Debe conservar al menos una entidad legal asociada.
                      </p>
                    )}
                  </div>
                  {canManage && availableEntities.length > 0 && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        aria-label={`Nueva entidad legal para ${branch.name}`}
                        className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                        value={selectedId}
                        onChange={(event) => setAssignmentSelections((current) => ({
                          ...current,
                          [branch.id]: event.target.value,
                        }))}
                        disabled={busy}
                      >
                        <option value="">Seleccionar entidad legal para asociar</option>
                        {availableEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.legal_name} · {entity.tax_identifier_type} {entity.tax_identifier}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || !selectedId}
                        onClick={() => void runAssociation(async () => {
                          await onAssign(branch.id, selectedId)
                          setAssignmentSelections((current) => ({ ...current, [branch.id]: "" }))
                        })}
                      >
                        Asociar
                      </Button>
                    </div>
                  )}
                </article>
              )
            })}
            {branches.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay sucursales registradas.</p>
            )}
          </div>
        )}

        {canManage ? (
          <form className="space-y-4 border-t pt-5" onSubmit={submit}>
            <h3 className="text-sm font-semibold">
              {editingBranch ? "Editar identidad de sucursal" : "Registrar sucursal"}
            </h3>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="branch-code">Código</Label>
                <Input
                  id="branch-code"
                  required
                  minLength={2}
                  maxLength={32}
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="branch-name">Nombre de sucursal</Label>
                <Input
                  id="branch-name"
                  required
                  minLength={2}
                  maxLength={160}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            {!editingBranch && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Entidades legales habilitadas en esta sucursal</legend>
                {legalEntities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Primero registra al menos una entidad legal.</p>
                ) : (
                  legalEntities.map((entity) => (
                    <label key={entity.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedLegalEntityIds.includes(entity.id)}
                        onChange={(event) => toggleLegalEntity(entity.id, event.target.checked)}
                        disabled={busy}
                        className="mt-1"
                      />
                      <span>{entity.legal_name} · {entity.tax_identifier_type} {entity.tax_identifier}</span>
                    </label>
                  ))
                )}
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                disabled={busy || (editingBranch ? false : selectedLegalEntityIds.length === 0)}
              >
                {busy ? "Guardando…" : editingBranch ? "Guardar sucursal" : "Registrar sucursal"}
              </Button>
              {editingBranch && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditingBranch(null)}>
                  Cancelar edición
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Solo el propietario corporativo registrado puede crear sucursales o modificar sus asociaciones legales.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
