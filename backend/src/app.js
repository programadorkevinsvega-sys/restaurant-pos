import express from "express"
import cors from "cors"
import helmet from "helmet"
import pinoHttp from "pino-http"
import * as Sentry from "@sentry/node"
import { loadConfig } from "./shared/infrastructure/config.js"
import { logger } from "./shared/infrastructure/logger.js"
import { createPostgresPool } from "./shared/infrastructure/postgres.js"
import { createRateLimiters } from "./shared/presentation/http/rate-limiters.js"
import { requestContext } from "./shared/presentation/http/request-context.js"
import { authenticate, authorize } from "./shared/presentation/http/authentication.js"
import { csrfProtection } from "./shared/presentation/http/csrf.js"
import { errorHandler, notFoundHandler } from "./shared/presentation/http/error-handler.js"
import { AppError } from "./shared/domain/app-error.js"
import { CatalogUseCases } from "./modules/catalog/application/catalog-use-cases.js"
import { PostgresCatalogRepository } from "./modules/catalog/infrastructure/postgres-catalog-repository.js"
import { RedisCachedCatalogRepository } from "./modules/catalog/infrastructure/redis-cached-catalog-repository.js"
import { createCatalogRoutes } from "./modules/catalog/presentation/routes.js"
import { createAdminCatalogRoutes } from "./modules/catalog/presentation/admin-routes.js"
import { OrderUseCases } from "./modules/orders/application/order-use-cases.js"
import { PostgresOrderRepository } from "./modules/orders/infrastructure/postgres-order-repository.js"
import { createOrderRoutes } from "./modules/orders/presentation/routes.js"
import { OperationsUseCases } from "./modules/operations/application/operations-use-cases.js"
import { PostgresOperationsRepository } from "./modules/operations/infrastructure/postgres-operations-repository.js"
import { createOperationsRoutes } from "./modules/operations/presentation/routes.js"
import { AccountingUseCases } from "./modules/accounting/application/accounting-use-cases.js"
import { PostgresAccountingRepository } from "./modules/accounting/infrastructure/postgres-accounting-repository.js"
import { createAccountingRoutes } from "./modules/accounting/presentation/routes.js"
import { AuthUseCases } from "./modules/auth/application/auth-use-cases.js"
import { PostgresAuthRepository } from "./modules/auth/infrastructure/postgres-auth-repository.js"
import { createAuthRoutes } from "./modules/auth/presentation/routes.js"
import { OrganizationUseCases } from "./modules/organization/application/organization-use-cases.js"
import { PostgresOrganizationRepository } from "./modules/organization/infrastructure/postgres-organization-repository.js"
import { createOrganizationRoutes } from "./modules/organization/presentation/routes.js"
import { LegalEntityUseCases } from "./modules/legal-entities/application/legal-entity-use-cases.js"
import { PostgresLegalEntityRepository } from "./modules/legal-entities/infrastructure/postgres-legal-entity-repository.js"
import { createLegalEntityRoutes } from "./modules/legal-entities/presentation/routes.js"
import { BranchUseCases } from "./modules/branches/application/branch-use-cases.js"
import { PostgresBranchRepository } from "./modules/branches/infrastructure/postgres-branch-repository.js"
import { createBranchRoutes } from "./modules/branches/presentation/routes.js"

export async function createApp(config = loadConfig()) {
  const pool = createPostgresPool(config)
  const limiters = await createRateLimiters(config, logger)
  const auth = new AuthUseCases(new PostgresAuthRepository(pool))
  const requireUser = authenticate(auth, config.cookieNames.access)
  const requireRole = (...roles) => authorize(...roles)

  const catalogRepository = new PostgresCatalogRepository(pool)
  const cachedCatalogRepository = new RedisCachedCatalogRepository(
    catalogRepository,
    limiters.redisClient,
    logger,
    `restaurant-pos:${config.NODE_ENV}:cache:v1:catalog`,
  )
  const catalog = new CatalogUseCases(cachedCatalogRepository)
  const orders = new OrderUseCases(new PostgresOrderRepository(pool))
  const operations = new OperationsUseCases(new PostgresOperationsRepository(pool))
  const accounting = new AccountingUseCases(new PostgresAccountingRepository(pool))
  const app = express()

  app.disable("x-powered-by")
  app.use(requestContext)
  app.use(pinoHttp({
    logger,
    customProps(request) {
      return request.traceId ? { trace_id: request.traceId } : {}
    },
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

  const organization = new OrganizationUseCases(new PostgresOrganizationRepository(pool))
  app.use("/api/organization", createOrganizationRoutes(organization, requireUser, requireRole, limiters.writes))
  const legalEntities = new LegalEntityUseCases(new PostgresLegalEntityRepository(pool))
  app.use("/api/legal-entities", createLegalEntityRoutes(legalEntities, requireUser, limiters.writes))
  const branches = new BranchUseCases(new PostgresBranchRepository(pool))
  app.use("/api/branches", createBranchRoutes(branches, requireUser, limiters.writes))

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
  if (Sentry.isInitialized()) {
    Sentry.setupExpressErrorHandler(app)
  }
  app.use(errorHandler)
  return {
    app,
    close: async () => {
      await Promise.all([limiters.close(), pool.end()])
    },
  }
}
