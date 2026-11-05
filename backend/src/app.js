import express from "express"
import cors from "cors"
import helmet from "helmet"
import pinoHttp from "pino-http"
import { loadConfig } from "./shared/infrastructure/config.js"
import { logger } from "./shared/infrastructure/logger.js"
import { createSupabaseClients } from "./shared/infrastructure/supabase-clients.js"
import { createRateLimiters } from "./shared/presentation/http/rate-limiters.js"
import { requestContext } from "./shared/presentation/http/request-context.js"
import { authenticate, authorize } from "./shared/presentation/http/authentication.js"
import { csrfProtection } from "./shared/presentation/http/csrf.js"
import { errorHandler, notFoundHandler } from "./shared/presentation/http/error-handler.js"
import { AppError } from "./shared/domain/app-error.js"
import { CatalogUseCases } from "./modules/catalog/application/catalog-use-cases.js"
import { SupabaseCatalogRepository } from "./modules/catalog/infrastructure/supabase-catalog-repository.js"
import { createCatalogRoutes } from "./modules/catalog/presentation/routes.js"
import { createAdminCatalogRoutes } from "./modules/catalog/presentation/admin-routes.js"
import { OrderUseCases } from "./modules/orders/application/order-use-cases.js"
import { SupabaseOrderRepository } from "./modules/orders/infrastructure/supabase-order-repository.js"
import { createOrderRoutes } from "./modules/orders/presentation/routes.js"
import { OperationsUseCases } from "./modules/operations/application/operations-use-cases.js"
import { SupabaseOperationsRepository } from "./modules/operations/infrastructure/supabase-operations-repository.js"
import { createOperationsRoutes } from "./modules/operations/presentation/routes.js"
import { AccountingUseCases } from "./modules/accounting/application/accounting-use-cases.js"
import { SupabaseAccountingRepository } from "./modules/accounting/infrastructure/supabase-accounting-repository.js"
import { createAccountingRoutes } from "./modules/accounting/presentation/routes.js"
import { AuthUseCases } from "./modules/auth/application/auth-use-cases.js"
import { createAuthRoutes } from "./modules/auth/presentation/routes.js"

export async function createApp(config = loadConfig()) {
  const { authClient, createAuthClient, serviceClient } = createSupabaseClients(config)
  const limiters = await createRateLimiters(config, logger)
  const auth = new AuthUseCases(createAuthClient)
  const requireUser = authenticate(authClient, config.cookieNames.access)
  const requireRole = (...roles) => authorize(...roles)

  const catalog = new CatalogUseCases(new SupabaseCatalogRepository(serviceClient))
  const orders = new OrderUseCases(new SupabaseOrderRepository(serviceClient))
  const operations = new OperationsUseCases(new SupabaseOperationsRepository(serviceClient))
  const accounting = new AccountingUseCases(new SupabaseAccountingRepository(serviceClient))
  const app = express()

  app.disable("x-powered-by")
  app.use(requestContext)
  app.use(pinoHttp({
    logger,
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          path: request.url?.split("?")[0],
        }
      },
      res(response) {
        return { statusCode: response.statusCode }
      },
    },
  }))
  app.use(helmet())
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin) return callback(null, false)
      if (config.corsOrigins.has(origin)) return callback(null, true)
      callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "El origen de esta solicitud no está permitido."))
    },
  }))
  app.use(express.json({ limit: "64kb", strict: true }))
  app.use(csrfProtection(config))
  app.use(limiters.global)

  app.get("/api/health", (request, response) => {
    response.json({ status: "ok", requestId: request.id })
  })

  app.use("/api/auth", createAuthRoutes(auth, config, limiters.login))

  const catalogRoutes = createCatalogRoutes(catalog, requireUser, requireRole)
  app.use("/api/categories", catalogRoutes.categories)
  app.use("/api/products", catalogRoutes.products)
  app.use("/api/admin", createAdminCatalogRoutes(catalog, requireUser, requireRole, limiters.writes))

  app.use("/api/orders", createOrderRoutes(orders, requireUser, requireRole, limiters.writes))

  const operationRoutes = createOperationsRoutes(operations, requireUser, requireRole, limiters.writes)
  app.use("/api/tables", operationRoutes.tables)
  app.use("/api/reservations", operationRoutes.reservations)
  app.use("/api/delivery", operationRoutes.delivery)
  app.use("/api/admin", operationRoutes.admin)
  app.use("/api/accounting", createAccountingRoutes(accounting, requireUser, requireRole))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return { app, close: limiters.close }
}
