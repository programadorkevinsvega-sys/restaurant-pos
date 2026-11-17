import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.5,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
  },
  tracePropagationTargets: [
    /^http:\/\/localhost(?::\d+)?\/api(?:\/|$)/,
    /^https:\/\/post\.vegtrixgroup\.com\/api(?:\/|$)/,
  ],
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
