import { withSentryConfig } from "@sentry/nextjs/config"

const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
}

export default withSentryConfig(nextConfig, {
  org: "grupo-vega",
  project: "restaurant_post",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
})
