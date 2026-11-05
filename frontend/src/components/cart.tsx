"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Edit2 } from "lucide-react"
import { CartItem } from "./cart-item"
import { DiningMode } from "./dining-mode"
import type { CartItem as CartItemType, OrderType } from "@/modules/orders/domain/models"
import { useState } from "react"

interface CartProps {
  cartItems: CartItemType[]
  onRemoveItem: (id: string) => void
  onUpdateQuantity: (id: string, newQuantity: number) => void
  onPlaceOrder: (order: {
    table_number: string
    customer_name: string
    order_type: OrderType
    total_amount: number
  }) => Promise<{ success: boolean }>
  isPlacingOrder: boolean
}

export function Cart({ cartItems, onRemoveItem, onUpdateQuantity, onPlaceOrder, isPlacingOrder }: CartProps) {
  const [activeMode, setActiveMode] = useState<OrderType>("Comer aquí")
  const [tableNumber, setTableNumber] = useState("1")
  const [customerName, setCustomerName] = useState("")

  const subtotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const tax = subtotal * 0.05
  const total = subtotal + tax

  const handlePlaceOrder = async () => {
    await onPlaceOrder({
      table_number: activeMode === "Comer aquí" ? tableNumber.trim() : "Pedido",
      customer_name: customerName.trim(),
      order_type: activeMode,
      total_amount: total,
    })
  }

  return (
    <aside className="flex h-full w-full flex-col border-l bg-white lg:w-[380px]">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="text-xl font-bold">Pedido actual</h2>
          <p className="text-sm text-gray-500">{cartItems.length} productos</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Editar pedido">
          <Edit2 className="h-5 w-5" />
        </Button>
      </div>
      <div className="border-b p-4">
        <DiningMode activeMode={activeMode} onSelectMode={setActiveMode} />
        {activeMode === "Comer aquí" && (
          <label htmlFor="table-number" className="mt-2 block text-sm font-medium">
            Mesa
            <Input
              id="table-number"
              className="mt-1"
              min="1"
              value={tableNumber}
              onChange={(event) => setTableNumber(event.target.value)}
              aria-label="Número de mesa"
            />
          </label>
        )}
        <label htmlFor="customer-name" className="mt-2 block text-sm font-medium">
          Cliente (opcional)
          <Input
            id="customer-name"
            className="mt-1"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
            placeholder="Nombre del cliente"
          />
        </label>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {cartItems.length === 0 ? (
          <p className="mt-10 text-center text-gray-500">El pedido está vacío. Agrega productos del menú.</p>
        ) : (
          cartItems.map((item) => (
            <CartItem key={item.product.id} item={item} onUpdateQuantity={onUpdateQuantity} onRemoveItem={onRemoveItem} />
          ))
        )}
      </div>
      <div className="border-t p-4">
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Impuesto 5%</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Monto Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12"
          onClick={handlePlaceOrder}
          disabled={isPlacingOrder || cartItems.length === 0 || !tableNumber.trim()}
        >
          {isPlacingOrder ? "Realizando Pedido..." : "Realizar Pedido"}
        </Button>
      </div>
    </aside>
  )
}
