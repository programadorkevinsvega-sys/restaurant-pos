"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Category, NewProduct } from "@/modules/catalog/domain/models"

interface ProductFormProps {
  categories: Category[]
  onSubmit: (product: NewProduct) => Promise<void>
  onCancel: () => void
}

const initialProduct: NewProduct = {
  name: "",
  description: "",
  price: 0,
  image_url: "",
  discount_percentage: 0,
  type: "Veg",
  category_id: "",
}

export function ProductForm({ categories, onSubmit, onCancel }: ProductFormProps) {
  const [product, setProduct] = useState(initialProduct)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = <K extends keyof NewProduct>(key: K, value: NewProduct[K]) => {
    setProduct((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onSubmit(product)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-2xl self-start">
      <CardHeader>
        <div className="space-y-1"><h1 className="text-2xl font-semibold leading-none tracking-tight">Crear producto corporativo</h1><p className="text-sm text-muted-foreground">Se registra una sola vez en el catálogo maestro y se hereda a las sucursales. Su disponibilidad local se configura en Configuración → Menú.</p></div>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <label htmlFor="product-name" className="grid gap-1 text-sm font-medium sm:col-span-2">
            Nombre
            <Input id="product-name" required maxLength={120} value={product.name} onChange={(event) => update("name", event.target.value)} />
          </label>
          <label htmlFor="product-description" className="grid gap-1 text-sm font-medium sm:col-span-2">
            Descripción
            <textarea
              id="product-description"
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              maxLength={500}
              value={product.description ?? ""}
              onChange={(event) => update("description", event.target.value)}
            />
          </label>
          <label htmlFor="product-price" className="grid gap-1 text-sm font-medium">
            Precio
            <Input
              id="product-price"
              required
              type="number"
              min="0.01"
              step="0.01"
              value={product.price || ""}
              onChange={(event) => update("price", Number(event.target.value))}
            />
          </label>
          <label htmlFor="product-discount" className="grid gap-1 text-sm font-medium">
            Descuento (%)
            <Input
              id="product-discount"
              type="number"
              min="0"
              max="100"
              step="1"
              value={product.discount_percentage}
              onChange={(event) => update("discount_percentage", Number(event.target.value))}
            />
          </label>
          <label htmlFor="product-type" className="grid gap-1 text-sm font-medium">
            Tipo
            <select
              id="product-type"
              className="h-10 rounded-md border bg-background px-3"
              value={product.type}
              onChange={(event) => update("type", event.target.value as NewProduct["type"])}
            >
              <option value="Veg">Vegetariano</option>
              <option value="Non Veg">No vegetariano</option>
            </select>
          </label>
          <label htmlFor="product-category" className="grid gap-1 text-sm font-medium">
            Categoría
            <select
              id="product-category"
              required
              className="h-10 rounded-md border bg-background px-3"
              value={product.category_id}
              onChange={(event) => update("category_id", event.target.value)}
            >
              <option value="">Seleccionar</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label htmlFor="product-image-url" className="grid gap-1 text-sm font-medium sm:col-span-2">
            URL de imagen (opcional)
            <Input id="product-image-url" type="url" value={product.image_url ?? ""} onChange={(event) => update("image_url", event.target.value)} />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting || categories.length === 0}>
              {isSubmitting ? "Guardando..." : "Guardar producto"}
            </Button>
          </div>
          {categories.length === 0 && <p className="text-sm text-destructive sm:col-span-2">Primero crea una categoría en el sistema.</p>}
        </form>
      </CardContent>
    </Card>
  )
}
