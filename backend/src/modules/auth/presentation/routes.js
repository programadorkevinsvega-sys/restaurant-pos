import express from "express"
import { z } from "zod"
import { AppError } from "../../../shared/domain/app-error.js"
import { asyncHandler } from "../../../shared/presentation/http/async-handler.js"
import { clearCookie, readCookie, writeCookie } from "../../../shared/presentation/http/cookies.js"
import { createCsrfToken, isValidCsrfToken } from "../../../shared/presentation/http/csrf.js"
import { validateRequest } from "../../../shared/presentation/http/validate-request.js"

const signInSchemas = {
  body: z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(256),
  }).strict(),
}

function setSessionCookies(response, session, user, config) {
  const maxAge = Math.max(1, session.expires_in ?? 3600)
  writeCookie(response, config.cookieNames.access, session.access_token, config, { maxAge })
  writeCookie(response, config.cookieNames.refresh, session.refresh_token, config, { maxAge: 60 * 60 * 24 * 30 })

  const csrfToken = createCsrfToken(config.SUPABASE_SERVICE_ROLE_KEY)
  writeCookie(response, config.cookieNames.csrf, csrfToken, config, { httpOnly: false, maxAge: 60 * 60 * 24 * 30 })
  return { user, csrfToken }
}

function clearAuthenticationCookies(response, config) {
  clearCookie(response, config.cookieNames.access, config)
  clearCookie(response, config.cookieNames.refresh, config)
}

function clearSessionCookies(response, config) {
  clearAuthenticationCookies(response, config)
  clearCookie(response, config.cookieNames.csrf, config, { httpOnly: false })
}

export function createAuthRoutes(auth, config, loginLimiter) {
  const router = express.Router()
  router.use((request, response, next) => {
    response.set("Cache-Control", "no-store")
    next()
  })

  router.get("/csrf", (request, response) => {
    let csrfToken = readCookie(request, config.cookieNames.csrf)
    if (!isValidCsrfToken(csrfToken, config.SUPABASE_SERVICE_ROLE_KEY)) {
      csrfToken = createCsrfToken(config.SUPABASE_SERVICE_ROLE_KEY)
      writeCookie(response, config.cookieNames.csrf, csrfToken, config, {
        httpOnly: false,
        maxAge: 60 * 60 * 24 * 30,
      })
    }
    response.json({ csrfToken })
  })

  router.post("/login", loginLimiter, validateRequest(signInSchemas), asyncHandler(async (request, response) => {
    const { session, user } = await auth.signIn(request.validated.body.email, request.validated.body.password)
    response.json(setSessionCookies(response, session, user, config))
  }))

  router.post("/refresh", asyncHandler(async (request, response) => {
    const refreshToken = readCookie(request, config.cookieNames.refresh)
    if (!refreshToken) {
      clearAuthenticationCookies(response, config)
      throw new AppError(401, "INVALID_SESSION", "La sesión expiró. Inicia sesión nuevamente.")
    }

    try {
      const { session, user } = await auth.refresh(refreshToken)
      response.json(setSessionCookies(response, session, user, config))
    } catch (error) {
      if (error instanceof AppError && [401, 403].includes(error.status)) {
        clearAuthenticationCookies(response, config)
      }
      throw error
    }
  }))

  router.post("/logout", asyncHandler(async (request, response) => {
    const accessToken = readCookie(request, config.cookieNames.access)
    const refreshToken = readCookie(request, config.cookieNames.refresh)

    try {
      await auth.signOut(accessToken, refreshToken)
    } finally {
      clearSessionCookies(response, config)
    }
    response.status(204).end()
  }))

  router.get("/me", asyncHandler(async (request, response) => {
    const accessToken = readCookie(request, config.cookieNames.access)
    if (!accessToken) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.")
    response.json({ user: await auth.getUser(accessToken) })
  }))

  return router
}
