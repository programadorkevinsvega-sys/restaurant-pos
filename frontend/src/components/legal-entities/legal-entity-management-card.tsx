"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LegalEntity, LegalEntityInput } from "@/modules/legal-entities/domain/models"

interface LegalEntityManagementCardProps {
  legalEntities: LegalEntity[]
  loading: boolean
  canManage: boolean
  onCreate: (input: LegalEntityInput) => Promise<void>
  onUpdate: (id: string, input: LegalEntityInput) => Promise<void>
}

interface LegalEntityFormState {
  legal_name: string
  commercial_name: string
  tax_country_code: string
  tax_identifier_type: string
  tax_identifier: string
  contact_email: string
  contact_phone: string
  address_line_1: string
  address_line_2: string
  address_locality: string
  address_region: string
  address_postal_code: string
}

const initialForm: LegalEntityFormState = {
  legal_name: "",
  commercial_name: "",
  tax_country_code: "CO",
  tax_identifier_type: "NIT",
  tax_identifier: "",
  contact_email: "",
  contact_phone: "",
  address_line_1: "",
  address_line_2: "",
  address_locality: "",
  address_region: "",
  address_postal_code: "",
}

function toFormState(entity: LegalEntity): LegalEntityFormState {
  const address = entity.registered_address
  return {
    legal_name: entity.legal_name,
    commercial_name: entity.commercial_name ?? "",
    tax_country_code: entity.tax_country_code,
    tax_identifier_type: entity.tax_identifier_type,
    tax_identifier: entity.tax_identifier,
    contact_email: entity.contact_email ?? "",
    contact_phone: entity.contact_phone ?? "",
    address_line_1: address?.line_1 ?? "",
    address_line_2: address?.line_2 ?? "",
    address_locality: address?.locality ?? "",
    address_region: address?.administrative_area ?? "",
    address_postal_code: address?.postal_code ?? "",
  }
}

function toInput(form: LegalEntityFormState): LegalEntityInput {
  const registeredAddress = {
    line_1: form.address_line_1.trim() || null,
    line_2: form.address_line_2.trim() || null,
    locality: form.address_locality.trim() || null,
    administrative_area: form.address_region.trim() || null,
    postal_code: form.address_postal_code.trim() || null,
    country_code: form.tax_country_code.trim().toUpperCase() || null,
  }
  const hasAddress = Object.values(registeredAddress).some((value) => value !== null)

  return {
    legal_name: form.legal_name.trim(),
    commercial_name: form.commercial_name.trim() || null,
    tax_country_code: form.tax_country_code.trim().toUpperCase(),
    tax_identifier_type: form.tax_identifier_type.trim().toUpperCase(),
    tax_identifier: form.tax_identifier.trim(),
    contact_email: form.contact_email.trim().toLowerCase() || null,
    contact_phone: form.contact_phone.trim() || null,
    registered_address: hasAddress ? registeredAddress : null,
  }
}

export function LegalEntityManagementCard({
  legalEntities,
  loading,
  canManage,
  onCreate,
  onUpdate,
}: LegalEntityManagementCardProps) {
  const [form, setForm] = useState<LegalEntityFormState>(initialForm)
  const [editing, setEditing] = useState<LegalEntity | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!editing) setForm(initialForm)
  }, [editing])

  const updateField = (field: keyof LegalEntityFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    try {
      const input = toInput(form)
      if (editing) await onUpdate(editing.id, input)
      else await onCreate(input)
      setEditing(null)
      setForm(initialForm)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la entidad legal.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entidades legales y NIT</CardTitle>
        <p className="text-sm text-muted-foreground">
          Registra cada persona jurídica que factura, declara impuestos y mantiene su propia contabilidad.
          La misma organización puede tener varias.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando entidades legales…</p>
        ) : (
          <div className="space-y-3">
            {legalEntities.map((entity) => (
              <article key={entity.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{entity.legal_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {entity.tax_country_code} · {entity.tax_identifier_type}: {entity.tax_identifier}
                  </p>
                  {entity.commercial_name && <p className="text-sm">{entity.commercial_name}</p>}
                  <p className="text-xs text-muted-foreground">
                    Asociada a {entity.branch_count} {entity.branch_count === 1 ? "sucursal" : "sucursales"}
                  </p>
                </div>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditing(entity)
                      setForm(toFormState(entity))
                      setMessage("")
                    }}
                  >
                    Editar
                  </Button>
                )}
              </article>
            ))}
            {legalEntities.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay entidades legales registradas.</p>
            )}
          </div>
        )}

        {canManage ? (
          <form className="space-y-4 border-t pt-5" onSubmit={submit}>
            <h3 className="text-sm font-semibold">
              {editing ? "Editar entidad legal" : "Registrar entidad legal"}
            </h3>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="legal-entity-name">Razón social / nombre legal</Label>
                <Input
                  id="legal-entity-name"
                  required
                  minLength={2}
                  maxLength={180}
                  value={form.legal_name}
                  onChange={(event) => updateField("legal_name", event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-commercial-name">Nombre comercial</Label>
                <Input
                  id="legal-entity-commercial-name"
                  maxLength={180}
                  value={form.commercial_name}
                  onChange={(event) => updateField("commercial_name", event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-country">País emisor (ISO alpha-2)</Label>
                <Input
                  id="legal-entity-country"
                  required
                  minLength={2}
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  value={form.tax_country_code}
                  onChange={(event) => updateField("tax_country_code", event.target.value.toUpperCase())}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-id-type">Tipo de identificación tributaria</Label>
                <Input
                  id="legal-entity-id-type"
                  required
                  minLength={2}
                  maxLength={24}
                  placeholder="NIT, RFC, RUC, TIN…"
                  value={form.tax_identifier_type}
                  onChange={(event) => updateField("tax_identifier_type", event.target.value.toUpperCase())}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-id-value">Número de identificación tributaria</Label>
                <Input
                  id="legal-entity-id-value"
                  required
                  maxLength={80}
                  value={form.tax_identifier}
                  onChange={(event) => updateField("tax_identifier", event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-email">Correo de contacto</Label>
                <Input
                  id="legal-entity-email"
                  type="email"
                  maxLength={254}
                  value={form.contact_email}
                  onChange={(event) => updateField("contact_email", event.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="legal-entity-phone">Teléfono de contacto</Label>
                <Input
                  id="legal-entity-phone"
                  type="tel"
                  minLength={7}
                  maxLength={32}
                  value={form.contact_phone}
                  onChange={(event) => updateField("contact_phone", event.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Domicilio registrado (opcional)</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <Input aria-label="Dirección registrada" placeholder="Dirección" maxLength={160} value={form.address_line_1} onChange={(event) => updateField("address_line_1", event.target.value)} disabled={busy} />
                <Input aria-label="Complemento de dirección" placeholder="Complemento" maxLength={160} value={form.address_line_2} onChange={(event) => updateField("address_line_2", event.target.value)} disabled={busy} />
                <Input aria-label="Ciudad registrada" placeholder="Ciudad o localidad" maxLength={120} value={form.address_locality} onChange={(event) => updateField("address_locality", event.target.value)} disabled={busy} />
                <Input aria-label="Región registrada" placeholder="Departamento o región" maxLength={120} value={form.address_region} onChange={(event) => updateField("address_region", event.target.value)} disabled={busy} />
                <Input aria-label="Código postal registrado" placeholder="Código postal" maxLength={32} value={form.address_postal_code} onChange={(event) => updateField("address_postal_code", event.target.value)} disabled={busy} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : editing ? "Guardar entidad legal" : "Registrar entidad legal"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>
                  Cancelar edición
                </Button>
              )}
            </div>
          </form>
        ) : (
          <p className="border-t pt-4 text-sm text-muted-foreground">
            Solo el propietario corporativo registrado puede crear o modificar entidades legales.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
