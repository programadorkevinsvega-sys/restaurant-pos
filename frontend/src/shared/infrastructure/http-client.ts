import { traceOperation } from "./tracing"

export interface HttpErrorDetail {
  field: string
  message: string
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: HttpErrorDetail[] = [],
  ) {
    super(message)
    this.name = "HttpError"
  }
}

export interface AuthenticatedUser {
  id: string
  email?: string
  role: "staff" | "admin"
}

export class HttpClient {
  private readonly baseUrl: string
  private csrfToken?: string
  private refreshInFlight?: Promise<boolean>

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "")
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>(path, { method: "GET", signal })
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  async login(email: string, password: string): Promise<{ user: AuthenticatedUser }> {
    const result = await traceOperation("auth.login", () =>
      this.post<{ user: AuthenticatedUser; csrfToken: string }>("/auth/login", { email, password }),
    )
    this.csrfToken = result.csrfToken
    return { user: result.user }
  }

  async logout(): Promise<void> {
    try {
      await traceOperation("auth.logout", () => this.post<void>("/auth/logout", {}))
    } finally {
      this.csrfToken = undefined
    }
  }

  async currentUser(): Promise<AuthenticatedUser> {
    const result = await traceOperation("auth.current_user", () => this.get<{ user: AuthenticatedUser }>("/auth/me"))
    return result.user
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let requestInit = init
    if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase())) {
      const csrfToken = await this.ensureCsrfToken()
      const headers = new Headers(init.headers)
      headers.set("X-CSRF-Token", csrfToken)
      requestInit = {
        ...init,
        headers,
      }
    }

    let response = await this.fetch(path, requestInit)
    if (response.status === 401 && (!path.startsWith("/auth/") || path === "/auth/me")) {
      if (await this.refreshSession()) response = await this.fetch(path, requestInit)
    }

    return this.readResponse<T>(response)
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: "include",
        cache: "no-store",
      })
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error
      }
      throw new HttpError("No se pudo conectar con el servidor. Verifica que el backend esté activo.", 0)
    }
  }

  private async ensureCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken

    const response = await traceOperation("auth.csrf", () => this.fetch("/auth/csrf", { method: "GET" }))
    const result = await this.readResponse<{ csrfToken: string }>(response)
    this.csrfToken = result.csrfToken
    return result.csrfToken
  }

  private async refreshSession(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = traceOperation("auth.refresh", async () => {
        const csrfToken = await this.ensureCsrfToken()
        const response = await this.fetch("/auth/refresh", {
          method: "POST",
          headers: { "X-CSRF-Token": csrfToken },
        })
        if (response.status === 401) return false

        const result = await this.readResponse<{ csrfToken: string }>(response)
        this.csrfToken = result.csrfToken
        return true
      }).finally(() => {
        this.refreshInFlight = undefined
      })
    }
    return this.refreshInFlight
  }

  private async readResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      if (response.ok) {
        throw new HttpError("El servidor devolvió una respuesta inválida.", response.status)
      }
      payload = null
    }

    if (!response.ok) {
      const errorPayload =
        typeof payload === "object" && payload !== null && "error" in payload ? payload.error : null
      const message =
        typeof errorPayload === "string"
          ? errorPayload
          : typeof errorPayload === "object" &&
              errorPayload !== null &&
              "message" in errorPayload &&
              typeof errorPayload.message === "string"
            ? errorPayload.message
            : `La solicitud falló (${response.status})`
      const details =
        typeof errorPayload === "object" &&
        errorPayload !== null &&
        "details" in errorPayload &&
        Array.isArray(errorPayload.details)
          ? errorPayload.details.filter(isHttpErrorDetail)
          : []
      throw new HttpError(message, response.status, details)
    }

    return payload as T
  }
}

function isHttpErrorDetail(value: unknown): value is HttpErrorDetail {
  return typeof value === "object" &&
    value !== null &&
    "field" in value &&
    typeof value.field === "string" &&
    "message" in value &&
    typeof value.message === "string"
}
