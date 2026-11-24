"use client"

import { useCallback, useEffect, useState } from "react"
import type { Branch } from "@/modules/branches/domain/models"
import type { Product } from "@/modules/catalog/domain/models"
import type { ManagePricing } from "@/modules/pricing/application/manage-pricing"
import type { PricingSnapshot } from "@/modules/pricing/domain/models"

export function PricingManagementPanel({branches,products,canManage,application}:{branches:Branch[];products:Product[];canManage:boolean;application:ManagePricing}) {
 const [data,setData]=useState<PricingSnapshot>({price_lists:[],tax_rules:[],promotions:[]})
 const [listName,setListName]=useState(""); const [currency,setCurrency]=useState("COP"); const [scope,setScope]=useState<"corporate"|"legal_entity"|"branch">("branch")
 const [listId,setListId]=useState(""); const [branchId,setBranchId]=useState(""); const [entityId,setEntityId]=useState(""); const [productId,setProductId]=useState("")
 const [price,setPrice]=useState(""); const [taxCode,setTaxCode]=useState(""); const [taxName,setTaxName]=useState(""); const [taxType,setTaxType]=useState("VAT"); const [taxRate,setTaxRate]=useState("")
 const [mode,setMode]=useState<"inclusive"|"exclusive">("exclusive"); const [taxIds,setTaxIds]=useState<string[]>([])
 const [promoName,setPromoName]=useState(""); const [promoType,setPromoType]=useState<"percentage"|"fixed_amount">("percentage"); const [promoValue,setPromoValue]=useState("")
 const [from,setFrom]=useState(""); const [until,setUntil]=useState(""); const [error,setError]=useState(""); const [notice,setNotice]=useState(""); const [busy,setBusy]=useState(false)
 const entities=branches.find(b=>b.id===branchId)?.legal_entities ?? []
 const reload=useCallback(async()=>{const next=await application.list();setData(next);if(!listId&&next.price_lists[0])setListId(next.price_lists[0].id)},[application,listId])
 useEffect(()=>{if(canManage)void reload().catch(e=>setError(e instanceof Error?e.message:"No se pudo cargar la configuración."))},[canManage,reload])
 useEffect(()=>{if(!branchId&&branches[0])setBranchId(branches[0].id)},[branchId,branches])
 useEffect(()=>{if(!entityId&&entities[0])setEntityId(entities[0].id)},[entities,entityId])
 useEffect(()=>{if(!productId&&products[0])setProductId(products[0].id)},[productId,products])
 const run=async(action:()=>Promise<unknown>,message:string)=>{setBusy(true);setError("");setNotice("");try{await action();await reload();setNotice(message)}catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.")}finally{setBusy(false)}}
 const field="h-10 w-full rounded-md border bg-background px-3 text-sm"
 const label="grid gap-1 text-sm font-medium"
 if(!canManage)return <section className="flex-1 p-6"><h1 className="text-2xl font-semibold">Precios, impuestos y promociones</h1><p className="mt-3 rounded-md border p-4">Solo el propietario corporativo puede administrar estas reglas.</p></section>
 return <section className="min-w-0 flex-1 space-y-5 overflow-auto p-4">
  <header><h1 className="text-2xl font-semibold">Precios, impuestos y promociones</h1><p className="mt-1 text-sm text-muted-foreground">Configura listas explícitas por sucursal y entidad legal, precios por producto, impuestos incluidos o excluidos y promociones dirigidas.</p></header>
  {error&&<p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
  <div className="grid gap-4 xl:grid-cols-2">
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.createPriceList({name:listName,currency_code:currency,scope}),"Lista de precios creada.")}}>
    <h2 className="font-semibold">Crear lista de precios</h2><label className={label}>Nombre<input className={field} value={listName} onChange={e=>setListName(e.target.value)} required minLength={2}/></label>
    <div className="grid grid-cols-2 gap-2"><label className={label}>Moneda<input className={field} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())} maxLength={3} required/></label><label className={label}>Ámbito<select className={field} value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="corporate">Corporativo</option><option value="legal_entity">Entidad legal</option><option value="branch">Sucursal</option></select></label></div>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy}>Crear lista</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.assignPriceList({price_list_id:listId,branch_id:branchId,legal_entity_id:entityId}),"Lista asignada a sucursal y entidad legal.")}}>
    <h2 className="font-semibold">Asignar lista</h2><label className={label}>Lista<select className={field} value={listId} onChange={e=>setListId(e.target.value)} required><option value="">Selecciona</option>{data.price_lists.map(x=><option key={x.id} value={x.id}>{x.name} · {x.currency_code}</option>)}</select></label>
    <label className={label}>Sucursal<select className={field} value={branchId} onChange={e=>setBranchId(e.target.value)} required>{branches.map(x=><option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
    <label className={label}>Entidad legal<select className={field} value={entityId} onChange={e=>setEntityId(e.target.value)} required>{entities.map(x=><option key={x.id} value={x.id}>{x.legal_name}</option>)}</select></label>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy||!listId||!entityId}>Asignar</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.setPrice({price_list_id:listId,product_id:productId,unit_price:Number(price)}),"Precio de producto actualizado.")}}>
    <h2 className="font-semibold">Precio por producto</h2><label className={label}>Lista<select className={field} value={listId} onChange={e=>setListId(e.target.value)}>{data.price_lists.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className={label}>Producto<select className={field} value={productId} onChange={e=>setProductId(e.target.value)}>{products.filter(p=>p.is_active!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className={label}>Precio<input className={field} type="number" min="0" step="0.0001" value={price} onChange={e=>setPrice(e.target.value)} required/></label>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy||!listId||!productId}>Guardar precio</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.createTaxRule({legal_entity_id:entityId,code:taxCode,name:taxName,tax_type:taxType,rate:Number(taxRate)}),"Regla tributaria creada.")}}>
    <h2 className="font-semibold">Crear regla de impuesto</h2><label className={label}>Entidad legal<select className={field} value={entityId} onChange={e=>setEntityId(e.target.value)}>{branches.flatMap(b=>b.legal_entities).filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).map(x=><option key={x.id} value={x.id}>{x.legal_name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className={label}>Código<input className={field} value={taxCode} onChange={e=>setTaxCode(e.target.value)} required/></label><label className={label}>Tipo<input className={field} value={taxType} onChange={e=>setTaxType(e.target.value)} required/></label></div>
    <label className={label}>Nombre<input className={field} value={taxName} onChange={e=>setTaxName(e.target.value)} required/></label><label className={label}>Tasa decimal (ej. 0.19)<input className={field} type="number" min="0" max="1" step="0.00000001" value={taxRate} onChange={e=>setTaxRate(e.target.value)} required/></label>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy||!entityId}>Crear impuesto</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.setProductTax({product_id:productId,legal_entity_id:entityId,price_tax_mode:mode,tax_rule_ids:taxIds}),"Perfil fiscal del producto guardado.")}}>
    <h2 className="font-semibold">Impuestos por producto</h2><label className={label}>Producto<select className={field} value={productId} onChange={e=>setProductId(e.target.value)}>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className={label}>Entidad legal<select className={field} value={entityId} onChange={e=>setEntityId(e.target.value)}>{branches.flatMap(b=>b.legal_entities).filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).map(x=><option key={x.id} value={x.id}>{x.legal_name}</option>)}</select></label>
    <label className={label}>Precio<select className={field} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="inclusive">Impuestos incluidos</option><option value="exclusive">Impuestos no incluidos</option></select></label>
    <div className="space-y-2"><p className="text-sm font-medium">Componentes tributarios (puedes seleccionar varios o ninguno)</p>{data.tax_rules.filter(x=>x.legal_entity_id===entityId).map(x=><label key={x.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={taxIds.includes(x.id)} onChange={e=>setTaxIds(current=>e.target.checked?[...current,x.id]:current.filter(id=>id!==x.id))}/>{x.name} · {(Number(x.rate)*100).toFixed(4)}%</label>)}</div>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy||!entityId||!productId}>Guardar perfil fiscal</button>
   </form>
   <form className="space-y-3 rounded-lg border p-4" onSubmit={e=>{e.preventDefault();void run(()=>application.createPromotion({name:promoName,scope:"branch",discount_type:promoType,discount_value:Number(promoValue),currency_code:currency,valid_from:new Date(from).toISOString(),valid_until:new Date(until).toISOString(),branch_ids:[branchId],product_ids:productId?[productId]:[],category_ids:[]}),"Promoción creada y dirigida a la sucursal.")}}>
    <h2 className="font-semibold">Crear promoción por sucursal</h2><label className={label}>Nombre<input className={field} value={promoName} onChange={e=>setPromoName(e.target.value)} required/></label>
    <div className="grid grid-cols-2 gap-2"><label className={label}>Tipo<select className={field} value={promoType} onChange={e=>setPromoType(e.target.value as typeof promoType)}><option value="percentage">Porcentaje</option><option value="fixed_amount">Valor fijo por unidad</option></select></label><label className={label}>Valor<input className={field} type="number" min="0.0001" step="0.0001" max={promoType==="percentage"?100:undefined} value={promoValue} onChange={e=>setPromoValue(e.target.value)} required/></label></div>
    <label className={label}>Sucursal<select className={field} value={branchId} onChange={e=>setBranchId(e.target.value)}>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label className={label}>Producto objetivo<select className={field} value={productId} onChange={e=>setProductId(e.target.value)}>{products.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className={label}>Desde<input className={field} type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)} required/></label><label className={label}>Hasta<input className={field} type="datetime-local" value={until} onChange={e=>setUntil(e.target.value)} required/></label></div>
    <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground" disabled={busy||!branchId||!from||!until}>Crear promoción</button>
   </form>
  </div>
  <div className="rounded-lg border p-4"><h2 className="font-semibold">Configuración registrada</h2><p className="mt-2 text-sm text-muted-foreground">{data.price_lists.length} listas · {data.tax_rules.length} reglas tributarias · {data.promotions.length} promociones.</p></div>
 </section>
}
