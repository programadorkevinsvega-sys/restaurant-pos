"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Product } from "@/modules/catalog/domain/models"
import type { PosProductOptionGroup, ProductOptionSelection } from "@/modules/variants/domain/models"

interface ProductOptionsDialogProps {
  product: Product
  groups: PosProductOptionGroup[]
  onClose: () => void
  onConfirm: (selected: ProductOptionSelection[]) => void
}

export function ProductOptionsDialog({ product, groups, onClose, onConfirm }: ProductOptionsDialogProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const selectedCount = useMemo(
    () => Object.values(selected).reduce((sum, ids) => sum + ids.length, 0),
    [selected],
  )
  const invalidGroup = groups.find((group) => {
    const count = selected[group.id]?.length ?? 0
    return count < group.min_selections || count > group.max_selections
  })
  const canConfirm = !invalidGroup && selectedCount <= 40

  const toggle = (group: PosProductOptionGroup, optionId: string) => {
    setSelected((current) => {
      const currentIds = current[group.id] ?? []
      const nextIds = currentIds.includes(optionId)
        ? currentIds.filter((id) => id !== optionId)
        : group.kind === "presentation"
          ? [optionId]
          : currentIds.length < group.max_selections ? [...currentIds, optionId] : currentIds
      return { ...current, [group.id]: nextIds }
    })
  }

  const confirm = () => {
    if (!canConfirm) return
    const choices = groups.flatMap((group) => (selected[group.id] ?? []).map((id) => {
      const option = group.options.find((item) => item.id === id)
      if (!option) return null
      return {
        id: option.id,
        name: option.name,
        group_id: group.id,
        group_name: group.name,
        group_kind: group.kind,
      }
    })).filter((option): option is ProductOptionSelection => option !== null)
    onConfirm(choices)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="product-options-title" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-t-xl bg-background p-5 shadow-xl sm:rounded-xl">
        <header>
          <h2 id="product-options-title" className="text-lg font-semibold">Personaliza {product.name}</h2>
          <p className="text-sm text-muted-foreground">Selecciona las presentaciones y modificadores disponibles para esta sucursal.</p>
        </header>
        {groups.map((group) => (
          <fieldset key={group.id} className="space-y-2">
            <legend className="font-medium">{group.name} <span className="text-xs text-muted-foreground">({group.min_selections}–{group.max_selections})</span></legend>
            {group.options.map((option) => {
              const checked = (selected[group.id] ?? []).includes(option.id)
              const inputType = group.kind === "presentation" ? "radio" : "checkbox"
              return (
                <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
                  <input
                    type={inputType}
                    name={"product-option-" + group.id}
                    checked={checked}
                    onChange={() => toggle(group, option.id)}
                    aria-label={group.name + ": " + option.name}
                  />
                  <span>{option.name}</span>
                </label>
              )
            })}
            {(selected[group.id]?.length ?? 0) < group.min_selections && (
              <p className="text-xs text-destructive">Debes elegir al menos {group.min_selections} opción(es).</p>
            )}
          </fieldset>
        ))}
        <footer className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={!canConfirm}>Agregar al pedido</Button>
        </footer>
      </section>
    </div>
  )
}
