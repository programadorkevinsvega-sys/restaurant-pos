"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  BestSellingProduct,
  DeliveryOrder,
  Reservation,
  ReservationFilters,
  RestaurantSettings,
  RestaurantTable,
  SalesReport,
} from "@/modules/operations/domain/models"
import type { AppSection } from "@/components/sidebar-nav"
import { OrganizationProfileCard } from "@/components/organization/organization-profile-card"
import type {
  OrganizationHistoryFilters,
  OrganizationHistoryPage,
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationProfileUpdate,
} from "@/modules/organization/domain/models"
import { LegalEntityManagementCard } from "@/components/legal-entities/legal-entity-management-card"
import { BranchManagementCard } from "@/components/branches/branch-management-card"
import { OrganizationHistoryPanel } from "@/components/organization/organization-history-panel"
import { ReservationsManagementPanel } from "@/components/operations/reservations-management-panel"
import type { LegalEntity, LegalEntityInput } from "@/modules/legal-entities/domain/models"
import type {
  Branch,
  BranchCalendarException,
  BranchCalendarExceptionInput,
  BranchInput,
  BranchLifecycleEvent,
  BranchLocalConfiguration,
  BranchStatus,
  BranchUpdate,
  BranchUser,
} from "@/modules/branches/domain/models"
import { HttpError } from "@/shared/infrastructure/http-client"

interface OperationsPanelProps {
  section: Extract<AppSection, "reservations" | "delivery" | "accounting" | "settings">
  tables: RestaurantTable[]
  reservations: Reservation[]
  deliveries: DeliveryOrder[]
  salesReport: SalesReport | null
  bestSellingProducts: BestSellingProduct[]
  settings: RestaurantSettings
  onCreateReservation: (reservation: Omit<Reservation, "id" | "status">) => Promise<void>
  onUpdateReservationStatus: (id: string, status: Reservation["status"]) => Promise<void>
  onListReservations: (filters: ReservationFilters) => Promise<void>
  canWriteOperationalData: boolean
  onAssignDriver: (orderId: string, name: string, phone: string, eta: string) => Promise<void>
  onUpdateSettings: (settings: RestaurantSettings) => Promise<void>
  organization: OrganizationProfile | null
  organizationLoading: boolean
  canUpdateOrganization: boolean
  canBootstrapOrganization: boolean
  organizationLoadError: string | null
  onBootstrapOrganization: (input: OrganizationProfileInput) => Promise<void>
  onUpdateOrganization: (input: OrganizationProfileUpdate) => Promise<void>
  onListOrganizationHistory: (filters: OrganizationHistoryFilters) => Promise<OrganizationHistoryPage>
  legalEntities: LegalEntity[]
  branches: Branch[]
  branchUsersByBranch: Record<string, BranchUser[]>
  branchLifecycleEventsByBranch: Record<string, BranchLifecycleEvent[]>
  corporateStructureLoading: boolean
  corporateStructureLoadError: string | null
  canManageCorporateStructure: boolean
  onCreateLegalEntity: (input: LegalEntityInput) => Promise<void>
  onUpdateLegalEntity: (id: string, input: LegalEntityInput) => Promise<void>
  onCreateBranch: (input: BranchInput) => Promise<void>
  onUpdateBranch: (id: string, input: BranchUpdate) => Promise<void>
  onChangeBranchStatus: (id: string, status: BranchStatus) => Promise<void>
  onAssignBranchLegalEntity: (branchId: string, legalEntityId: string) => Promise<void>
  onRemoveBranchLegalEntity: (branchId: string, legalEntityId: string) => Promise<void>
  onAssignBranchUser: (branchId: string, userId: string) => Promise<void>
  onRemoveBranchUser: (branchId: string, userId: string) => Promise<void>
  onSaveBranchLocalConfiguration: (branchId: string, input: BranchLocalConfiguration) => Promise<void>
  onListBranchCalendar: (branchId: string, from: string, to: string) => Promise<BranchCalendarException[]>
  onSaveBranchCalendarException: (branchId: string, localDate: string, input: BranchCalendarExceptionInput) => Promise<void>
  onDeleteBranchCalendarException: (branchId: string, localDate: string) => Promise<void>
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
    section, tables, reservations, deliveries, salesReport, bestSellingProducts, settings,
    onCreateReservation, onUpdateReservationStatus, onListReservations, canWriteOperationalData,
    onAssignDriver, onUpdateSettings,
    organization, organizationLoading, canUpdateOrganization, canBootstrapOrganization, organizationLoadError,
    onBootstrapOrganization, onUpdateOrganization, onListOrganizationHistory,
    legalEntities, branches, branchUsersByBranch, branchLifecycleEventsByBranch, corporateStructureLoading, corporateStructureLoadError,
    canManageCorporateStructure, onCreateLegalEntity, onUpdateLegalEntity,
    onCreateBranch, onUpdateBranch, onChangeBranchStatus, onAssignBranchLegalEntity, onRemoveBranchLegalEntity,
    onAssignBranchUser, onRemoveBranchUser, onSaveBranchLocalConfiguration,
    onListBranchCalendar, onSaveBranchCalendarException, onDeleteBranchCalendarException,
  } = props
  const [busy, setBusy] = useState(false)
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
    return (
      <ReservationsManagementPanel
        reservations={reservations}
        tables={tables}
        canWrite={canWriteOperationalData}
        onCreate={onCreateReservation}
        onUpdateStatus={onUpdateReservationStatus}
        onList={onListReservations}
      />
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
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Administra la organización, su estructura y los parámetros operativos desde grupos independientes.
        </p>
      </header>

      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

      <Tabs defaultValue="organization" className="w-full space-y-5">
        <TabsList
          aria-label="Grupos de configuración"
          className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border bg-muted/50 p-1"
        >
          <TabsTrigger value="organization" className="min-w-fit flex-1">Organización</TabsTrigger>
          <TabsTrigger value="legal-entities" className="min-w-fit flex-1">Entidades legales</TabsTrigger>
          <TabsTrigger value="branches" className="min-w-fit flex-1">Sucursales</TabsTrigger>
          <TabsTrigger value="preferences" className="min-w-fit flex-1">Preferencias</TabsTrigger>
          <TabsTrigger value="history" className="min-w-fit flex-1">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="mt-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Organización</h2>
            <p className="text-sm text-muted-foreground">
              Datos corporativos generales de la cadena. No son los datos fiscales de sus entidades legales.
            </p>
          </div>
          <OrganizationProfileCard
            organization={organization}
            loading={organizationLoading}
            canUpdate={canUpdateOrganization}
            canBootstrap={canBootstrapOrganization}
            loadError={organizationLoadError}
            onBootstrap={onBootstrapOrganization}
            onUpdate={onUpdateOrganization}
          />
        </TabsContent>

        <TabsContent value="legal-entities" className="mt-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Entidades legales</h2>
            <p className="text-sm text-muted-foreground">
              Administra las empresas y sus identificadores fiscales. Una sucursal puede operar con una o varias entidades legales.
            </p>
          </div>
          {corporateStructureLoadError && (
            <p role="alert" className="text-sm text-destructive">{corporateStructureLoadError}</p>
          )}
          <LegalEntityManagementCard
            legalEntities={legalEntities}
            loading={corporateStructureLoading}
            canManage={canManageCorporateStructure}
            onCreate={onCreateLegalEntity}
            onUpdate={onUpdateLegalEntity}
          />
        </TabsContent>

        <TabsContent value="branches" className="mt-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sucursales</h2>
            <p className="text-sm text-muted-foreground">
              Gestiona cada local, sus entidades habilitadas, usuarios, ciclo de vida, dirección, moneda, zona horaria y calendario operativo.
            </p>
          </div>
          {corporateStructureLoadError && (
            <p role="alert" className="text-sm text-destructive">{corporateStructureLoadError}</p>
          )}
          <BranchManagementCard
            branches={branches}
            legalEntities={legalEntities}
            usersByBranch={branchUsersByBranch}
            lifecycleEventsByBranch={branchLifecycleEventsByBranch}
            loading={corporateStructureLoading}
            canManage={canManageCorporateStructure}
            onCreate={onCreateBranch}
            onUpdate={onUpdateBranch}
            onChangeStatus={onChangeBranchStatus}
            onAssign={onAssignBranchLegalEntity}
            onRemove={onRemoveBranchLegalEntity}
            onAssignUser={onAssignBranchUser}
            onRemoveUser={onRemoveBranchUser}
            onSaveLocalConfiguration={onSaveBranchLocalConfiguration}
            onListCalendar={onListBranchCalendar}
            onSaveCalendarException={onSaveBranchCalendarException}
            onDeleteCalendarException={onDeleteBranchCalendarException}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-0 space-y-4">
          <OrganizationHistoryPanel
            branches={branches}
            canViewHistory={canUpdateOrganization}
            onListHistory={onListOrganizationHistory}
          />
        </TabsContent>

        <TabsContent value="preferences" className="mt-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Preferencias</h2>
            <p className="text-sm text-muted-foreground">
              Parámetros generales que el backend expone para la instalación del restaurante.
            </p>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-lg">Preferencias generales</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                const nextSettings = Object.fromEntries(
                  [...form.entries()].map(([key, value]) => [key, String(value)]),
                )
                void run(() => onUpdateSettings(nextSettings))
              }}>
                {Object.entries(settings).map(([key, value]) => (
                  <label htmlFor={`setting-${key}`} key={key} className="grid gap-1 text-sm font-medium">
                    {key}
                    <Input id={`setting-${key}`} name={key} defaultValue={value} />
                  </label>
                ))}
                {Object.keys(settings).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hay preferencias configuradas por el backend.
                  </p>
                )}
                {Object.keys(settings).length > 0 && (
                  <Button type="submit" disabled={busy}>Guardar preferencias</Button>
                )}
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  )
}
