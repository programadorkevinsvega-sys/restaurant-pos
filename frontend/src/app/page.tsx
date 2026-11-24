"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Cart } from "@/components/cart"
import { CategoryFilter } from "@/components/category-filter"
import { FoodGrid } from "@/components/food-grid"
import { Footer } from "@/components/footer"
import { Header } from "@/components/header"
import { OperationsPanel } from "@/components/operations/operations-panel"
import { CatalogManagementPanel } from "@/components/catalog/catalog-management-panel"
import { RecipeManagementPanel } from "@/components/recipes/recipe-management-panel"
import { VariantsManagementPanel } from "@/components/variants/variants-management-panel"
import { PricingManagementPanel } from "@/components/pricing/pricing-management-panel"
import { ProductOptionsDialog } from "@/components/pos/product-options-dialog"
import { SidebarNav, type AppSection } from "@/components/sidebar-nav"
import { TableManagement } from "@/components/tables/table-management"
import { toast } from "@/hooks/use-toast"
import { posApplication } from "@/modules/pos/infrastructure/container"
import { HttpError, type AuthenticatedUser } from "@/shared/infrastructure/http-client"
import type { BranchCatalogProduct, Category, Product } from "@/modules/catalog/domain/models"
import type { CartItem, OrderSummary, OrderType } from "@/modules/orders/domain/models"
import type { PosProductOptionGroup, ProductOptionSelection } from "@/modules/variants/domain/models"
import type {
  OrganizationHistoryFilters,
  OrganizationHistoryPage,
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationProfileUpdate,
} from "@/modules/organization/domain/models"
import type { LegalEntity, LegalEntityInput } from "@/modules/legal-entities/domain/models"
import type {
  Branch,
  BranchCalendarExceptionInput,
  BranchInput,
  BranchLifecycleEvent,
  BranchLocalConfiguration,
  BranchStatus,
  BranchUpdate,
  BranchUser,
  OperationalBranch,
} from "@/modules/branches/domain/models"
import type {
  BestSellingProduct,
  DeliveryOrder,
  Reservation,
  ReservationFilters,
  RestaurantSettings,
  RestaurantTable,
  TableStatus,
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
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([])
  const [salesReport, setSalesReport] = useState<SalesReport | null>(null)
  const [bestSellingProducts, setBestSellingProducts] = useState<BestSellingProduct[]>([])
  const [settings, setSettings] = useState<RestaurantSettings>({})
  const [organization, setOrganization] = useState<OrganizationProfile | null>(null)
  const [canUpdateOrganization, setCanUpdateOrganization] = useState(false)
  const [organizationLoading, setOrganizationLoading] = useState(false)
  const [organizationLoadError, setOrganizationLoadError] = useState<string | null>(null)
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchUsersByBranch, setBranchUsersByBranch] = useState<Record<string, BranchUser[]>>({})
  const [branchLifecycleEventsByBranch, setBranchLifecycleEventsByBranch] = useState<Record<string, BranchLifecycleEvent[]>>({})
  const [availableBranches, setAvailableBranches] = useState<OperationalBranch[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [canManageCorporateStructure, setCanManageCorporateStructure] = useState(false)
  const [corporateStructureLoading, setCorporateStructureLoading] = useState(false)
  const [corporateStructureLoadError, setCorporateStructureLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState("")
  const [reloadIndex, setReloadIndex] = useState(0)
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([])
  const [catalogCategories, setCatalogCategories] = useState<Category[]>([])
  const [catalogBranchProducts, setCatalogBranchProducts] = useState<BranchCatalogProduct[]>([])
  const [selectedCatalogBranchId, setSelectedCatalogBranchId] = useState("")
  const [recipeProducts, setRecipeProducts] = useState<Product[]>([])
  const [recipesLoading, setRecipesLoading] = useState(false)
  const [variantDialog, setVariantDialog] = useState<{ product: Product; groups: PosProductOptionGroup[] } | null>(null)
  const variantRequestSequence = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    posApplication.branches.listAvailable(controller.signal)
      .then(({ branches: assignedBranches }) => {
        if (controller.signal.aborted) return
        setAvailableBranches(assignedBranches)
        const initialBranchId = assignedBranches.length === 1 ? assignedBranches[0].id : null
        setActiveBranchId(initialBranchId)
        posApplication.setActiveBranchId(initialBranchId)
        setReloadIndex((current) => current + 1)
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return
        toast({
          title: "No se pudieron cargar tus sucursales",
          description: error instanceof Error ? error.message : "Error desconocido.",
          variant: "destructive",
        })
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activeBranchId) {
      setCategories([])
      return
    }
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
  }, [activeBranchId])

  useEffect(() => {
    if (activeSection !== "menu") return
    if (!activeBranchId) {
      setProducts([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
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
  }, [activeCategory, activeBranchId, activeSection])

  const refreshTables = useCallback(async () => {
    const result = await posApplication.tables.getAll()
    setTables(result)
  }, [])

  const refreshCorporateStructure = useCallback(async (signal?: AbortSignal) => {
    const [entityResult, branchResult] = await Promise.all([
      posApplication.legalEntities.list(signal),
      posApplication.branches.list(signal),
    ])
    if (signal?.aborted) return
    setLegalEntities(entityResult.legal_entities)
    setBranches(branchResult.branches)
    const branchEntries = await Promise.all(branchResult.branches.map(async (branch) => {
      const [users, lifecycle] = await Promise.all([
        posApplication.branches.listUsers(branch.id, signal),
        posApplication.branches.listLifecycleEvents(branch.id, signal),
      ])
      return [branch.id, users.users, lifecycle.events] as const
    }))
    if (signal?.aborted) return
    setBranchUsersByBranch(Object.fromEntries(branchEntries.map(([id, users]) => [id, users])))
    setBranchLifecycleEventsByBranch(Object.fromEntries(branchEntries.map(([id, , events]) => [id, events])))
    setCanManageCorporateStructure(
      entityResult.permissions.can_manage && branchResult.permissions.can_manage,
    )
    setCorporateStructureLoadError(null)
  }, [])

  useEffect(() => {
    if (activeSection !== "catalog" && activeSection !== "variants" && activeSection !== "pricing") return
    const controller = new AbortController()
    setCorporateStructureLoading(true)
    void (async () => {
      try {
        await refreshCorporateStructure(controller.signal)
        const branchResult = await posApplication.branches.list(controller.signal)
        const [masterProducts, masterCategories] = await Promise.all([
          posApplication.corporateCatalog.listProducts(),
          posApplication.corporateCatalog.listCategories(),
        ])
        if (controller.signal.aborted) return
        setBranches(branchResult.branches)
        setCatalogProducts(masterProducts)
        setCatalogCategories(masterCategories)
        const selected = selectedCatalogBranchId && branchResult.branches.some((branch) => branch.id === selectedCatalogBranchId)
          ? selectedCatalogBranchId : branchResult.branches[0]?.id ?? ""
        setSelectedCatalogBranchId(selected)
        setCatalogBranchProducts(selected ? await posApplication.corporateCatalog.listBranchProducts(selected) : [])
      } catch (error) {
        if (!controller.signal.aborted) setCorporateStructureLoadError(error instanceof Error ? error.message : "No se pudo cargar el catálogo corporativo.")
      } finally {
        if (!controller.signal.aborted) setCorporateStructureLoading(false)
      }
    })()
    return () => controller.abort()
  }, [activeSection, refreshCorporateStructure, selectedCatalogBranchId])

  useEffect(() => {
    const controller = new AbortController()
    const attemptNumber = reloadIndex + 1
    const loadSection = async () => {
      try {
        setOperationError("")
    if (activeSection === "tables") {
          const [tableRows, orderRows] = await Promise.all([
            posApplication.tables.getAll(controller.signal),
            posApplication.listOrders.execute({ limit: 100 }, controller.signal),
          ])
          setTables(tableRows)
          setOrders(orderRows)
        }
        if (activeSection === "reservations") {
          const [tableRows, reservationRows] = await Promise.all([
            posApplication.tables.getAll(controller.signal),
            posApplication.reservations.getAll({}, controller.signal),
          ])
          setTables(tableRows)
          setReservations(reservationRows)
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
          setCorporateStructureLoading(true)
          setOrganizationLoadError(null)
          setCorporateStructureLoadError(null)
          try {
            setSettings(await posApplication.settings.get(controller.signal))
            let profile = null
            try {
              profile = await posApplication.organization.get(controller.signal)
            } catch (error) {
              if (!(error instanceof HttpError && error.status === 404)) {
                const message = error instanceof Error ? error.message : "No se pudo cargar el perfil corporativo."
                setOrganizationLoadError(message)
                throw error
              }
            }

            if (profile) {
              setOrganization(profile.organization)
              setCanUpdateOrganization(profile.permissions.can_update)
              try {
                await refreshCorporateStructure(controller.signal)
              } catch (error) {
                if (error instanceof Error && error.name === "AbortError") return
                const message = error instanceof Error ? error.message : "No se pudo cargar la estructura corporativa."
                setCorporateStructureLoadError(message)
              }
            } else {
              setOrganization(null)
              setCanUpdateOrganization(false)
              setLegalEntities([])
              setBranches([])
              setCanManageCorporateStructure(false)
            }
          } finally {
            if (!controller.signal.aborted) {
              setOrganizationLoading(false)
              setCorporateStructureLoading(false)
            }
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
  }, [activeSection, reloadIndex, refreshCorporateStructure])

  useEffect(() => {
    if (activeSection !== "recipes") return
    const controller = new AbortController()
    setRecipesLoading(true)
    void (async () => {
      try {
        await refreshCorporateStructure(controller.signal)
        const productsResult = await posApplication.corporateCatalog.listProducts()
        if (!controller.signal.aborted) setRecipeProducts(productsResult)
      } catch (error) {
        if (!controller.signal.aborted) {
          toast({
            title: "No se pudo cargar el catálogo para recetas",
            description: error instanceof Error ? error.message : "Error desconocido.",
            variant: "destructive",
          })
        }
      } finally {
        if (!controller.signal.aborted) setRecipesLoading(false)
      }
    })()
    return () => controller.abort()
  }, [activeSection, refreshCorporateStructure])

  const refreshAvailableBranches = async () => {
    const result = await posApplication.branches.listAvailable()
    const currentBranch = availableBranches.find((branch) => branch.id === activeBranchId)
    const nextBranch = result.branches.find((branch) => branch.id === activeBranchId)
    const nextBranchId = nextBranch
      ? nextBranch.id
      : result.branches.length === 1 ? result.branches[0].id : null
    const contextChanged = nextBranchId !== activeBranchId
    const currentBranchBecameReadOnly = Boolean(
      currentBranch?.status === "active" && nextBranch && nextBranch.status !== "active",
    )

    setAvailableBranches(result.branches)
    setActiveBranchId(nextBranchId)
    posApplication.setActiveBranchId(nextBranchId)

    if (contextChanged || currentBranchBecameReadOnly) {
      variantRequestSequence.current += 1
      setVariantDialog(null)
      setActiveCategory("all")
      setCategories([])
      setProducts([])
      setCartItems([])
      setTables([])
      setOrders([])
      setReservations([])
      setDeliveries([])
      setIsLoading(Boolean(nextBranchId))
      setOperationError("")
      setReloadIndex((current) => current + 1)
    }
  }

  const handleActiveBranchChange = (branchId: string) => {
    if (!availableBranches.some((branch) => branch.id === branchId)) return
    variantRequestSequence.current += 1
    setVariantDialog(null)
    setActiveBranchId(branchId)
    posApplication.setActiveBranchId(branchId)
    setActiveCategory("all")
    setCategories([])
    setProducts([])
    setCartItems([])
    setIsLoading(true)
    setDeliveries([])
    setOperationError("")
    setReloadIndex((current) => current + 1)
  }

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    if (!normalizedQuery) return products
    return products.filter((product) =>
      `${product.name} ${product.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
    )
  }, [products, query])

  const addConfiguredProduct = useCallback((product: Product, selectedOptions: ProductOptionSelection[]) => {
    const optionIds = selectedOptions.map((option) => option.id).sort()
    const lineId = `${product.id}:${optionIds.join(".") || "default"}`
    setCartItems((current) => {
      const existing = current.find((item) => item.lineId === lineId)
      return existing
        ? current.map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { lineId, product, quantity: 1, selectedOptions }]
    })
  }, [])

  const handleAddToCart = useCallback(async (product: Product) => {
    const requestSequence = ++variantRequestSequence.current
    try {
      const configuration = await posApplication.variants.getForPos(product.id)
      if (requestSequence !== variantRequestSequence.current) return
      if (configuration.groups.length > 0) {
        setVariantDialog({ product, groups: configuration.groups })
      } else {
        addConfiguredProduct(product, [])
      }
    } catch (error) {
      if (requestSequence !== variantRequestSequence.current) return
      toast({
        title: "No se pudieron cargar las opciones del producto",
        description: error instanceof Error ? error.message : "No fue posible consultar las opciones para la sucursal activa.",
        variant: "destructive",
      })
    }
  }, [addConfiguredProduct])

  const handleUpdateQuantity = useCallback((lineId: string, quantity: number) => {
    setCartItems((current) => quantity <= 0
      ? current.filter((item) => item.lineId !== lineId)
      : current.map((item) => item.lineId === lineId ? { ...item, quantity } : item))
  }, [])

  const handlePlaceOrder = useCallback(async (order: {
    table_number: string
    customer_name: string
    order_type: OrderType
    legal_entity_id: string
    delivery_address?: string
    delivery_phone?: string
  }) => {
    setIsPlacingOrder(true)
    try {
      const receipt = await posApplication.createOrder.execute({
        ...order,
        items: cartItems.map(({ product, quantity, selectedOptions }) => ({
          id: product.id,
          quantity,
          option_ids: selectedOptions.map((option) => option.id),
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

  const refreshCatalogManagement = useCallback(async (branchId = selectedCatalogBranchId) => {
    const [nextProducts, nextCategories] = await Promise.all([
      posApplication.corporateCatalog.listProducts(),
      posApplication.corporateCatalog.listCategories(),
    ])
    setCatalogProducts(nextProducts)
    setCatalogCategories(nextCategories)
    if (branchId) setCatalogBranchProducts(await posApplication.corporateCatalog.listBranchProducts(branchId))
  }, [selectedCatalogBranchId])

  const handleCreateTable = async (number: string, capacity: number) => {
    try {
      await posApplication.tables.create(number, capacity)
      await refreshTables()
      toast({ title: "Mesa creada" })
    } catch (error) {
      toast({ title: "No se pudo crear la mesa", description: error instanceof Error ? error.message : "Error desconocido.", variant: "destructive" })
    }
  }

  const handleUpdateTableStatus = async (id: string, status: TableStatus, currentOrderId?: string | null) => {
    try {
      await posApplication.tables.updateStatus(id, status, currentOrderId)
      await refreshTables()
      setOrders(await posApplication.listOrders.execute({ limit: 100 }))
      toast({ title: "Mesa actualizada" })
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

  const handleUpdateReservationStatus = async (id: string, status: Reservation["status"]) => {
    await posApplication.reservations.updateStatus(id, status)
    setReservations(await posApplication.reservations.getAll())
  }

  const handleListReservations = async (filters: ReservationFilters) => {
    setReservations(await posApplication.reservations.getAll(filters))
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
    setCorporateStructureLoading(true)
    try {
      await refreshCorporateStructure()
    } finally {
      setCorporateStructureLoading(false)
    }
    toast({ title: "Organización creada", description: "Los datos corporativos quedaron registrados." })
  }

  const handleListOrganizationHistory = useCallback((
    filters: OrganizationHistoryFilters,
  ): Promise<OrganizationHistoryPage> => posApplication.organization.listHistory(filters), [])

  const handleUpdateOrganization = async (input: OrganizationProfileUpdate) => {
    const result = await posApplication.organization.update(input)
    setOrganization(result.organization)
    setCanUpdateOrganization(result.permissions.can_update)
    setOrganizationLoadError(null)
    toast({ title: "Datos corporativos guardados" })
  }

  const handleCreateLegalEntity = async (input: LegalEntityInput) => {
    await posApplication.legalEntities.create(input)
    await refreshCorporateStructure()
    toast({ title: "Entidad legal registrada" })
  }

  const handleUpdateLegalEntity = async (id: string, input: LegalEntityInput) => {
    await posApplication.legalEntities.update(id, input)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Entidad legal actualizada" })
  }

  const handleCreateBranch = async (input: BranchInput) => {
    await posApplication.branches.create(input)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Sucursal registrada" })
  }

  const handleUpdateBranch = async (id: string, input: BranchUpdate) => {
    await posApplication.branches.update(id, input)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Sucursal actualizada" })
  }

  const handleChangeBranchStatus = async (id: string, status: BranchStatus) => {
    await posApplication.branches.changeStatus(id, status)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({
      title: status === "active"
        ? "Sucursal reactivada"
        : status === "suspended" ? "Sucursal suspendida" : "Sucursal cerrada",
    })
  }

  const handleSaveBranchLocalConfiguration = async (branchId: string, input: BranchLocalConfiguration) => {
    await posApplication.branches.updateLocalConfiguration(branchId, input)
    await refreshCorporateStructure()
    toast({ title: "Configuración local guardada" })
  }

  const handleListBranchCalendar = async (branchId: string, from: string, to: string) => {
    const result = await posApplication.branches.listCalendar(branchId, from, to)
    return result.exceptions
  }

  const handleSaveBranchCalendarException = async (
    branchId: string,
    localDateValue: string,
    input: BranchCalendarExceptionInput,
  ) => {
    await posApplication.branches.upsertCalendarException(branchId, localDateValue, input)
    toast({ title: "Excepción de calendario guardada" })
  }

  const handleDeleteBranchCalendarException = async (branchId: string, localDateValue: string) => {
    await posApplication.branches.deleteCalendarException(branchId, localDateValue)
    toast({ title: "Excepción de calendario eliminada" })
  }

  const handleAssignBranchLegalEntity = async (branchId: string, legalEntityId: string) => {
    await posApplication.branches.assignLegalEntity(branchId, legalEntityId)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Entidad legal asociada a la sucursal" })
  }

  const handleRemoveBranchLegalEntity = async (branchId: string, legalEntityId: string) => {
    await posApplication.branches.removeLegalEntity(branchId, legalEntityId)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Asociación legal retirada" })
  }

  const handleAssignBranchUser = async (branchId: string, userId: string) => {
    await posApplication.branches.assignUser(branchId, userId)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Usuario asignado a la sucursal" })
  }

  const handleRemoveBranchUser = async (branchId: string, userId: string) => {
    await posApplication.branches.removeUser(branchId, userId)
    await refreshCorporateStructure()
    await refreshAvailableBranches()
    toast({ title: "Asignación de sucursal retirada" })
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
    if (activeSection === "recipes") {
      return (
        <RecipeManagementPanel
          products={recipeProducts}
          canManage={canManageCorporateStructure}
          loading={recipesLoading}
          application={posApplication.recipes}
        />
      )
    }
    if (activeSection === "variants") {
      return (
        <VariantsManagementPanel
          products={catalogProducts}
          branches={branches}
          canManage={canManageCorporateStructure}
          loading={corporateStructureLoading}
          application={posApplication.variants}
        />
      )
    }
    if (activeSection === "catalog") {
      return (
        <CatalogManagementPanel
          branches={branches}
          canManage={canManageCorporateStructure}
          loading={corporateStructureLoading}
          loadError={corporateStructureLoadError}
          products={catalogProducts}
          categories={catalogCategories}
          branchProducts={catalogBranchProducts}
          selectedBranchId={selectedCatalogBranchId}
          onSelectBranch={async (id) => {
            setSelectedCatalogBranchId(id)
            setCatalogBranchProducts(await posApplication.corporateCatalog.listBranchProducts(id))
          }}
          onCreateProduct={async (input) => { await posApplication.corporateCatalog.createProduct(input); await refreshCatalogManagement() }}
          onUpdateProduct={async (id, input) => { await posApplication.corporateCatalog.updateProduct(id, input); await refreshCatalogManagement() }}
          onDeactivateProduct={async (id) => { await posApplication.corporateCatalog.deactivateProduct(id); await refreshCatalogManagement() }}
          onCreateCategory={async (name, icon) => { await posApplication.corporateCatalog.createCategory({ name, icon }); await refreshCatalogManagement() }}
          onUpdateCategory={async (id, name, icon) => { await posApplication.corporateCatalog.updateCategory(id, { name, icon }); await refreshCatalogManagement() }}
          onDeactivateCategory={async (id) => { await posApplication.corporateCatalog.deactivateCategory(id); await refreshCatalogManagement() }}
          onSetProductEnabled={async (branchId, productId, enabled) => {
            await posApplication.corporateCatalog.setBranchProductEnabled(branchId, productId, enabled)
            await refreshCatalogManagement(branchId)
            if (activeBranchId === branchId) {
              const [nextCategories, nextProducts] = await Promise.all([
                posApplication.listCatalog.getCategories(),
                posApplication.listCatalog.getProducts(activeCategory === "all" ? undefined : activeCategory),
              ])
              setCategories(nextCategories)
              setProducts(nextProducts)
              if (!enabled) setCartItems((current) => current.filter((item) => item.product.id !== productId))
            }
          }}
        />
      )
    }
    if (activeSection === "pricing") {
      return (
        <PricingManagementPanel
          branches={branches}
          products={catalogProducts}
          canManage={canManageCorporateStructure}
          application={posApplication.pricing}
        />
      )
    }
    if (activeSection === "tables") {
      return (
        <TableManagement
          tables={tables}
          orders={orders}
          canWrite={availableBranches.some((branch) => branch.id === activeBranchId && branch.status === "active")}
          onCreate={handleCreateTable}
          onUpdateTable={handleUpdateTableStatus}
        />
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
        onCreateReservation={handleCreateReservation}
        onUpdateReservationStatus={handleUpdateReservationStatus}
        onListReservations={handleListReservations}
        canWriteOperationalData={availableBranches.some((branch) => branch.id === activeBranchId && branch.status === "active")}
        onAssignDriver={handleAssignDriver}
        onUpdateSettings={handleUpdateSettings}
        organization={organization}
        organizationLoading={organizationLoading}
        canUpdateOrganization={canUpdateOrganization}
        canBootstrapOrganization={user.role === "admin"}
        organizationLoadError={organizationLoadError}
        onBootstrapOrganization={handleBootstrapOrganization}
        onUpdateOrganization={handleUpdateOrganization}
        onListOrganizationHistory={handleListOrganizationHistory}
        legalEntities={legalEntities}
        branches={branches}
        branchUsersByBranch={branchUsersByBranch}
        branchLifecycleEventsByBranch={branchLifecycleEventsByBranch}
        corporateStructureLoading={corporateStructureLoading}
        corporateStructureLoadError={corporateStructureLoadError}
        canManageCorporateStructure={canManageCorporateStructure}
        onCreateLegalEntity={handleCreateLegalEntity}
        onUpdateLegalEntity={handleUpdateLegalEntity}
        onCreateBranch={handleCreateBranch}
        onUpdateBranch={handleUpdateBranch}
        onChangeBranchStatus={handleChangeBranchStatus}
        onAssignBranchLegalEntity={handleAssignBranchLegalEntity}
        onRemoveBranchLegalEntity={handleRemoveBranchLegalEntity}
        onAssignBranchUser={handleAssignBranchUser}
        onRemoveBranchUser={handleRemoveBranchUser}
        onSaveBranchLocalConfiguration={handleSaveBranchLocalConfiguration}
        onListBranchCalendar={handleListBranchCalendar}
        onSaveBranchCalendarException={handleSaveBranchCalendarException}
        onDeleteBranchCalendarException={handleDeleteBranchCalendarException}
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
        <Header query={query} onQueryChange={setQuery} onLogout={onLogout} branches={availableBranches} activeBranchId={activeBranchId} onActiveBranchChange={handleActiveBranchChange} />
        {operationError && activeSection !== "menu" && (
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
              activeBranch={availableBranches.find((branch) => branch.id === activeBranchId) ?? null}
              onRemoveItem={(id) => handleUpdateQuantity(id, 0)}
              onUpdateQuantity={handleUpdateQuantity}
              onPlaceOrder={handlePlaceOrder}
              isPlacingOrder={isPlacingOrder}
            />
          )}
        </div>
        <Footer />
        {variantDialog && (
          <ProductOptionsDialog
            product={variantDialog.product}
            groups={variantDialog.groups}
            onClose={() => setVariantDialog(null)}
            onConfirm={(selected) => {
              addConfiguredProduct(variantDialog.product, selected)
              setVariantDialog(null)
            }}
          />
        )}
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
