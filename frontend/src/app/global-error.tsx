"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

type GlobalErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body>
        <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">Ocurrió un error inesperado</h1>
          <p>No pudimos completar esta acción. Inténtalo nuevamente.</p>
          <button type="button" onClick={reset} className="rounded-md bg-primary px-4 py-2 text-primary-foreground">
            Intentar de nuevo
          </button>
        </main>
      </body>
    </html>
  )
}
