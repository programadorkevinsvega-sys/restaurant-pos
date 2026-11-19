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
  const optionSummary = item.selectedOptions.map((option) => option.name).join(" · ")
  return (
    <div className="mb-4 flex items-center gap-3">
      <Image src={item.product.image_url || "/placeholder.svg"} alt={item.product.name} width={64} height={64} unoptimized className="h-16 w-16 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <h4 className="mb-1 text-sm font-medium">{item.product.name}</h4>
        {optionSummary && <p className="mb-1 text-xs text-muted-foreground">{optionSummary}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-green-600">${item.product.price.toFixed(2)}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full bg-transparent" onClick={() => onUpdateQuantity(item.lineId, item.quantity - 1)} aria-label={`Reducir ${item.product.name}`}><Minus className="h-3 w-3" /></Button>
            <span className="text-sm font-medium">{item.quantity}</span>
            <Button variant="outline" size="icon" className="h-6 w-6 rounded-full bg-transparent" onClick={() => onUpdateQuantity(item.lineId, item.quantity + 1)} aria-label={`Aumentar ${item.product.name}`}><Plus className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full text-red-500" onClick={() => onRemoveItem(item.lineId)} aria-label={`Quitar ${item.product.name}`}><Trash2 className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>
    </div>
  )
}
