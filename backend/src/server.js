import * as Sentry from "@sentry/node"
import { createApp } from "./app.js"
import { loadConfig } from "./shared/infrastructure/config.js"
import { logger } from "./shared/infrastructure/logger.js"

const config = loadConfig()
const { app, close } = await createApp(config)
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "Restaurant POS API listening")
})

async function shutdown(signal) {
  logger.info({ signal }, "Shutting down API")
  server.close(async (error) => {
    if (error) {
      logger.error({ code: error.code }, "HTTP server shutdown failed")
      process.exitCode = 1
    }
    try {
      await close()
    } catch (closeError) {
      logger.error({ code: closeError.code }, "Resource shutdown failed")
      process.exitCode = 1
    }
    if (Sentry.isInitialized()) {
      try {
        const flushed = await Sentry.close(2000)
        if (!flushed) logger.warn("Sentry telemetry did not flush before shutdown timeout.")
      } catch (sentryError) {
        logger.error({ code: sentryError.code }, "Sentry shutdown failed")
        process.exitCode = 1
      }
    }
  })
}

process.once("SIGINT", () => void shutdown("SIGINT"))
process.once("SIGTERM", () => void shutdown("SIGTERM"))
