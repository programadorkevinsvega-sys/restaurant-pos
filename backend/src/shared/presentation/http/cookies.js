export function readCookie(request, name) {
  const cookieHeader = request.get("cookie") ?? ""
  const prefix = `${name}=`
  const value = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))

  if (!value) return undefined
  try {
    return decodeURIComponent(value.slice(prefix.length))
  } catch {
    return undefined
  }
}

export function writeCookie(response, name, value, config, { httpOnly = true, maxAge } = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `SameSite=${config.AUTH_COOKIE_SAME_SITE}`,
    config.secureCookies ? "Secure" : "",
    httpOnly ? "HttpOnly" : "",
    maxAge === undefined ? "" : `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ].filter(Boolean)

  response.append("Set-Cookie", attributes.join("; "))
}

export function clearCookie(response, name, config, options = {}) {
  writeCookie(response, name, "", config, { ...options, maxAge: 0 })
}
