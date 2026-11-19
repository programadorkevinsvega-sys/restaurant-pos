"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Cart } from "@/components/cart"
import { CategoryFilter } from "@/components/category-filter"
import { FoodGrid } from "@/components/food-grid"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { OperationsPanel } from "@/components/operations/operations-panel"
import { ProductForm } from "@/components/admin/product-form"
import { SidebarNav, type AppSection } from "@/components/sidebar-nav"
import { TableManagement } from "@/components/tables/table-management"
import { toast } from "@/hooks/use-toast"
import { posApplication } from "@/modules/pos/infrastructure/container"
import { HttpError, type AuthenticatedUser } from "@/shared/infrastructure/http-client"
import type { Category, NewProduct, Product } from "@/modules/catalog/domain/models"
import type { CartItem, OrderType } from "@/modules/orders/domain/models"
import type { OrganizationProfile, OrganizationProfileInput, OrganizationProfileUpdate } from "@/modules/organization/domain/models"
import type {
  BestSellingProduct,
  DeliveryOrder,
  Reservation,
  RestaurantSettings,
  RestaurantTable,
  SalesReport,
} from "@/modules/operations/domain/models"

function POSWorkspace({ onLogout, user }: { onLogout: () => void; user: AuthenticatedUser }) {
  const [activeSection, setActiveSection] = useState<AppSection>("menu")
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [activeCategory, setActiveCategory] = useState("all")
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([])
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null)
  const [bestSellingProducts, setBestSellingProducts] = useState<BestSellingProduct[]>([])
  const [settings, setSettings] = useState<RestaurantSettings>({})
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null)
  const [canUpdateOrganization, setCanUpdateOrganization] = useState(false)
  const [organizationLoading, setOrganizationLoading] = useState(false)
  const [organizationLoadError, setOrganizationLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState("")
  const [reloadIndex, setReloadIndex] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    posApplication.listCatalog.getCategories(controller.signal)
      .then(setCategories)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return
        toast({
          title: "No se pudieron cargar las categorías",
          description: error instanceof Error ? error.message : "Error desconocido.",
          variant: "destructive",
        })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (activeSection !== "menu") return
    const controller = new AbortController()
    posApplication.listCatalog.getProducts(
      activeCategory === "all" ? undefined : activeCategory,
      controller.signal,
    )
      .then(setProducts)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return
        toast({
          title: "No se pudieron cargar los productos",
          description: error instanceof Error ? error.message : "Error desconocido.",
          variant: "destructive",
        })
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [activeCategory, activeSection])

  const refreshTables = useCallback(async () => {
    const result = await posApplication.tables.getAll()
    setTables(result)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const attemptNumber = reloadIndex + 1
    const loadSection = async () => {
      try {
        setOperationError("")
        if (activeSection === "tables" || activeSection === "reservations") {
          setTables(await posApplication.tables.getAll(controller.signal))
        }
        if (activeSection === "reservations") {
          setReservations(await posApplication.reservations.getAll(controller.signal))
        }
        if (activeSection === "delivery") {
          setDeliveries(await posApplication.deliveries.getAll(controller.signal))
        }
        if (activeSection === "accounting") {
          const [sales, bestSellers] = await Promise.all([
            posApplication.accounting.getSalesReport(controller.signal),
            posApplication.accounting.getBestSellingProducts(controller.signal),
          ])
          setSalesReport(sales)
          setBestSellingProducts(bestSellers)
        }
        if (activeSection === "settings") {
          setOrganizationLoading(true)
          setOrganizationLoadError(null)
          try {
            setSettings(await posApplication.settings.get(controller.signal))
            try {
              const result = await posApplication.organization.get(controller.signal)
              setOrganization(result.organization)
              setCanUpdateOrganization(result.permissions.can_update)
            } catch (error) {
              if (error instanceof HttpError && error.status === 404) {
                setOrganization(null)
                setCanUpdateOrganization(false)
              } else {
                throw error
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo cargar el perfil corporativo."
            setOrganizationLoadError(message)
            throw error
          } finally {
            if (!controller.signal.aborted) setOrganizationLoading(false)
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        const message = error instanceof Error ? error.message : "No se pudo cargar la información."
        setOperationError(message)
        toast({
          title: `Error al cargar la sección (intento ${attemptNumber})`,
          description: message,
          variant: "destructive",
        })
      }
    }

    void loadSection()
    return () => controller.abort()
  }, [activeSection, reloadIndex])

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return products
    return products.filter((product) =>
      `${product.name} ${product.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
    )
  }, [products, query])

  const handleAddToCart = useCallback((product: Product) => {
    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      return existing
        ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1 }]
    })
  }, [])

  const handleUpdateQuantity = useCallback((productId: string, quantity: number) => {
    setCartItems((current) => quantity <= 0
      ? current.filter((item) => item.product.id !== productId)
      : current.map((item) => item.product.id === productId ? { ...item, quantity } : item))
  }, [])

  const handlePlaceOrder = useCallback(async (order: {
    table_number: string
    customer_name: string
    order_type: OrderType
    total_amount: number
  }) => {
    setIsPlacingOrder(true)
    try {
      const receipt = await posApplication.createOrder.execute({
        ...order,
        items: cartItems.map(({ product, quantity }) => ({
          id: product.id,
          name: product.name,
          price: product.price,
          image_url: product.image_url,
          quantity,
        })),
      })
      setCartItems([])
      toast({ title: "Pedido enviado", description: `Pedido #${receipt.orderId} enviado a cocina.` })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el pedido."
      toast({ title: "Error al crear el pedido", description: message, variant: "destructive" })
      return { success: false }
    } finally {
      setIsPlacingOrder(false)
    }
  }, [cartItems])

  const handleCreateProduct = async (product: NewProduct) => {
    try {
      await posApplication.createProduct.execute(product)
      setActiveCategory("all")
      setActiveSection("menu")
      toast({ title: "Producto creado", description: `${product.name} se agregó al menú.` })
    } catch (error) {
      toast({
        title: "No se pudo crear el producto",
        description: error instanceof Error ? error.message : "Error desconocido.",
        variant: "destructive",
      })
    }
  }

  const handleCreateTable = async (number: string, capacity: number) => {
    try {
      await posApplication.tables.create(number, capacity)
      await refreshTables()
      toast({ title: "Mesa creada" })
    } catch (error) {
      toast({ title: "No se pudo crear la mesa", description: error instanceof Error ? error.message : "Error desconocido.", variant: "destructive" })
    }
  }

  const handleUpdateTableStatus = async (id: string, status: string) => {
    try {
      await posApplication.tables.updateStatus(id, status)
      await refreshTables()
      toast({ title: "Estado de mesa actualizado" })
    } catch (error) {
      toast({ title: "No se pudo actualizar la mesa", description: error instanceof Error ? error.message : "Error desconocido.", variant: "destructive" })
      throw error
    }
  }

  const handleCreateReservation = async (reservation: Omit<Reservation, "id" | "status">) => {
    await posApplication.reservations.create(reservation)
    setReservations(await posApplication.reservations.getAll())
    toast({ title: "Reservación creada" })
  }

  const handleUpdateReservationStatus = async (id: string, status: string) => {
    await posApplication.reservations.updateStatus(id, status)
    setReservations(await posApplication.reservations.getAll())
  }

  const handleAssignDriver = async (orderId: string, name: string, phone: string, eta: string) => {
    await posApplication.deliveries.assignDriver(orderId, name, phone, eta)
    setDeliveries(await posApplication.deliveries.getAll())
    toast({ title: "Repartidor asignado" })
  }

  const handleUpdateSettings = async (nextSettings: RestaurantSettings) => {
    await posApplication.settings.update(nextSettings)
    setSettings(nextSettings)
    toast({ title: "Configuración guardada" })
  }

  const handleBootstrapOrganization = async (input: OrganizationProfileInput) => {
    const result = await posApplication.organization.bootstrap(input)
    setOrganization(result.organization)
    setCanUpdateOrganization(result.permissions.can_update)
    setOrganizationLoadError(null)
    toast({ title: "Organización creada", description: "Los datos corporativos quedaron registrados." })
  }

  const handleUpdateOrganization = async (input: OrganizationProfileUpdate) => {
    const result = await posApplication.organization.update(input)
    setOrganization(result.organization)
    setCanUpdateOrganization(result.permissions.can_update)
    setOrganizationLoadError(null)
    toast({ title: "Datos corporativos guardados" })
  }

  const handleCreateCategory = async (name: string) => {
    const category = await posApplication.createCategory.execute(name)
    setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name)))
    toast({ title: "Categoría creada" })
  }

  const renderSection = () => {
    if (activeSection === "menu") {
      return (
        <main className="min-w-0 flex-1 space-y-4 overflow-auto p-4">
          <CategoryFilter
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={(categoryId) => {
              setIsLoading(true)
              setActiveCategory(categoryId)
            }}
          />
          {isLoading
            ? <p className="py-16 text-center text-muted-foreground">Cargando menú…</p>
            : <FoodGrid products={visibleProducts} onAddToCart={handleAddToCart} />}
        </main>
      )
    }
    if (activeSection === "tables") {
      return <TableManagement tables={tables} onCreate={handleCreateTable} onUpdateStatus={handleUpdateTableStatus} />
    }
    if (activeSection === "add-product") {
      return (
        <main className="flex-1 overflow-auto p-6">
          <ProductForm categories={categories} onSubmit={handleCreateProduct} onCancel={() => setActiveSection("menu")} />
        </main>
      )
    }
    return (
      <OperationsPanel
        section={activeSection}
        tables={tables}
        reservations={reservations}
        deliveries={deliveries}
        salesReport={salesReport}
        bestSellingProducts={bestSellingProducts}
        settings={settings}
        categories={categories}
        onCreateReservation={handleCreateReservation}
        onUpdateReservationStatus={handleUpdateReservationStatus}
        onAssignDriver={handleAssignDriver}
        onUpdateSettings={handleUpdateSettings}
        onCreateCategory={handleCreateCategory}
        organization={organization}
        organizationLoading={organizationLoading}
        canUpdateOrganization={canUpdateOrganization}
        canBootstrapOrganization={user.role === "admin"}
        organizationLoadError={organizationLoadError}
        onBootstrapOrganization={handleBootstrapOrganization}
        onUpdateOrganization={handleUpdateOrganization}
      />
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 lg:h-screen lg:flex-row">
      <SidebarNav
        activeSection={activeSection}
        onNavigate={(section) => {
          if (section === "menu") setIsLoading(true)
          setActiveSection(section)
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header query={query} onQueryChange={setQuery} onLogout={onLogout} />
        {operationError && activeSection !== "menu" && activeSection !== "add-product" && (
          <div role="alert" className="mx-4 mt-3 flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <span>{operationError}</span>
            <Button variant="outline" size="sm" onClick={() => setReloadIndex((current) => current + 1)}>Reintentar</Button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {renderSection()}
          {activeSection === "menu" && (
            <Cart
              cartItems={cartItems}
              onRemoveItem={(id) => handleUpdateQuantity(id, 0)}
              onUpdateQuantity={handleUpdateQuantity}
              onPlaceOrder={handlePlaceOrder}
              isPlacingOrder={isPlacingOrder}
            />
          )}
        </div>
        <Footer />
      </div>
    </div>
  )
}

export default function POSPage() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [authStatus, setAuthStatus] = useState<"checking" | "signed-out" | "signed-in" | "error">("checking")
  const [authError, setAuthError] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const checkSession = useCallback(async () => {
    setAuthStatus("checking")
    setAuthError("")
    try {
      setUser(await posApplication.auth.currentUser())
      setAuthStatus("signed-in")
    } catch (error) {
      setUser(null)
      if (error instanceof HttpError && error.status === 401) {
        setAuthStatus("signed-out")
      } else {
        setAuthError(error instanceof Error ? error.message : "No se pudo verificar la sesión.")
        setAuthStatus("error")
      }
    }
  }, [])

  useEffect(() => {
    let active = true
    posApplication.auth.currentUser()
      .then((authenticatedUser) => {
        if (!active) return
        setUser(authenticatedUser)
        setAuthStatus("signed-in")
      })
      .catch((error: unknown) => {
        if (!active) return
        setUser(null)
        if (error instanceof HttpError && error.status === 401) {
          setAuthStatus("signed-out")
        } else {
          setAuthError(error instanceof Error ? error.message : "No se pudo verificar la sesión.")
          setAuthStatus("error")
        }
      })
    return () => {
      active = false
    }
  }, [])

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setAuthError("")
    try {
      const result = await posApplication.auth.login(email, password)
      setUser(result.user)
      setPassword("")
      setAuthStatus("signed-in")
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo iniciar sesión.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await posApplication.auth.logout()
      setUser(null)
      setAuthStatus("signed-out")
      setPassword("")
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "No se pudo cerrar sesión.")
    }
  }

  if (authStatus === "checking") {
    return <main className="flex min-h-screen items-center justify-center bg-gray-100 text-muted-foreground">Verificando sesión…</main>
  }

  if (authStatus === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-100 p-6">
        <p role="alert" className="text-center text-sm text-destructive">{authError}</p>
        <Button onClick={() => void checkSession()}>Reintentar</Button>
      </main>
    )
  }

  if (authStatus === "signed-out" || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-5 rounded-lg border bg-white p-6 shadow-sm">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold">Chili POS</h1>
            <p className="text-sm text-muted-foreground">Inicia sesión para continuar</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-email">Correo electrónico</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Contraseña</Label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {authError && <p role="alert" className="text-sm text-destructive">{authError}</p>}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Iniciando sesión…" : "Iniciar sesión"}
          </Button>
        </form>
      </main>
    )
  }

  return <POSWorkspace user={user} onLogout={() => void handleLogout()} />
}
