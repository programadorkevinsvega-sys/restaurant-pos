import { LogOut, Search, Share2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface HeaderProps {
  query: string
  onQueryChange: (query: string) => void
  onLogout: () => void
}

export function Header({ query, onQueryChange, onLogout }: HeaderProps) {
  return (
    <div className="bg-white p-4 flex items-center gap-4 border-b">
      <div className="flex-1 relative">
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
