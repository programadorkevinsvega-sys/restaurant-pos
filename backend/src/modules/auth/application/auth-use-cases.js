import { AppError } from "../../../shared/domain/app-error.js"

const authorizedRoles = new Set(["staff", "admin"])
const authenticationFailureStatuses = new Set([400, 401, 422])

function throwUnexpectedProviderError(error, operation) {
  if (error && !authenticationFailureStatuses.has(error.status)) {
    throw new AppError(502, "AUTH_PROVIDER_ERROR", `No se pudo completar ${operation}.`)
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.app_metadata?.role,
  }
}

function requireAuthorizedUser(user) {
  if (!user || !authorizedRoles.has(user.app_metadata?.role)) {
    throw new AppError(403, "ROLE_REQUIRED", "La cuenta no tiene acceso al sistema.")
  }
  return publicUser(user)
}

export class AuthUseCases {
  constructor(createAuthClient) {
    this.createAuthClient = createAuthClient
  }

  async signIn(email, password) {
    const client = this.createAuthClient()
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) {
      throwUnexpectedProviderError(error, "el inicio de sesión")
      throw new AppError(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.")
    }
    if (!data.session || !data.user) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "El proveedor de identidad devolvió una respuesta inválida.")
    }
    let user
    try {
      user = requireAuthorizedUser(data.user)
    } catch (authorizationError) {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" })
      if (signOutError) {
        throw new AppError(502, "AUTH_PROVIDER_ERROR", "No se pudo completar el inicio de sesión.")
      }
      throw authorizationError
    }

    return { session: data.session, user }
  }

  async refresh(refreshToken) {
    const client = this.createAuthClient()
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
    if (error) {
      throwUnexpectedProviderError(error, "la renovación de sesión")
      throw new AppError(401, "INVALID_SESSION", "La sesión expiró. Inicia sesión nuevamente.")
    }
    if (!data.session || !data.user) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "El proveedor de identidad devolvió una respuesta inválida.")
    }
    let user
    try {
      user = requireAuthorizedUser(data.user)
    } catch (authorizationError) {
      const { error: signOutError } = await client.auth.signOut({ scope: "local" })
      if (signOutError) {
        throw new AppError(502, "AUTH_PROVIDER_ERROR", "No se pudo renovar la sesión.")
      }
      throw authorizationError
    }

    return { session: data.session, user }
  }

  async getUser(accessToken) {
    const { data, error } = await this.createAuthClient().auth.getUser(accessToken)
    if (error) {
      throwUnexpectedProviderError(error, "la validación de sesión")
      throw new AppError(401, "INVALID_SESSION", "La sesión expiró. Inicia sesión nuevamente.")
    }
    if (!data.user) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "El proveedor de identidad devolvió una respuesta inválida.")
    }
    return requireAuthorizedUser(data.user)
  }

  async signOut(accessToken, refreshToken) {
    if (!accessToken || !refreshToken) return

    const auth = this.createAuthClient().auth
    const { error: sessionError } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (sessionError) {
      throw new AppError(401, "INVALID_SESSION", "La sesión ya no es válida.")
    }

    const { error } = await auth.signOut({ scope: "local" })
    if (error) {
      throw new AppError(502, "AUTH_PROVIDER_ERROR", "No se pudo cerrar la sesión en el proveedor de identidad.")
    }
  }
}
