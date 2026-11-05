"use client"

import type React from "react"

import { Grid, Coffee, Soup, UtensilsCrossed, ChefHat, Sandwich } from "lucide-react"
import type { Category } from "@/modules/catalog/domain/models"

interface CategoryFilterProps {
  categories: Category[]
  activeCategory: string | null
  onSelectCategory: (categoryId: string) => void
}

// Mapeo de nombres de iconos a componentes de Lucide
const iconMap: { [key: string]: React.ElementType } = {
  Grid: Grid,
  Coffee: Coffee,
  Soup: Soup,
  UtensilsCrossed: UtensilsCrossed,
  ChefHat: ChefHat,
  Sandwich: Sandwich,
  // Añade más mapeos si usas otros iconos en tu DB
}

export function CategoryFilter({ categories, activeCategory, onSelectCategory }: CategoryFilterProps) {
  const allCategory: Category = { id: "all", name: "Todos", icon: "Grid", item_count: 0 }
  const displayCategories = [allCategory, ...categories]

  return (
    <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
      {displayCategories.map((category) => {
        const IconComponent = iconMap[category.icon || "Grid"] // Usa Grid como fallback
        return (
          <button
            key={category.id}
            type="button"
            className={`flex flex-col items-center p-3 rounded-xl min-w-[100px] ${
              activeCategory === category.id ? "bg-green-50 text-green-600" : "bg-white"
            } border cursor-pointer hover:bg-green-50`}
            onClick={() => onSelectCategory(category.id)}
            aria-pressed={activeCategory === category.id}
          >
            {IconComponent && <IconComponent className="h-6 w-6 mb-1" />}
            <span className="text-sm font-medium">{category.name}</span>
            {category.item_count > 0 && <span className="text-xs text-gray-500">{category.item_count} Items</span>}
          </button>
        )
      })}
    </div>
  )
}
