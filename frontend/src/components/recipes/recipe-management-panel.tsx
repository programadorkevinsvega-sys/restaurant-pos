"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Product } from "@/modules/catalog/domain/models"
import type { ManageRecipes } from "@/modules/recipes/application/manage-recipes"
import type { Ingredient, IngredientInput, RecipeInput } from "@/modules/recipes/domain/models"

type RecipeView = "ingredients" | "recipes"

interface RecipeManagementPanelProps {
  products: Product[]
  canManage: boolean
  loading: boolean
  application: ManageRecipes
}

const emptyIngredient: IngredientInput = { name: "", description: "", unit_code: "" }

export function RecipeManagementPanel({
  products,
  canManage,
  loading,
  application,
}: RecipeManagementPanelProps) {
  const [view, setView] = useState<RecipeView>("ingredients")
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [ingredientForm, setIngredientForm] = useState<IngredientInput>(emptyIngredient)
  const [editingIngredient, setEditingIngredient] = useState<string | null>(null)
  const [productId, setProductId] = useState("")
  const [instructions, setInstructions] = useState("")
  const [components, setComponents] = useState<RecipeInput["ingredients"]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loadingIngredients, setLoadingIngredients] = useState(false)
  const [loadingRecipe, setLoadingRecipe] = useState(false)

  const activeIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.is_active),
    [ingredients],
  )
  const activeProducts = useMemo(
    () => products.filter((product) => product.is_active !== false),
    [products],
  )
  const selectedProduct = activeProducts.find((product) => product.id === productId)
  const validComponents = components.length > 0 && components.every((line) =>
    activeIngredients.some((ingredient) => ingredient.id === line.ingredient_id) &&
    /^\d{1,12}(?:\.\d{1,6})?$/.test(line.quantity) &&
    Number(line.quantity) > 0,
  )

  const loadIngredients = async () => {
    setLoadingIngredients(true)
    try {
      setIngredients(await application.listIngredients())
      setError("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los ingredientes.")
    } finally {
      setLoadingIngredients(false)
    }
  }

  useEffect(() => {
    void loadIngredients()
  }, [application])

  useEffect(() => {
    let active = true
    if (!productId) {
      setInstructions("")
      setComponents([])
      return () => { active = false }
    }
    setLoadingRecipe(true)
    setError("")
    application.getRecipe(productId)
      .then((recipe) => {
        if (!active) return
        setInstructions(recipe?.preparation_instructions ?? "")
        setComponents(recipe?.ingredients.map((line) => ({
          ingredient_id: line.ingredient_id,
          quantity: line.quantity,
        })) ?? [])
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar la receta.")
      })
      .finally(() => {
        if (active) setLoadingRecipe(false)
      })
    return () => { active = false }
  }, [application, productId])

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError("")
    setSuccess("")
    try {
      await operation()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.")
    } finally {
      setBusy(false)
    }
  }

  const submitIngredient = () => run(async () => {
    const input = {
      name: ingredientForm.name.trim(),
      description: ingredientForm.description?.trim() || null,
      unit_code: ingredientForm.unit_code.trim().toLowerCase(),
    }
    if (editingIngredient) {
      await application.updateIngredient(editingIngredient, input)
      setSuccess("Ingrediente actualizado.")
    } else {
      await application.createIngredient(input)
      setSuccess("Ingrediente creado.")
    }
    setIngredientForm(emptyIngredient)
    setEditingIngredient(null)
    await loadIngredients()
  })

  const editIngredient = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient.id)
    setIngredientForm({
      name: ingredient.name,
      description: ingredient.description ?? "",
      unit_code: ingredient.unit_code,
    })
  }

  const deactivateIngredient = (ingredient: Ingredient) => {
    if (!window.confirm("¿Dar de baja el ingrediente '" + ingredient.name + "'? Solo se permite si no forma parte de una receta.")) return
    void run(async () => {
      await application.deactivateIngredient(ingredient.id)
      await loadIngredients()
      setSuccess("Ingrediente dado de baja.")
    })
  }

  const saveRecipe = () => run(async () => {
    if (!productId || !validComponents) return
    await application.saveRecipe(productId, {
      preparation_instructions: instructions.trim(),
      ingredients: components.map((line) => ({
        ingredient_id: line.ingredient_id,
        quantity: line.quantity,
      })),
    })
    setSuccess("Receta guardada correctamente.")
  })

  return (
    <section className="flex-1 space-y-5 overflow-auto p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">Recetas e ingredientes</h1>
        <p className="text-sm text-muted-foreground">
          Define ingredientes técnicos y la composición de los productos del catálogo corporativo.
        </p>
      </header>
      {!canManage && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          Solo el propietario corporativo puede administrar ingredientes y recetas.
        </p>
      )}
      {(error || success) && (
        <p role={error ? "alert" : "status"} className={error ? "text-sm text-destructive" : "text-sm text-green-700"}>
          {error || success}
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Administración de recetas">
        <Button type="button" variant={view === "ingredients" ? "secondary" : "outline"} onClick={() => setView("ingredients")}>
          Ingredientes
        </Button>
        <Button type="button" variant={view === "recipes" ? "secondary" : "outline"} onClick={() => setView("recipes")}>
          Recetas técnicas
        </Button>
      </div>

      {view === "ingredients" && (
        <>
          <Card>
            <CardHeader><CardTitle>{editingIngredient ? "Editar ingrediente" : "Crear ingrediente corporativo"}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Nombre del ingrediente
                <Input
                  value={ingredientForm.name}
                  maxLength={120}
                  disabled={!canManage || loading || busy}
                  onChange={(event) => setIngredientForm({ ...ingredientForm, name: event.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Código de unidad
                <Input
                  value={ingredientForm.unit_code}
                  maxLength={16}
                  placeholder="g, kg, ml, unidad"
                  disabled={!canManage || loading || busy}
                  onChange={(event) => setIngredientForm({ ...ingredientForm, unit_code: event.target.value.toLowerCase() })}
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                Descripción
                <Input
                  value={ingredientForm.description ?? ""}
                  maxLength={1000}
                  disabled={!canManage || loading || busy}
                  onChange={(event) => setIngredientForm({ ...ingredientForm, description: event.target.value })}
                />
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button
                  disabled={!canManage || loading || busy || !ingredientForm.name.trim() || !/^[a-z][a-z0-9._-]{0,15}$/.test(ingredientForm.unit_code.trim().toLowerCase())}
                  onClick={() => void submitIngredient()}
                >
                  {busy ? "Guardando…" : editingIngredient ? "Guardar ingrediente" : "Crear ingrediente"}
                </Button>
                {editingIngredient && (
                  <Button type="button" variant="outline" onClick={() => { setEditingIngredient(null); setIngredientForm(emptyIngredient) }}>
                    Cancelar edición
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {ingredients.map((ingredient) => (
              <Card key={ingredient.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">
                      {ingredient.name}
                      {!ingredient.is_active && <span className="text-xs text-muted-foreground"> · Inactivo</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Unidad: {ingredient.unit_code}{ingredient.description ? " · " + ingredient.description : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={!canManage || busy || !ingredient.is_active} onClick={() => editIngredient(ingredient)}>
                      Editar
                    </Button>
                    {ingredient.is_active && (
                      <Button size="sm" variant="destructive" disabled={!canManage || busy} onClick={() => deactivateIngredient(ingredient)}>
                        Dar de baja
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!loadingIngredients && ingredients.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aún no hay ingredientes corporativos registrados.
              </p>
            )}
          </div>
        </>
      )}

      {view === "recipes" && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Ficha técnica del producto</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <label className="grid max-w-2xl gap-1 text-sm">
                Producto del catálogo
                <select
                  aria-label="Producto del catálogo"
                  className="h-10 rounded-md border bg-background px-3"
                  value={productId}
                  disabled={loading || busy || loadingRecipe}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  <option value="">Seleccionar producto</option>
                  {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              {selectedProduct && <p className="text-sm text-muted-foreground">{selectedProduct.name} · Receta corporativa compartida con las sucursales.</p>}
              <label className="grid gap-1 text-sm">
                Instrucciones de preparación
                <textarea
                  aria-label="Instrucciones de preparación"
                  className="min-h-28 rounded-md border bg-background p-3"
                  maxLength={10000}
                  value={instructions}
                  disabled={!canManage || !productId || loadingRecipe || busy}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder="Describe el procedimiento de preparación."
                />
              </label>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Ingredientes y cantidades</h3>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!canManage || !productId || loadingRecipe || busy || activeIngredients.length === 0}
                    onClick={() => setComponents((current) => [...current, { ingredient_id: "", quantity: "1" }])}
                  >
                    Agregar ingrediente
                  </Button>
                </div>
                {components.map((line, index) => (
                  <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end">
                    <label className="grid gap-1 text-sm">
                      Ingrediente {index + 1}
                      <select
                        aria-label={"Ingrediente de componente " + (index + 1)}
                        className="h-10 rounded-md border bg-background px-3"
                        value={line.ingredient_id}
                        disabled={!canManage || busy || loadingRecipe}
                        onChange={(event) => setComponents((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ingredient_id: event.target.value } : item))}
                      >
                        <option value="">Seleccionar ingrediente</option>
                        {activeIngredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit_code})</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">
                      Cantidad {index + 1}
                      <Input
                        aria-label={"Cantidad de componente " + (index + 1)}
                        type="number"
                        min="0.000001"
                        max="999999999999"
                        step="0.000001"
                        value={line.quantity}
                        disabled={!canManage || busy || loadingRecipe}
                        onChange={(event) => setComponents((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item))}
                      />
                    </label>
                    <Button type="button" variant="destructive" disabled={!canManage || busy || loadingRecipe} onClick={() => setComponents((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      Quitar
                    </Button>
                  </div>
                ))}
                {components.length === 0 && (
                  <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    Agrega al menos un ingrediente para guardar la ficha técnica.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!canManage || !productId || !validComponents || loadingRecipe || busy} onClick={() => void saveRecipe()}>
                  {busy ? "Guardando…" : "Guardar receta"}
                </Button>
                {loadingRecipe && <span className="self-center text-sm text-muted-foreground">Cargando receta…</span>}
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Las cantidades se guardan con precisión decimal y usan el código de unidad del ingrediente. Esta entrega no convierte unidades ni descuenta existencias.
          </p>
        </div>
      )}
    </section>
  )
}
