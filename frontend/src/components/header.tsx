import { LogOut, Search, Share2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { OperationalBranch } from "@/modules/branches/domain/models"

interface HeaderProps {
  query: string
  onQueryChange: (query: string) => void
  onLogout: () => void
  branches: OperationalBranch[]
  activeBranchId: string | null
  onActiveBranchChange: (branchId: string) => void
}

export function Header({
  query,
  onQueryChange,
  onLogout,
  branches,
  activeBranchId,
  onActiveBranchChange,
}: HeaderProps) {
  return (
    <div className="bg-white p-4 flex flex-wrap items-center gap-3 border-b">
      <div className="flex-1 min-w-[180px] relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input
          type="search"
          placeholder="Buscar producto aquí..."
          className="pl-10 w-full"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          aria-label="Buscar producto"
        />
      </div>
      <label className="flex min-w-[190px] flex-col gap-1 text-xs font-medium text-muted-foreground">
        Sucursal activa
        <select
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={activeBranchId ?? ""}
          onChange={(event) => onActiveBranchChange(event.target.value)}
          disabled={branches.length === 0}
          aria-label="Sucursal activa"
        >
          <option value="" disabled>
            {branches.length === 0 ? "Sin sucursales asignadas" : "Selecciona una sucursal"}
          </option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" size="icon" aria-label="Compartir">
        <Share2 className="h-5 w-5" />
      </Button>
      <Button variant="outline" onClick={onLogout}>
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  )
}
