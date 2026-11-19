"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Branch } from "@/modules/branches/domain/models"
import type { BranchCatalogProduct, Category, NewProduct, Product } from "@/modules/catalog/domain/models"

type CatalogView = "products" | "categories" | "assortment"
interface Props {
  branches: Branch[]
  canManage: boolean
  loading: boolean
  loadError?: string | null
  products: Product[]
  categories: Category[]
  branchProducts: BranchCatalogProduct[]
  selectedBranchId: string
  onSelectBranch: (id: string) => void
  onCreateProduct: (input: NewProduct) => Promise<void>
  onUpdateProduct: (id: string, input: NewProduct) => Promise<void>
  onDeactivateProduct: (id: string) => Promise<void>
  onCreateCategory: (name: string, icon: string) => Promise<void>
  onUpdateCategory: (id: string, name: string, icon: string) => Promise<void>
  onDeactivateCategory: (id: string) => Promise<void>
  onSetProductEnabled: (branchId: string, productId: string, enabled: boolean) => Promise<void>
}
const blankProduct: NewProduct = {
  name: "", description: "", price: 0, image_url: "", discount_percentage: 0,
  type: "Veg", category_id: "",
}

export function CatalogManagementPanel(props: Props) {
  const [view, setView] = useState<CatalogView>("products")
  const [search, setSearch] = useState("")
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [product, setProduct] = useState<NewProduct>(blankProduct)
  const [categoryName, setCategoryName] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [categoryIcon, setCategoryIcon] = useState("Grid")
  const [newCategoryIcon, setNewCategoryIcon] = useState("Grid")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const selectedBranch = props.branches.find((branch) => branch.id === props.selectedBranchId)
  const filteredProducts = useMemo(() => props.products.filter((item) =>
    `${item.name} ${item.description ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  [props.products, search])
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError("")
    try { await operation() } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.")
    } finally { setBusy(false) }
  }
  const startEditProduct = (item: Product) => {
    setEditingProduct(item)
    setProduct({
      name: item.name, description: item.description ?? "", price: item.price,
      image_url: item.image_url ?? "", discount_percentage: item.discount_percentage,
      type: item.type, category_id: item.category_id,
    })
  }
  const submitProduct = () => run(async () => {
    const input = {
      ...product,
      description: product.description?.trim() || null,
      image_url: product.image_url?.trim() || null,
    }
    if (editingProduct) await props.onUpdateProduct(editingProduct.id, input)
    else await props.onCreateProduct(input)
    setEditingProduct(null); setProduct(blankProduct)
  })
  return (
    <section className="flex-1 space-y-5 overflow-auto p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">Catálogo corporativo</h1>
        <p className="text-sm text-muted-foreground">Administra productos y categorías maestros y configura el surtido de cada sucursal.</p>
      </header>
      {!props.canManage && <p role="alert" className="rounded-md border p-3 text-sm">Solo el propietario corporativo puede administrar el catálogo.</p>}
      {(props.loadError || error) && <p role="alert" className="text-sm text-destructive">{error || props.loadError}</p>}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones del catálogo">
        {(["products", "categories", "assortment"] as const).map((key) =>
          <Button key={key} type="button" variant={view === key ? "secondary" : "outline"} onClick={() => setView(key)}>
            {key === "products" ? "Productos" : key === "categories" ? "Categorías" : "Surtido por sucursal"}
          </Button>)}
      </div>
      {view === "products" && <>
        <Card>
          <CardHeader><CardTitle>{editingProduct ? "Editar producto corporativo" : "Crear producto corporativo"}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1 text-sm"><label htmlFor="catalog-product-name">Nombre</label><Input id="catalog-product-name" disabled={props.loading} maxLength={120} value={product.name} onChange={(e) => setProduct({...product,name:e.target.value})}/></div>
            <label className="grid gap-1 text-sm">Categoría<select className="h-10 rounded-md border bg-background px-3" disabled={props.loading} value={product.category_id} onChange={(e) => setProduct({...product,category_id:e.target.value})}><option value="">Seleccionar</option>{props.categories.filter((c)=>c.is_active!==false).map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Descripción<textarea className="min-h-20 rounded-md border bg-background p-2" disabled={props.loading} maxLength={1000} value={product.description ?? ""} onChange={(e)=>setProduct({...product,description:e.target.value})}/></label>
            <div className="grid gap-1 text-sm"><label htmlFor="catalog-product-image">URL de imagen</label><Input id="catalog-product-image" disabled={props.loading} type="url" value={product.image_url ?? ""} onChange={(e)=>setProduct({...product,image_url:e.target.value})}/></div>
            <div className="grid gap-1 text-sm"><label htmlFor="catalog-product-price">Precio maestro</label><Input id="catalog-product-price" disabled={props.loading} type="number" min="0.01" max="100000" step="0.01" value={product.price || ""} onChange={(e)=>setProduct({...product,price:Number(e.target.value)})}/></div>
            <div className="grid gap-1 text-sm"><label htmlFor="catalog-product-discount">Descuento (%)</label><Input id="catalog-product-discount" disabled={props.loading} type="number" min="0" max="100" step="1" value={product.discount_percentage} onChange={(e)=>setProduct({...product,discount_percentage:Number(e.target.value)})}/></div>
            <label className="grid gap-1 text-sm">Tipo<select className="h-10 rounded-md border bg-background px-3" disabled={props.loading} value={product.type} onChange={(e)=>setProduct({...product,type:e.target.value as NewProduct["type"]})}><option value="Veg">Vegetariano</option><option value="Non Veg">No vegetariano</option></select></label>
            <div className="flex gap-2 md:col-span-2"><Button disabled={!props.canManage || props.loading || busy || !product.name.trim() || !product.category_id || product.price <= 0} onClick={() => void submitProduct()}>{busy ? "Guardando…" : editingProduct ? "Guardar cambios" : "Crear producto"}</Button>{editingProduct && <Button variant="outline" onClick={()=>{setEditingProduct(null);setProduct(blankProduct)}}>Cancelar edición</Button>}</div>
          </CardContent>
        </Card>
        <Input placeholder="Buscar productos…" value={search} onChange={(e)=>setSearch(e.target.value)}/>
        <div className="grid gap-3">{filteredProducts.map((item)=><Card key={item.id}><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{item.name} {!item.is_active && <span className="text-xs text-muted-foreground">· Inactivo</span>}</p><p className="text-sm text-muted-foreground">{item.categories?.name ?? "Sin categoría"} · {item.price.toLocaleString("es-CO")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!props.canManage || !item.is_active || busy} onClick={()=>startEditProduct(item)}>Editar</Button>{item.is_active && <Button size="sm" variant="destructive" disabled={!props.canManage || busy} onClick={()=>{if(window.confirm(`¿Dar de baja el producto "${item.name}"? Se conservará en pedidos históricos.`)) void run(()=>props.onDeactivateProduct(item.id))}}>Dar de baja</Button>}</div></CardContent></Card>)}</div>
      </>}
      {view === "categories" && <Card><CardHeader><CardTitle>Categorías corporativas</CardTitle></CardHeader><CardContent className="space-y-3"><form className="flex gap-2" onSubmit={(e)=>{e.preventDefault();void run(async()=>{await props.onCreateCategory(newCategoryName, newCategoryIcon);setNewCategoryName("");setNewCategoryIcon("Grid")})}}><Input value={newCategoryName} onChange={(e)=>setNewCategoryName(e.target.value)} placeholder="Nombre de categoría" required/><Input value={newCategoryIcon} onChange={(e)=>setNewCategoryIcon(e.target.value)} aria-label="Icono de categoría" placeholder="Icono"/><Button disabled={!props.canManage || props.loading || busy}>Crear</Button></form>{props.categories.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.item_count} productos activos {!item.is_active && "· Inactiva"}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!props.canManage || !item.is_active || busy} onClick={()=>{setEditingCategory(item);setCategoryName(item.name);setCategoryIcon(item.icon ?? "Grid")}}>Editar</Button>{item.is_active && <Button size="sm" variant="destructive" disabled={!props.canManage || busy || item.item_count>0} onClick={()=>{if(window.confirm(`¿Dar de baja la categoría "${item.name}"?`)) void run(()=>props.onDeactivateCategory(item.id))}}>Dar de baja</Button>}</div></div>)}{editingCategory && <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault();void run(async()=>{await props.onUpdateCategory(editingCategory.id,categoryName,categoryIcon);setEditingCategory(null);setCategoryName("");setCategoryIcon("Grid")})}}><Input value={categoryName} onChange={(e)=>setCategoryName(e.target.value)} required/><Input value={categoryIcon} onChange={(e)=>setCategoryIcon(e.target.value)} aria-label="Icono de categoría" required/><Button disabled={busy}>Guardar categoría</Button><Button type="button" variant="outline" onClick={()=>setEditingCategory(null)}>Cancelar</Button></form>}</CardContent></Card>}
      {view === "assortment" && <Card><CardHeader><CardTitle>Surtido por sucursal</CardTitle></CardHeader><CardContent className="space-y-3"><label className="grid max-w-md gap-1 text-sm">Sucursal del catálogo<select className="h-10 rounded-md border bg-background px-3" value={props.selectedBranchId} disabled={props.loading} onChange={(e)=>props.onSelectBranch(e.target.value)}>{props.branches.map((b)=><option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></label>{selectedBranch?.status !== "active" && <p role="status" className="text-sm text-amber-700">Sucursal suspendida o cerrada: consulta disponible, edición bloqueada.</p>}{props.branchProducts.map((item)=><label key={item.id} className="flex items-center justify-between border-b py-3 text-sm"><span>{item.name}<span className="block text-xs text-muted-foreground">{item.enabled ? "Heredado y habilitado" : "Excluido de esta sucursal"}{item.last_changed_at ? ` · ${new Date(item.last_changed_at).toLocaleString()}` : ""}{item.last_changed_by_email ? ` · ${item.last_changed_by_email}` : ""}</span></span><span className="flex items-center gap-2"><input type="checkbox" aria-label={`Disponible en sucursal: ${item.name}`} checked={item.enabled} disabled={!props.canManage || selectedBranch?.status!=="active" || busy} onChange={(e)=>void run(()=>props.onSetProductEnabled(props.selectedBranchId,item.id,e.target.checked))}/>Disponible</span></label>)}</CardContent></Card>}
      {props.loading && <p className="text-sm text-muted-foreground">Cargando estructura corporativa…</p>}
    </section>
  )
}
