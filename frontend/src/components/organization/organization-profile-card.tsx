"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationProfileUpdate,
} from "@/modules/organization/domain/models"

interface OrganizationProfileCardProps {
  organization: OrganizationProfile | null
  loading: boolean
  canUpdate: boolean
  canBootstrap: boolean
  onBootstrap: (input: OrganizationProfileInput) => Promise<void>
  onUpdate: (input: OrganizationProfileUpdate) => Promise<void>
}

interface ProfileFormState {
  name: string
  commercial_name: string
  contact_email: string
  contact_phone: string
  website_url: string
  line_1: string
  line_2: string
  locality: string
  administrative_area: string
  postal_code: string
  country_code: string
}


function toFormState(organization: OrganizationProfile | null): ProfileFormState {
  const address = organization?.headquarters_address
  return {
    name: organization?.name ?? "",
    commercial_name: organization?.commercial_name ?? "",
    contact_email: organization?.contact_email ?? "",
    contact_phone: organization?.contact_phone ?? "",
    website_url: organization?.website_url ?? "",
    line_1: address?.line_1 ?? "",
    line_2: address?.line_2 ?? "",
    locality: address?.locality ?? "",
    administrative_area: address?.administrative_area ?? "",
    postal_code: address?.postal_code ?? "",
    country_code: address?.country_code ?? "",
  }
}

function toProfileInput(form: ProfileFormState): OrganizationProfileInput {
  const address = {
    line_1: form.line_1.trim() || null,
    line_2: form.line_2.trim() || null,
    locality: form.locality.trim() || null,
    administrative_area: form.administrative_area.trim() || null,
    postal_code: form.postal_code.trim() || null,
    country_code: form.country_code.trim().toUpperCase() || null,
  }
  const hasAddress = Object.values(address).some((value) => value !== null)

  return {
    name: form.name.trim(),
    commercial_name: form.commercial_name.trim() || null,
    contact_email: form.contact_email.trim().toLowerCase() || null,
    contact_phone: form.contact_phone.trim() || null,
    website_url: form.website_url.trim() || null,
    headquarters_address: hasAddress ? address : null,
  }
}

export function OrganizationProfileCard({
  organization,
  loading,
  canUpdate,
  canBootstrap,
  onBootstrap,
  onUpdate,
}: OrganizationProfileCardProps) {
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(organization))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setForm(toFormState(organization))
    setMessage("")
  }, [organization])

  const canEdit = organization ? canUpdate : canBootstrap
  const disabled = !canEdit || busy || loading
  const updateField = (field: keyof ProfileFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canEdit) return
    setBusy(true)
    setMessage("")
    try {
      const input = toProfileInput(form)
      if (organization) await onUpdate(input)
      else await onBootstrap(input)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la información corporativa.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Organización y datos corporativos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Datos generales de la cadena propietaria de esta instalación de Chili POS.
          No corresponden a la identificación fiscal de una entidad legal.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando perfil corporativo…</p>
        ) : !organization && !canBootstrap ? (
          <p className="text-sm text-muted-foreground">
            La organización todavía no está configurada. Un administrador autorizado debe completar el alta inicial.
          </p>
        ) : (
          <form className="space-y-5" onSubmit={submit}>
            {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="organization-name">Razón o nombre corporativo</Label>
                <Input
                  id="organization-name"
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-commercial-name">Nombre comercial</Label>
                <Input
                  id="organization-commercial-name"
                  maxLength={160}
                  value={form.commercial_name}
                  onChange={(event) => updateField("commercial_name", event.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-contact-email">Correo de contacto</Label>
                <Input
                  id="organization-contact-email"
                  type="email"
                  maxLength={254}
                  value={form.contact_email}
                  onChange={(event) => updateField("contact_email", event.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-contact-phone">Teléfono de contacto</Label>
                <Input
                  id="organization-contact-phone"
                  type="tel"
                  minLength={7}
                  maxLength={32}
                  value={form.contact_phone}
                  onChange={(event) => updateField("contact_phone", event.target.value)}
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-website">Sitio web</Label>
                <Input
                  id="organization-website"
                  type="url"
                  maxLength={2048}
                  placeholder="https://"
                  value={form.website_url}
                  onChange={(event) => updateField("website_url", event.target.value)}
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Sede corporativa</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="organization-address-line-1">Dirección</Label>
                  <Input
                    id="organization-address-line-1"
                    maxLength={160}
                    value={form.line_1}
                    onChange={(event) => updateField("line_1", event.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="organization-address-line-2">Complemento</Label>
                  <Input
                    id="organization-address-line-2"
                    maxLength={160}
                    value={form.line_2}
                    onChange={(event) => updateField("line_2", event.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-locality">Ciudad o localidad</Label>
                  <Input
                    id="organization-locality"
                    maxLength={120}
                    value={form.locality}
                    onChange={(event) => updateField("locality", event.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-administrative-area">Departamento o región</Label>
                  <Input
                    id="organization-administrative-area"
                    maxLength={120}
                    value={form.administrative_area}
                    onChange={(event) => updateField("administrative_area", event.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-postal-code">Código postal</Label>
                  <Input
                    id="organization-postal-code"
                    maxLength={32}
                    value={form.postal_code}
                    onChange={(event) => updateField("postal_code", event.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-country-code">Código de país (ISO 3166-1 alpha-2)</Label>
                  <Input
                    id="organization-country-code"
                    maxLength={2}
                    pattern="[A-Z]{2}"
                    placeholder="CO"
                    value={form.country_code}
                    onChange={(event) => updateField("country_code", event.target.value.toUpperCase())}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>

            {canEdit ? (
              <Button type="submit" disabled={disabled || form.name.trim().length < 2}>
                {busy
                  ? "Guardando…"
                  : organization
                    ? "Guardar datos corporativos"
                    : "Crear organización"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Puedes consultar estos datos, pero solo el propietario registrado puede modificarlos.
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  )
}
