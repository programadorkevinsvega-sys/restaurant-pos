import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { AppError } from "../../domain/app-error.js"
import { readCookie } from "./cookies.js"

export function createCsrfToken(secret) {
  const nonce = randomBytes(32).toString("base64url")
  const signature = createHmac("sha256", secret).update(nonce).digest("base64url")
  return `${nonce}.${signature}`
}

export function isValidCsrfToken(token, secret) {
  if (typeof token !== "string" || token.length > 128) return false
  const [nonce, signature, extra] = token.split(".")
  if (
    extra !== undefined ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce ?? "") ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature ?? "")
  ) return false

  const expected = createHmac("sha256", secret).update(nonce).digest()
  const actual = Buffer.from(signature, "base64url")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function csrfProtection(config) {
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"])
  return function verifyCsrf(request, response, next) {
    if (safeMethods.has(request.method)) return next()

    const cookieToken = readCookie(request, config.cookieNames.csrf)
    const headerToken = request.get("x-csrf-token")
    if (
      !cookieToken ||
      !headerToken ||
      cookieToken !== headerToken ||
      !isValidCsrfToken(cookieToken, config.SUPABASE_SERVICE_ROLE_KEY)
    ) {
      return next(new AppError(403, "CSRF_VALIDATION_FAILED", "La solicitud no superó la validación de seguridad."))
    }

    next()
  }
}
