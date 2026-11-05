"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Image from "next/image"
import type { Product } from "@/modules/catalog/domain/models"

interface FoodCardProps {
  product: Product
  onAddToCart: (product: Product) => void
}

export function FoodCard({ product, onAddToCart }: FoodCardProps) {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-40 w-full">
        <Image
          src={product.image_url || "/placeholder.svg"}
          alt={product.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
          unoptimized
          className="object-cover"
        />
        {product.discount_percentage > 0 && (
          <div className="absolute top-2 left-2 bg-yellow-400 text-black px-2 py-1 rounded-md text-xs font-medium">
            {product.discount_percentage}% Desc.
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-medium mb-1">{product.name}</h3>
        <div className="flex justify-between items-center mb-2">
          <span className="text-green-600 font-bold">${product.price.toFixed(2)}</span>
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${product.type === "Veg" ? "bg-green-500" : "bg-red-500"}`}></span>
            <span className="text-xs text-gray-500">{product.type === "Veg" ? "Vegetariano" : "No Vegetariano"}</span>
          </div>
        </div>
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full bg-transparent"
            onClick={() => onAddToCart(product)}
            aria-label={`Agregar ${product.name} al pedido`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
