"use client"

import { useCallback, useEffect, useState } from "react"
import type { Branch } from "@/modules/branches/domain/models"
import type { Category, Product } from "@/modules/catalog/domain/models"
import type { ManagePricing } from "@/modules/pricing/application/manage-pricing"
import type { PricingSnapshot } from "@/modules/pricing/domain/models"

interface PricingManagementPanelProps {
  branches: Branch[]
  products: Product[]
  categories: Category[]
  canManage: boolean
  application: ManagePricing
}

export function PricingManagementPanel({
  branches,
  products,
  categories,
  canManage,
  application,
}: PricingManagementPanelProps) {
  const [data, setData] = useState<PricingSnapshot>({ price_lists: [], tax_rules: [], promotions: [] })
  const [listName, setListName] = useState("")
  const [currency, setCurrency] = useState("COP")
  const [scope, setScope] = useState<"corporate" | "legal_entity" | "branch">("branch")
  const [listId, setListId] = useState("")
  const [branchId, setBranchId] = useState("")
  const [entityId, setEntityId] = useState("")
  const [productId, setProductId] = useState("")
  const [price, setPrice] = useState("")
  const [taxCode, setTaxCode] = useState("")
  const [taxName, setTaxName] = useState("")
  const [taxType, setTaxType] = useState("VAT")
  const [taxRate, setTaxRate] = useState("")
  const [mode, setMode] = useState<"inclusive" | "exclusive">("exclusive")
  const [taxIds, setTaxIds] = useState<string[]>([])
  const [promoName, setPromoName] = useState("")
  const [promoScope, setPromoScope] = useState<"corporate" | "branch">("branch")
  const [promoBranchIds, setPromoBranchIds] = useState<string[]>([])
  const [promoBranchSelectionInitialized, setPromoBranchSelectionInitialized] = useState(false)
  const [promoProductId, setPromoProductId] = useState("")
  const [promoCategoryIds, setPromoCategoryIds] = useState<string[]>([])
  const [promoType, setPromoType] = useState<"percentage" | "fixed_amount">("percentage")
  const [promoValue, setPromoValue] = useState("")
  const [from, setFrom] = useState("")
  const [until, setUntil] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  const entities = branches.find((branch) => branch.id === branchId)?.legal_entities ?? []
  const availableEntities = branches.flatMap((branch) => branch.legal_entities)
    .filter((entity, index, all) => all.findIndex((candidate) => candidate.id === entity.id) === index)
  const activeProducts = products.filter((product) => product.is_active !== false)
  const activeCategories = categories.filter((category) => category.is_active !== false)
  const selectedPromotionBranches = promoScope === "branch" ? (branchId ? [branchId] : []) : promoBranchIds
  const hasPromotionTarget = Boolean(promoProductId || promoCategoryIds.length)

  const reload = useCallback(async () => {
    const next = await application.list()
    setData(next)
    if (!listId && next.price_lists[0]) setListId(next.price_lists[0].id)
  }, [application, listId])

  useEffect(() => {
    if (canManage) void reload().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la configuración."),
    )
  }, [canManage, reload])

  useEffect(() => {
    if (!branchId && branches[0]) setBranchId(branches[0].id)
  }, [branchId, branches])

  useEffect(() => {
    if (!entityId && entities[0]) setEntityId(entities[0].id)
  }, [entities, entityId])

  useEffect(() => {
    if (!productId && activeProducts[0]) setProductId(activeProducts[0].id)
  }, [activeProducts, productId])

  useEffect(() => {
    if (!promoProductId && activeProducts[0]) setPromoProductId(activeProducts[0].id)
  }, [activeProducts, promoProductId])

  useEffect(() => {
    if (!promoBranchSelectionInitialized && branchId) {
      setPromoBranchIds([branchId])
      setPromoBranchSelectionInitialized(true)
    }
  }, [branchId, promoBranchSelectionInitialized])

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await action()
      await reload()
      setNotice(message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.")
    } finally {
      setBusy(false)
    }
  }

  const field = "h-10 w-full rounded-md border bg-background px-3 text-sm"
  const label = "grid gap-1 text-sm font-medium"

  if (!canManage) {
    return (
      <section className="flex-1 p-6">
        <h1 className="text-2xl font-semibold">Precios, impuestos y promociones</h1>
        <p className="mt-3 rounded-md border p-4">Solo el propietario corporativo puede administrar estas reglas.</p>
      </section>
    )
  }

  return (
    <section className="min-w-0 flex-1 space-y-5 overflow-auto p-4">
      <header>
        <h1 className="text-2xl font-semibold">Precios, impuestos y promociones</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura listas explícitas por sucursal y entidad legal, precios por producto, impuestos incluidos o excluidos y promociones dirigidas por sucursal, producto o categoría.
        </p>
      </header>
      {error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}

      <div className="grid gap-4 xl:grid-cols-2">
        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          void run(() => application.createPriceList({ name: listName, currency_code: currency, scope }), "Lista de precios creada.")
        }}>
          <h2 className="font-semibold">Crear lista de precios</h2>
          <label className={label}>Nombre
            <input className={field} value={listName} onChange={(event) => setListName(event.target.value)} required minLength={2} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Moneda
              <input className={field} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required />
            </label>
            <label className={label}>Ámbito
              <select className={field} value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
                <option value="corporate">Corporativo</option>
                <option value="legal_entity">Entidad legal</option>
                <option value="branch">Sucursal</option>
              </select>
            </label>
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy}>Crear lista</button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          void run(() => application.assignPriceList({ price_list_id: listId, branch_id: branchId, legal_entity_id: entityId }), "Lista asignada a sucursal y entidad legal.")
        }}>
          <h2 className="font-semibold">Asignar lista</h2>
          <label className={label}>Lista
            <select className={field} value={listId} onChange={(event) => setListId(event.target.value)} required>
              <option value="">Selecciona</option>
              {data.price_lists.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currency_code}</option>)}
            </select>
          </label>
          <label className={label}>Sucursal
            <select className={field} value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
            </select>
          </label>
          <label className={label}>Entidad legal
            <select className={field} value={entityId} onChange={(event) => setEntityId(event.target.value)} required>
              {entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.legal_name}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !listId || !entityId}>Asignar</button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          void run(() => application.setPrice({ price_list_id: listId, product_id: productId, unit_price: Number(price) }), "Precio de producto actualizado.")
        }}>
          <h2 className="font-semibold">Precio por producto</h2>
          <label className={label}>Lista
            <select className={field} value={listId} onChange={(event) => setListId(event.target.value)}>
              {data.price_lists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className={label}>Producto
            <select className={field} value={productId} onChange={(event) => setProductId(event.target.value)}>
              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className={label}>Precio
            <input className={field} type="number" min="0" step="0.0001" value={price} onChange={(event) => setPrice(event.target.value)} required />
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy || !listId || !productId}>Guardar precio</button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          void run(() => application.createTaxRule({
            legal_entity_id: entityId, code: taxCode, name: taxName, tax_type: taxType, rate: Number(taxRate),
          }), "Regla tributaria creada.")
        }}>
          <h2 className="font-semibold">Crear regla de impuesto</h2>
          <label className={label}>Entidad legal
            <select className={field} value={entityId} onChange={(event) => setEntityId(event.target.value)}>
              {availableEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.legal_name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Código
              <input className={field} value={taxCode} onChange={(event) => setTaxCode(event.target.value)} required />
            </label>
            <label className={label}>Tipo
              <input className={field} value={taxType} onChange={(event) => setTaxType(event.target.value)} required />
            </label>
          </div>
          <label className={label}>Nombre
            <input className={field} value={taxName} onChange={(event) => setTaxName(event.target.value)} required />
          </label>
          <label className={label}>Tasa decimal (ej. 0.19)
            <input className={field} type="number" min="0" max="1" step="0.00000001" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} required />
          </label>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy || !entityId}>Crear impuesto</button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          void run(() => application.setProductTax({
            product_id: productId, legal_entity_id: entityId, price_tax_mode: mode, tax_rule_ids: taxIds,
          }), "Perfil fiscal del producto guardado.")
        }}>
          <h2 className="font-semibold">Impuestos por producto</h2>
          <label className={label}>Producto
            <select className={field} value={productId} onChange={(event) => setProductId(event.target.value)}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className={label}>Entidad legal
            <select className={field} value={entityId} onChange={(event) => setEntityId(event.target.value)}>
              {availableEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.legal_name}</option>)}
            </select>
          </label>
          <label className={label}>Precio
            <select className={field} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="inclusive">Impuestos incluidos</option>
              <option value="exclusive">Impuestos no incluidos</option>
            </select>
          </label>
          <div className="space-y-2">
            <p className="text-sm font-medium">Componentes tributarios (puedes seleccionar varios o ninguno)</p>
            {data.tax_rules.filter((rule) => rule.legal_entity_id === entityId).map((rule) => (
              <label key={rule.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={taxIds.includes(rule.id)} onChange={(event) => setTaxIds((current) =>
                  event.target.checked ? [...current, rule.id] : current.filter((id) => id !== rule.id),
                )} />
                {rule.name} · {(Number(rule.rate) * 100).toFixed(4)}%
              </label>
            ))}
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy || !entityId || !productId}>Guardar perfil fiscal</button>
        </form>

        <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => {
          event.preventDefault()
          const branchIds = promoScope === "branch" ? [branchId] : promoBranchIds
          void run(() => application.createPromotion({
            name: promoName,
            scope: promoScope,
            discount_type: promoType,
            discount_value: Number(promoValue),
            currency_code: promoType === "fixed_amount" ? currency : null,
            valid_from: new Date(from).toISOString(),
            valid_until: new Date(until).toISOString(),
            branch_ids: branchIds,
            product_ids: promoProductId ? [promoProductId] : [],
            category_ids: promoCategoryIds,
          }), promoScope === "corporate"
            ? `Promoción corporativa dirigida a ${branchIds.length} sucursal(es).`
            : "Promoción creada y dirigida a la sucursal.",
          )
        }}>
          <h2 className="font-semibold">Crear promoción</h2>
          <label className={label}>Nombre
            <input className={field} value={promoName} onChange={(event) => setPromoName(event.target.value)} required />
          </label>
          <label className={label}>Ámbito de la promoción
            <select className={field} value={promoScope} onChange={(event) => setPromoScope(event.target.value as typeof promoScope)}>
              <option value="branch">Una sucursal</option>
              <option value="corporate">Corporativa (sucursales seleccionadas)</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Tipo
              <select className={field} value={promoType} onChange={(event) => setPromoType(event.target.value as typeof promoType)}>
                <option value="percentage">Porcentaje</option>
                <option value="fixed_amount">Valor fijo por unidad</option>
              </select>
            </label>
            <label className={label}>Valor del descuento
              <input className={field} type="number" min="0.0001" step="0.0001" max={promoType === "percentage" ? 100 : undefined} value={promoValue} onChange={(event) => setPromoValue(event.target.value)} required />
            </label>
          </div>
          {promoScope === "branch" ? (
            <label className={label}>Sucursal
              <select className={field} value={branchId} onChange={(event) => setBranchId(event.target.value)} required>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Sucursales destinatarias</legend>
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={promoBranchIds.includes(branch.id)} onChange={(event) => setPromoBranchIds((current) =>
                    event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id),
                  )} />
                  {branch.code} · {branch.name}
                </label>
              ))}
            </fieldset>
          )}
          <label className={label}>Producto objetivo (opcional si eliges categorías)
            <select className={field} value={promoProductId} onChange={(event) => setPromoProductId(event.target.value)}>
              <option value="">Sin filtro por producto</option>
              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Categorías objetivo</legend>
            {activeCategories.map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={promoCategoryIds.includes(category.id)} onChange={(event) => setPromoCategoryIds((current) =>
                  event.target.checked ? [...current, category.id] : current.filter((id) => id !== category.id),
                )} />
                {category.name}
              </label>
            ))}
          </fieldset>
          {!hasPromotionTarget && <p className="text-xs text-destructive">Selecciona al menos un producto o una categoría objetivo.</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Desde
              <input className={field} type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} required />
            </label>
            <label className={label}>Hasta
              <input className={field} type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} required />
            </label>
          </div>
          <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={
            busy || selectedPromotionBranches.length === 0 || !hasPromotionTarget || !from || !until
          }>Crear promoción</button>
        </form>
      </div>

      <div className="rounded-lg border p-4">
        <h2 className="font-semibold">Configuración registrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {data.price_lists.length} listas · {data.tax_rules.length} reglas tributarias · {data.promotions.length} promociones.
        </p>
      </div>
    </section>
  )
}
