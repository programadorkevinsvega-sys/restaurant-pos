import { CreateProduct } from "@/modules/catalog/application/create-product"
import { CreateCategory } from "@/modules/catalog/application/create-category"
import { ListCatalog } from "@/modules/catalog/application/list-catalog"
import { HttpCatalogRepository } from "@/modules/catalog/infrastructure/http-catalog-repository"
import { ManageCorporateCatalog } from "@/modules/catalog/application/manage-corporate-catalog"
import { ManageRecipes } from "@/modules/recipes/application/manage-recipes"
import { HttpRecipesRepository } from "@/modules/recipes/infrastructure/http-recipes-repository"
import { CreateOrder } from "@/modules/orders/application/create-order"
import { ListOrders } from "@/modules/orders/application/list-orders"
import { HttpOrderRepository } from "@/modules/orders/infrastructure/http-order-repository"
import { ManageTables } from "@/modules/operations/application/manage-tables"
import { ManageReservations } from "@/modules/operations/application/manage-reservations"
import { ManageDeliveries } from "@/modules/operations/application/manage-deliveries"
import { ReadAccountingReports } from "@/modules/operations/application/read-accounting-reports"
import { ManageSettings } from "@/modules/operations/application/manage-settings"
import {
  HttpAccountingRepository,
  HttpDeliveriesRepository,
  HttpReservationsRepository,
  HttpSettingsRepository,
  HttpTablesRepository,
} from "@/modules/operations/infrastructure/http-operations-repository"
import { ManageOrganizationProfile } from "@/modules/organization/application/manage-organization-profile"
import { HttpOrganizationRepository } from "@/modules/organization/infrastructure/http-organization-repository"
import { ManageLegalEntities } from "@/modules/legal-entities/application/manage-legal-entities"
import { HttpLegalEntityRepository } from "@/modules/legal-entities/infrastructure/http-legal-entity-repository"
import { ManageBranches } from "@/modules/branches/application/manage-branches"
import { HttpBranchRepository } from "@/modules/branches/infrastructure/http-branch-repository"
import { HttpClient } from "@/shared/infrastructure/http-client"
import { ManageVariants } from "@/modules/variants/application/manage-variants"
import { HttpVariantsRepository } from "@/modules/variants/infrastructure/http-variants-repository"

const apiUrl = process.env.NEXT_PUBLIC_API_URL
if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL es obligatoria para conectar el frontend con la API.")
}
const http = new HttpClient(apiUrl)
const catalogRepository = new HttpCatalogRepository(http)
const orderRepository = new HttpOrderRepository(http)
const recipesRepository = new HttpRecipesRepository(http)
const variantsRepository = new HttpVariantsRepository(http)
export const posApplication = {
  auth: {
    login: (email: string, password: string) => http.login(email, password),
    logout: () => http.logout(),
    currentUser: () => http.currentUser(),
  },
  listCatalog: new ListCatalog(catalogRepository),
  corporateCatalog: new ManageCorporateCatalog(catalogRepository),
  recipes: new ManageRecipes(recipesRepository),
  variants: new ManageVariants(variantsRepository),
  createProduct: new CreateProduct(catalogRepository),
  createCategory: new CreateCategory(catalogRepository),
  createOrder: new CreateOrder(orderRepository),
  listOrders: new ListOrders(orderRepository),
  tables: new ManageTables(new HttpTablesRepository(http)),
  reservations: new ManageReservations(new HttpReservationsRepository(http)),
  deliveries: new ManageDeliveries(new HttpDeliveriesRepository(http)),
  accounting: new ReadAccountingReports(new HttpAccountingRepository(http)),
  settings: new ManageSettings(new HttpSettingsRepository(http)),
  organization: new ManageOrganizationProfile(new HttpOrganizationRepository(http)),
  legalEntities: new ManageLegalEntities(new HttpLegalEntityRepository(http)),
  branches: new ManageBranches(new HttpBranchRepository(http)),
  setActiveBranchId: (branchId: string | null) => http.setActiveBranchId(branchId),
}
