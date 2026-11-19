"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Edit2 } from "lucide-react"
import { CartItem as CartItemView } from "./cart-item"
import { DiningMode } from "./dining-mode"
import type { CartItem as CartItemType, OrderType } from "@/modules/orders/domain/models"
import type { OperationalBranch } from "@/modules/branches/domain/models"

interface CartProps {
  cartItems: CartItemType[]
  activeBranch: OperationalBranch | null
  onRemoveItem: (id: string) => void
  onUpdateQuantity: (id: string, newQuantity: number) => void
  onPlaceOrder: (order: {
    table_number: string
    customer_name: string
    order_type: OrderType
    legal_entity_id: string
    delivery_address?: string
    delivery_phone?: string
  }) => Promise<{ success: boolean }>
  isPlacingOrder: boolean
}

export function Cart({
  cartItems,
  activeBranch,
  onRemoveItem,
  onUpdateQuantity,
  onPlaceOrder,
  isPlacingOrder,
}: CartProps) {
  const [activeMode, setActiveMode] = useState<OrderType>("Comer aquí")
  const [tableNumber, setTableNumber] = useState("1")
  const [customerName, setCustomerName] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [deliveryPhone, setDeliveryPhone] = useState("")
  const [legalEntitySelection, setLegalEntitySelection] = useState<{ branchId: string; legalEntityId: string } | null>(null)

  const activeBranchId = activeBranch?.id
  const legalEntities = activeBranch?.legal_entities ?? []
  const legalEntityId = activeBranch && legalEntitySelection
    && legalEntitySelection.branchId === activeBranch.id
    ? legalEntitySelection.legalEntityId
    : ""
  const subtotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const tax = subtotal * 0.05
  const total = subtotal + tax

  useEffect(() => {
    if (activeBranchId && legalEntities.length === 1) {
      setLegalEntitySelection({ branchId: activeBranchId, legalEntityId: legalEntities[0].id })
    } else {
      setLegalEntitySelection(null)
    }
  }, [activeBranchId, legalEntities.length, legalEntities[0]?.id])

  const handlePlaceOrder = async () => {
    if (!activeBranch || activeBranch.status !== "active") return
    if (!legalEntityId || !legalEntities.some((entity) => entity.id === legalEntityId)) return
    await onPlaceOrder({
      table_number: activeMode === "Comer aquí" ? tableNumber.trim() : "Pedido",
      customer_name: customerName.trim(),
      order_type: activeMode,
      legal_entity_id: legalEntityId,
      ...(activeMode === "A domicilio"
        ? { delivery_address: deliveryAddress.trim(), delivery_phone: deliveryPhone.trim() }
        : {}),
    })
  }

  const canPlaceOrder = Boolean(
    activeBranch &&
    activeBranch.status === "active" &&
    legalEntities.length > 0 &&
    legalEntities.some((entity) => entity.id === legalEntityId) &&
    cartItems.length > 0 &&
    !isPlacingOrder &&
    (activeMode !== "Comer aquí" || tableNumber.trim()) &&
    (activeMode !== "A domicilio" || (deliveryAddress.trim().length >= 5 && deliveryPhone.trim().length >= 5)),
  )

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
      <div className="border-b p-4 space-y-3">
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">Contexto de operación</p>
          {activeBranch ? (
            <>
              <p className="text-muted-foreground">{activeBranch.code} · {activeBranch.name}</p>
              {activeBranch.status !== "active" && (
                <p role="alert" className="mt-1 text-destructive">
                  Sucursal {activeBranch.status === "suspended" ? "suspendida" : "cerrada"}: solo consulta histórica; no puedes registrar pedidos.
                </p>
              )}
            </>
          ) : (
            <p role="alert" className="text-destructive">No tienes una sucursal activa asignada.</p>
          )}
        </div>
        <label className="block text-sm font-medium">
          Entidad legal que registra esta operación
          <select
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={legalEntityId}
            onChange={(event) => {
              if (activeBranch) {
                setLegalEntitySelection({ branchId: activeBranch.id, legalEntityId: event.target.value })
              }
            }}
            disabled={!activeBranch || legalEntities.length <= 1}
            aria-label="Entidad legal responsable del pedido"
          >
            <option value="" disabled>
              {legalEntities.length === 0
                ? "La sucursal no tiene entidades legales"
                : legalEntities.length === 1
                  ? "Única entidad legal asociada"
                  : "Selecciona la entidad legal"}
            </option>
            {legalEntities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.commercial_name ? `${entity.legal_name} · ${entity.commercial_name}` : entity.legal_name}
              </option>
            ))}
          </select>
        </label>
        {legalEntities.length > 1 && (
          <p className="text-xs text-muted-foreground">
            Elige qué entidad legal registra este pedido. La selección queda guardada en la operación.
          </p>
        )}
        {!activeBranch && (
          <p className="text-xs text-muted-foreground">Selecciona una sucursal en la barra superior para continuar.</p>
        )}
        {activeBranch && legalEntities.length === 0 && (
          <p className="text-xs text-destructive">El propietario debe asociar al menos una entidad legal a esta sucursal.</p>
        )}
        <DiningMode activeMode={activeMode} onSelectMode={setActiveMode} />
        {activeMode === "Comer aquí" && (
          <label htmlFor="table-number" className="block text-sm font-medium">
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
        {activeMode === "A domicilio" && (
          <div className="space-y-2">
            <label htmlFor="delivery-address" className="block text-sm font-medium">
              Dirección de entrega
              <Input
                id="delivery-address"
                className="mt-1"
                minLength={5}
                maxLength={300}
                required
                value={deliveryAddress}
                onChange={(event) => setDeliveryAddress(event.target.value)}
                placeholder="Dirección completa"
              />
            </label>
            <label htmlFor="delivery-phone" className="block text-sm font-medium">
              Teléfono de contacto
              <Input
                id="delivery-phone"
                className="mt-1"
                minLength={5}
                maxLength={32}
                required
                value={deliveryPhone}
                onChange={(event) => setDeliveryPhone(event.target.value)}
                placeholder="Teléfono"
              />
            </label>
          </div>
        )}
        <label htmlFor="customer-name" className="block text-sm font-medium">
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
            <CartItemView key={item.product.id} item={item} onUpdateQuantity={onUpdateQuantity} onRemoveItem={onRemoveItem} />
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
          disabled={!canPlaceOrder}
        >
          {isPlacingOrder ? "Realizando Pedido..." : "Realizar Pedido"}
        </Button>
      </div>
    </aside>
  )
}
