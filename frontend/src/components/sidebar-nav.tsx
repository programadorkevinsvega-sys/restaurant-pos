import { Menu, TableIcon as TableBar, CalendarRange, Truck, Calculator, Settings, Package, ChefHat } from "lucide-react"
import { Button } from "@/components/ui/button"

export type AppSection = "menu" | "catalog" | "recipes" | "tables" | "reservations" | "delivery" | "accounting" | "settings"

const navItems: Array<{ id: AppSection; icon: typeof Menu; label: string }> = [
  { id: "menu", icon: Menu, label: "Punto de venta" },
  { id: "catalog", icon: Package, label: "Catálogo" },
  { id: "recipes", icon: ChefHat, label: "Recetas" },
  { id: "tables", icon: TableBar, label: "Mesas" },
  { id: "reservations", icon: CalendarRange, label: "Reservaciones" },
  { id: "delivery", icon: Truck, label: "Entregas" },
  { id: "accounting", icon: Calculator, label: "Contabilidad" },
  { id: "settings", icon: Settings, label: "Configuración" },
]

interface SidebarNavProps {
  activeSection: AppSection
  onNavigate: (section: AppSection) => void
}

export function SidebarNav({ activeSection, onNavigate }: SidebarNavProps) {
  return (
    <aside className="flex h-auto w-full shrink-0 flex-row items-center border-b bg-white p-2 lg:h-screen lg:w-64 lg:flex-col lg:items-stretch lg:border-b-0 lg:border-r lg:p-4">
      <div className="mb-2 flex shrink-0 items-center gap-2 lg:mb-8">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 font-bold text-white" aria-hidden="true">C</span>
        <span className="font-semibold">CHILI POS</span>
      </div>
      <nav className="flex flex-1 gap-1 overflow-x-auto lg:flex-col lg:space-y-2">
        {navItems.map((item) => (
          <Button
            key={item.id}
            variant={activeSection === item.id ? "secondary" : "ghost"}
            className="min-w-fit justify-start"
            onClick={() => onNavigate(item.id)}
            aria-current={activeSection === item.id ? "page" : undefined}
          >
            <item.icon className="mr-2 h-4 w-4" />
            {item.label}
          </Button>
        ))}
      </nav>
    </aside>
  )
}
