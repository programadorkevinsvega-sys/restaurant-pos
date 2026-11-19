import { CreateProduct } from "@/modules/catalog/application/create-product"
import { CreateCategory } from "@/modules/catalog/application/create-category"
import { ListCatalog } from "@/modules/catalog/application/list-catalog"
import { HttpCatalogRepository } from "@/modules/catalog/infrastructure/http-catalog-repository"
import { CreateOrder } from "@/modules/orders/application/create-order"
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
import { HttpClient } from "@/shared/infrastructure/http-client"

const apiUrl = process.env.NEXT_PUBLIC_API_URL
if (!apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL es obligatoria para conectar el frontend con la API.")
}
const http = new HttpClient(apiUrl)
const catalogRepository = new HttpCatalogRepository(http)
export const posApplication = {
  auth: {
    login: (email: string, password: string) => http.login(email, password),
    logout: () => http.logout(),
    currentUser: () => http.currentUser(),
  },
  listCatalog: new ListCatalog(catalogRepository),
  createProduct: new CreateProduct(catalogRepository),
  createCategory: new CreateCategory(catalogRepository),
  createOrder: new CreateOrder(new HttpOrderRepository(http)),
  tables: new ManageTables(new HttpTablesRepository(http)),
  reservations: new ManageReservations(new HttpReservationsRepository(http)),
  deliveries: new ManageDeliveries(new HttpDeliveriesRepository(http)),
  accounting: new ReadAccountingReports(new HttpAccountingRepository(http)),
  settings: new ManageSettings(new HttpSettingsRepository(http)),
  organization: new ManageOrganizationProfile(new HttpOrganizationRepository(http)),
}
