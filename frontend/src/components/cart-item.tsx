"use client"

import { Minus, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import type { CartItem as CartItemType } from "@/modules/orders/domain/models"

interface CartItemProps {
  item: CartItemType
  onUpdateQuantity: (id: string, newQuantity: number) => void
  onRemoveItem: (id: string) => void
}

export function CartItem({ item, onUpdateQuantity, onRemoveItem }: CartItemProps) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <Image
        src={item.product.image_url || "/placeholder.svg"}
        alt={item.product.name}
        width={64}
        height={64}
        unoptimized
        className="h-16 w-16 rounded-lg object-cover"
      />
      <div className="flex-1">
        <h4 className="mb-1 text-sm font-medium">{item.product.name}</h4>
        <div className="flex justify-between items-center">
          <span className="font-bold text-green-600">${item.product.price.toFixed(2)}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-full bg-transparent"
              onClick={() => onUpdateQuantity(item.product.id, item.quantity - 1)}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-sm font-medium">{item.quantity}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-6 w-6 rounded-full bg-transparent"
              onClick={() => onUpdateQuantity(item.product.id, item.quantity + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full text-red-500"
              onClick={() => onRemoveItem(item.product.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
