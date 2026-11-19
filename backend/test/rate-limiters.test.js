import assert from "node:assert/strict"
import test from "node:test"
import { ipKeyGenerator } from "express-rate-limit"
import { createRateLimitKeyGenerator, globalRateLimitFor } from "../src/shared/presentation/http/rate-limiters.js"

function request({ remoteAddress, requestIp, cloudflareIp }) {
  return {
    socket: { remoteAddress },
    ip: requestIp ?? remoteAddress,
    get(name) {
      return name.toLowerCase() === "cf-connecting-ip" ? cloudflareIp : undefined
    },
  }
}

test("rate limits use Cloudflare visitor IP only behind the configured Nginx proxy", () => {
  const keyGenerator = createRateLimitKeyGenerator("10.0.2.82")
  const visitorIp = "203.0.113.42"

  assert.equal(
    keyGenerator(request({
      remoteAddress: "::ffff:10.0.2.82",
      requestIp: "10.0.2.82",
      cloudflareIp: visitorIp,
    })),
    ipKeyGenerator(visitorIp),
  )
})

test("rate limits ignore a spoofed Cloudflare header from an untrusted peer", () => {
  const keyGenerator = createRateLimitKeyGenerator("10.0.2.82")
  const peerIp = "198.51.100.15"

  assert.equal(
    keyGenerator(request({
      remoteAddress: peerIp,
      requestIp: peerIp,
      cloudflareIp: "203.0.113.42",
    })),
    ipKeyGenerator(peerIp),
  )
})

test("rate limits normalize IPv4-mapped trusted proxy addresses", () => {
  const keyGenerator = createRateLimitKeyGenerator("10.0.2.82")
  assert.equal(
    keyGenerator(request({
      remoteAddress: "::ffff:10.0.2.82",
      requestIp: "10.0.2.82",
      cloudflareIp: "2001:db8:abcd:1200::1",
    })),
    ipKeyGenerator("2001:db8:abcd:1200::1"),
  )
})

test("the elevated global request budget is restricted to test mode", () => {
  assert.equal(globalRateLimitFor("test"), 5000)
  assert.equal(globalRateLimitFor("development"), 300)
  assert.equal(globalRateLimitFor("production"), 300)
})
