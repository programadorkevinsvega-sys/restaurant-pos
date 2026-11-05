import dotenv from "dotenv"
import { z } from "zod"

dotenv.config()

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGINS: z.string().min(1).optional(),
  AUTH_COOKIE_SAME_SITE: z.enum(["Strict", "Lax", "None"]).default("Lax"),
  REDIS_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1).optional(),
})

export function loadConfig(env = process.env) {
  const parsed = configSchema.safeParse(env)
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")
    throw new Error(`Configuración de backend inválida. Revisa estas variables: ${missing}`)
  }

  const config = parsed.data
  if (config.NODE_ENV === "production" && !config.REDIS_URL) {
    throw new Error("REDIS_URL es obligatoria en producción para compartir el rate limit entre instancias.")
  }
  if (!config.CORS_ORIGINS) {
    throw new Error("CORS_ORIGINS es obligatoria; define el origen exacto del frontend.")
  }
  if (config.AUTH_COOKIE_SAME_SITE === "None" && config.NODE_ENV !== "production") {
    throw new Error("AUTH_COOKIE_SAME_SITE=None requiere cookies Secure, disponibles en producción.")
  }
  const origins = config.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length === 0) {
    throw new Error("CORS_ORIGINS debe incluir al menos un origen válido del frontend.")
  }
  if (origins.some((origin) => origin.includes("*"))) {
    throw new Error("CORS_ORIGINS no puede contener comodines.")
  }
  if (origins.some((origin) => {
    try {
      const url = new URL(origin)
      return !["http:", "https:"].includes(url.protocol) ||
        url.origin !== origin ||
        Boolean(url.username || url.password || url.search || url.hash) ||
        (config.NODE_ENV === "production" && url.protocol !== "https:")
    } catch {
      return true
    }
  })) {
    throw new Error("CORS_ORIGINS debe contener orígenes HTTP/HTTPS exactos; producción requiere HTTPS.")
  }

  return {
    ...config,
    corsOrigins: new Set(origins),
    secureCookies: config.NODE_ENV === "production",
    cookieNames: config.NODE_ENV === "production"
      ? { access: "__Host-pos_access", refresh: "__Host-pos_refresh", csrf: "__Host-pos_csrf" }
      : { access: "pos_access", refresh: "pos_refresh", csrf: "pos_csrf" },
  }
}
