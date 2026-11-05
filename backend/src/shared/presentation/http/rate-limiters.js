import { rateLimit } from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"
import { createClient } from "redis"

export async function createRateLimiters(config, logger) {
  let client
  let store

  if (config.REDIS_URL) {
    client = createClient({ url: config.REDIS_URL })
    client.on("error", (error) => logger.error({ code: error.code }, "Redis connection error"))
    await client.connect()
    store = new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
      prefix: "restaurant-pos:rl:",
    })
  } else {
    logger.warn("Using in-memory rate limiting; configure Redis before running multiple instances.")
  }

  const createLimiter = (limit, windowMs) => rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    store,
    skip: (request) => request.method === "OPTIONS",
    handler(request, response) {
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Demasiadas solicitudes. Intenta de nuevo más tarde.",
          requestId: request.id,
        },
      })
    },
  })

  return {
    global: createLimiter(300, 15 * 60 * 1000),
    writes: createLimiter(30, 60 * 1000),
    login: createLimiter(5, 15 * 60 * 1000),
    close: async () => {
      if (client?.isOpen) await client.quit()
    },
  }
}
