"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import type { Branch } from "@/modules/branches/domain/models"
import type { BranchCatalogProduct } from "@/modules/catalog/domain/models"

interface CorporateCatalogManagementCardProps {
  branches: Branch[]
  loading: boolean
  canManage: boolean
  onListProducts: (branchId: string) => Promise<BranchCatalogProduct[]>
  onSetProductEnabled: (branchId: string, productId: string, enabled: boolean) => Promise<void>
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function CorporateCatalogManagementCard({
  branches,
  loading,
  canManage,
  onListProducts,
  onSetProductEnabled,
}: CorporateCatalogManagementCardProps) {
  const [branchId, setBranchId] = useState("")
  const [products, setProducts] = useState<BranchCatalogProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [savingProductId, setSavingProductId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (branches.length === 0) {
      setBranchId("")
      setProducts([])
      return
    }
    if (!branches.some((branch) => branch.id === branchId)) {
      setBranchId(branches[0].id)
    }
  }, [branchId, branches])

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === branchId) ?? null,
    [branchId, branches],
  )

  const loadProducts = useCallback(async () => {
    if (!branchId || !canManage) {
      setProducts([])
      return
    }
    setLoadingProducts(true)
    setError("")
    try {
      setProducts(await onListProducts(branchId))
    } catch (cause) {
      setProducts([])
      setError(cause instanceof Error ? cause.message : "No se pudo consultar el catálogo de la sucursal.")
    } finally {
      setLoadingProducts(false)
    }
  }, [branchId, canManage, onListProducts])

  useEffect(() => {
    void loadProducts()
  }, [loadProducts])

  const handleEnabledChange = async (product: BranchCatalogProduct, enabled: boolean) => {
    if (!selectedBranch || selectedBranch.status !== "active" || !canManage) return
    setSavingProductId(product.id)
    setError("")
    try {
      await onSetProductEnabled(selectedBranch.id, product.id, enabled)
      await loadProducts()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la disponibilidad del producto.")
    } finally {
      setSavingProductId(null)
    }
  }

  const editable = canManage && selectedBranch?.status === "active"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Catálogo corporativo y habilitación por sucursal</CardTitle>
        <p className="text-sm text-muted-foreground">
          Los productos pertenecen a un único catálogo maestro. Aquí se habilitan o excluyen para cada sucursal sin duplicar su identidad.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando sucursales…</p>
        ) : branches.length === 0 ? (
          <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
            Registra una sucursal antes de configurar su catálogo.
          </p>
        ) : (
          <>
            <div className="grid gap-1">
              <Label htmlFor="corporate-catalog-branch">Sucursal del catálogo</Label>
              <select
                id="corporate-catalog-branch"
                aria-label="Sucursal del catálogo corporativo"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                disabled={loadingProducts || savingProductId !== null}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                    {branch.status === "suspended" ? " · Suspendida" : branch.status === "closed" ? " · Cerrada" : ""}
                  </option>
                ))}
              </select>
            </div>

            {selectedBranch && selectedBranch.status !== "active" && (
              <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                La sucursal está {selectedBranch?.status === "closed" ? "cerrada" : "suspendida"}. El catálogo puede consultarse, pero no modificarse.
              </p>
            )}
            {!canManage && (
              <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
                Solo el propietario corporativo registrado puede administrar el catálogo maestro y sus excepciones.
              </p>
            )}

            {!canManage ? null : loadingProducts ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cargando productos corporativos…</p>
            ) : products.length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No hay productos registrados en el catálogo corporativo.
              </p>
            ) : (
              <div className="divide-y rounded-md border">
                {products.map((product) => {
                  const changedAt = formatDate(product.last_changed_at)
                  return (
                    <article key={product.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.categories?.name ?? "Sin categoría"} · Precio del catálogo maestro: {Number(product.price).toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                        </p>
                        {product.description && (
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {product.enabled ? "Heredado y habilitado" : "Excluido de esta sucursal"}
                          {changedAt ? ` · Último cambio: ${changedAt}` : ""}
                          {product.last_changed_by_email ? ` · Por: ${product.last_changed_by_email}` : ""}
                        </p>
                      </div>
                      <label className="flex min-w-fit items-center gap-3 text-sm font-medium">
                        <input
                          type="checkbox"
                          aria-label={`Disponible en sucursal: ${product.name}`}
                          className="h-4 w-4 accent-primary"
                          checked={product.enabled}
                          disabled={!editable || savingProductId !== null}
                          onChange={(event) => void handleEnabledChange(product, event.target.checked)}
                        />
                        Disponible
                        {savingProductId === product.id && (
                          <span className="text-xs font-normal text-muted-foreground">Guardando…</span>
                        )}
                      </label>
                    </article>
                  )
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Los cambios de disponibilidad son excepciones locales auditadas. Los precios, impuestos, promociones y recetas se administrarán en sus subfases correspondientes.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
