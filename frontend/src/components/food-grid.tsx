import { FoodCard } from "./food-card"
import type { Product } from "@/modules/catalog/domain/models"

interface FoodGridProps {
  products: Product[]
  onAddToCart: (product: Product) => void
}

export function FoodGrid({ products, onAddToCart }: FoodGridProps) {
  if (products.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">No hay productos para mostrar.</p>
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {products.map((item) => (
        <FoodCard key={item.id} product={item} onAddToCart={onAddToCart} />
      ))}
    </div>
  )
}
