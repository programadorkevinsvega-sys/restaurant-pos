import { createHash, randomBytes } from "node:crypto"
import { AppError } from "../../../shared/domain/app-error.js"
import { logger } from "../../../shared/infrastructure/logger.js"
import { traceOperation } from "../../../shared/infrastructure/tracing.js"
import { hashPassword, verifyPassword } from "./passwords.js"

const authorizedRoles = new Set(["staff", "admin"])
const accessTokenLifetimeSeconds = 15 * 60
const refreshTokenLifetimeSeconds = 30 * 24 * 60 * 60
const dummyPasswordHash = hashPassword("invalid-password-for-timing", Buffer.alloc(16))

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex")
}

function createSessionTokens() {
  const now = Date.now()
  return {
    accessToken: randomBytes(32).toString("base64url"),
    refreshToken: randomBytes(48).toString("base64url"),
    accessExpiresAt: new Date(now + accessTokenLifetimeSeconds * 1000),
    refreshExpiresAt: new Date(now + refreshTokenLifetimeSeconds * 1000),
  }
}

function sessionResponse(tokens) {
  return {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: accessTokenLifetimeSeconds,
  }
}

function requireAuthorizedUser(user) {
  if (!user || !authorizedRoles.has(user.role)) {
    throw new AppError(403, "ROLE_REQUIRED", "La cuenta no tiene acceso al sistema.")
  }
  return publicUser(user)
}

export class AuthUseCases {
  constructor(authRepository) {
    this.authRepository = authRepository
  }

  signIn(email, password, requestId) {
    return traceOperation("auth.sign_in", async () => {
      const user = await this.authRepository.findUserByEmail(email.trim().toLowerCase())
      const passwordHash = user?.passwordHash ?? await dummyPasswordHash
      const passwordMatches = await verifyPassword(password, passwordHash)
      if (!user || !user.isActive || !passwordMatches) {
        logger.warn({ requestId }, "Intento de inicio de sesión rechazado")
        throw new AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.")
      }

      requireAuthorizedUser(user)
      const tokens = createSessionTokens()
      await this.authRepository.createSession({
        userId: user.id,
        accessTokenHash: hashToken(tokens.accessToken),
        refreshTokenHash: hashToken(tokens.refreshToken),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      })

      return { session: sessionResponse(tokens), user: publicUser(user) }
    })
  }

  refresh(refreshToken) {
    return traceOperation("auth.refresh", async () => {
      const tokens = createSessionTokens()
      const user = await this.authRepository.rotateSession({
        currentRefreshTokenHash: hashToken(refreshToken),
        accessTokenHash: hashToken(tokens.accessToken),
        refreshTokenHash: hashToken(tokens.refreshToken),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      })
      if (!user) {
        throw new AppError(401, "INVALID_SESSION", "La sesión expiró. Inicia sesión nuevamente.")
      }

      return { session: sessionResponse(tokens), user: requireAuthorizedUser(user) }
    })
  }

  getUser(accessToken) {
    return traceOperation("auth.get_user", async () => {
      const user = await this.authRepository.findUserByAccessTokenHash(hashToken(accessToken))
      if (!user) {
        throw new AppError(401, "INVALID_SESSION", "La sesión expiró. Inicia sesión nuevamente.")
      }
      return requireAuthorizedUser(user)
    })
  }

  signOut(accessToken, refreshToken) {
    return traceOperation("auth.sign_out", async () => {
      if (!accessToken && !refreshToken) return

      await this.authRepository.revokeSession({
        accessTokenHash: accessToken ? hashToken(accessToken) : null,
        refreshTokenHash: refreshToken ? hashToken(refreshToken) : null,
      })
    })
  }
}
