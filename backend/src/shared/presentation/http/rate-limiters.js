import { isIP } from "node:net"
import { ipKeyGenerator, rateLimit } from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"
import { createClient } from "redis"

function normalizeIp(value) {
  if (typeof value !== "string") return ""
  const ip = value.trim()
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip
}

export function createRateLimitKeyGenerator(trustedProxyIp) {
  const trustedProxy = normalizeIp(trustedProxyIp)

  return (request) => {
    const peerIp = normalizeIp(request.socket?.remoteAddress)
    if (peerIp === trustedProxy) {
      const cloudflareClientIp = request.get("cf-connecting-ip")?.trim()
      if (cloudflareClientIp && isIP(cloudflareClientIp)) {
        return ipKeyGenerator(cloudflareClientIp)
      }
    }

    const requesterIp = normalizeIp(request.ip || request.socket?.remoteAddress)
    if (!requesterIp || isIP(requesterIp) === 0) return "unknown-client"
    return ipKeyGenerator(requesterIp)
  }
}

export async function createRateLimiters(config, logger) {
  let client

  if (config.REDIS_URL) {
    client = createClient({ url: config.REDIS_URL })
    client.on("error", (error) => logger.error({ code: error.code }, "Redis connection error"))
    await client.connect()
  } else {
    logger.warn("Using in-memory rate limiting; configure Redis before running multiple instances.")
  }

  const keyGenerator = createRateLimitKeyGenerator(config.TRUSTED_PROXY_IP)
  const createLimiter = (scope, limit, windowMs) => {
    const store = client
      ? new RedisStore({
        sendCommand: (...args) => client.sendCommand(args),
        prefix: `restaurant-pos:rl:${scope}:`,
      })
      : undefined

    return rateLimit({
      windowMs,
      limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      store,
      keyGenerator,
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
  }

  return {
    global: createLimiter("global", 300, 15 * 60 * 1000),
    writes: createLimiter("writes", 30, 60 * 1000),
    login: createLimiter("login", 5, 15 * 60 * 1000),
    redisClient: client,
    close: async () => {
      if (client?.isOpen) await client.quit()
    },
  }
}
