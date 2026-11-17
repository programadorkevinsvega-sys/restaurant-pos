import assert from "node:assert/strict"
import test from "node:test"
import { loadConfig } from "../src/shared/infrastructure/config.js"

const required = {
  AUTH_CSRF_SECRET: "server-only-test-secret-that-is-long-enough",
  DATABASE_URL: "postgresql://restaurant_pos_app:secret@localhost:5432/restaurant_pos",
}

test("production requires Redis for shared rate limits", () => {
  assert.throws(
    () => loadConfig({ ...required, NODE_ENV: "production" }),
    /REDIS_URL es obligatoria/,
  )
})

test("production rejects wildcard CORS origins", () => {
  assert.throws(
    () => loadConfig({
      ...required,
      NODE_ENV: "production",
      REDIS_URL: "redis://localhost:6379",
      CORS_ORIGINS: "https://example.com,*",
    }),
    /no puede contener comodines/,
  )
})

test("production requires an explicit CORS allowlist", () => {
  assert.throws(
    () => loadConfig({
      ...required,
      NODE_ENV: "production",
      REDIS_URL: "redis://localhost:6379",
    }),
    /CORS_ORIGINS es obligatoria/,
  )
})

test("configuration parses an explicit allowlist", () => {
  const config = loadConfig({
    ...required,
    CORS_ORIGINS: "https://pos.example.com,https://admin.example.com",
  })

  assert.equal(config.PORT, 3001)
  assert.equal(config.TRUSTED_PROXY_IP, "10.0.2.82")
  assert.equal(config.corsOrigins.has("https://pos.example.com"), true)
  assert.equal(config.corsOrigins.has("https://attacker.example"), false)
})

test("CORS allowlist is required in development too", () => {
  assert.throws(() => loadConfig(required), /CORS_ORIGINS es obligatoria/)
})

test("configuration requires a sufficiently long CSRF signing secret", () => {
  assert.throws(
    () => loadConfig({ ...required, AUTH_CSRF_SECRET: "too-short", CORS_ORIGINS: "https://pos.example.com" }),
    /AUTH_CSRF_SECRET/,
  )
})

test("configuration validates Sentry tracing sample rates", () => {
  const config = loadConfig({
    ...required,
    CORS_ORIGINS: "https://pos.example.com",
    SENTRY_TRACES_SAMPLE_RATE: "0.25",
  })

  assert.equal(config.SENTRY_TRACES_SAMPLE_RATE, 0.25)
  assert.throws(
    () => loadConfig({
      ...required,
      CORS_ORIGINS: "https://pos.example.com",
      SENTRY_TRACES_SAMPLE_RATE: "1.5",
    }),
    /SENTRY_TRACES_SAMPLE_RATE/,
  )
})

test("configuration samples half of traces by default", () => {
  const config = loadConfig({
    ...required,
    CORS_ORIGINS: "https://pos.example.com",
  })

  assert.equal(config.SENTRY_TRACES_SAMPLE_RATE, 0.5)
})

test("configuration validates Sentry profiling sample rates", () => {
  const config = loadConfig({
    ...required,
    CORS_ORIGINS: "https://pos.example.com",
    SENTRY_PROFILES_SAMPLE_RATE: "0.25",
  })

  assert.equal(config.SENTRY_PROFILES_SAMPLE_RATE, 0.25)
  assert.throws(
    () => loadConfig({
      ...required,
      CORS_ORIGINS: "https://pos.example.com",
      SENTRY_PROFILES_SAMPLE_RATE: "1.5",
    }),
    /SENTRY_PROFILES_SAMPLE_RATE/,
  )
})

test("runtime configuration removes the migration-only database credential", () => {
  process.env.MIGRATIONS_DATABASE_URL = "postgresql://migrator/target"

  loadConfig({
    ...required,
    CORS_ORIGINS: "https://pos.example.com",
  })

  assert.equal(process.env.MIGRATIONS_DATABASE_URL, undefined)
})

test("CORS origins must be exact origins without paths", () => {
  assert.throws(
    () => loadConfig({ ...required, CORS_ORIGINS: "https://pos.example.com/app" }),
    /orígenes HTTP\/HTTPS exactos/,
  )
})

test("production CORS origins require HTTPS", () => {
  assert.throws(
    () => loadConfig({
      ...required,
      NODE_ENV: "production",
      REDIS_URL: "redis://localhost:6379",
      CORS_ORIGINS: "http://pos.example.com",
    }),
    /producción requiere HTTPS/,
  )
})

test("production authentication cookies are secure and host-only", () => {
  const config = loadConfig({
    ...required,
    NODE_ENV: "production",
    REDIS_URL: "redis://localhost:6379",
    CORS_ORIGINS: "https://pos.example.com",
  })

  assert.equal(config.secureCookies, true)
  assert.equal(config.cookieNames.access, "__Host-pos_access")
  assert.equal(config.cookieNames.refresh, "__Host-pos_refresh")
})

test("SameSite=None is rejected when cookies are not secure", () => {
  assert.throws(
    () => loadConfig({
      ...required,
      CORS_ORIGINS: "https://pos.example.com",
      AUTH_COOKIE_SAME_SITE: "None",
    }),
    /requiere cookies Secure/,
  )
})

test("trusted proxy IP must be a valid IPv4 or IPv6 address", () => {
  assert.throws(
    () => loadConfig({
      ...required,
      CORS_ORIGINS: "https://pos.example.com",
      TRUSTED_PROXY_IP: "not-an-ip",
    }),
    /TRUSTED_PROXY_IP debe contener una dirección IPv4 o IPv6 válida/,
  )
})
