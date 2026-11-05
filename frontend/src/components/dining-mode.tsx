"use client"

import { Button } from "@/components/ui/button"
import type { OrderType } from "@/modules/orders/domain/models"

interface DiningModeProps {
  activeMode: OrderType
  onSelectMode: (mode: OrderType) => void
}

const modes: OrderType[] = ["Comer aquí", "Para llevar", "A domicilio"]

export function DiningMode({ activeMode, onSelectMode }: DiningModeProps) {
  return (
    <div className="flex gap-2 mb-4">
      {modes.map((mode) => (
        <Button
          key={mode}
          variant={activeMode === mode ? "secondary" : "ghost"}
          className="rounded-full flex-1"
          onClick={() => onSelectMode(mode)}
        >
          {mode}
        </Button>
      ))}
    </div>
  )
}
