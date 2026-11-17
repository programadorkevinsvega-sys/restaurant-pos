import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)
const scryptParameters = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const saltLength = 16
const keyLength = 64

export async function hashPassword(password, salt = randomBytes(saltLength)) {
  const derivedKey = await scrypt(password, salt, keyLength, scryptParameters)
  return [
    "scrypt",
    scryptParameters.N,
    scryptParameters.r,
    scryptParameters.p,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$")
}

export async function verifyPassword(password, encodedHash) {
  if (typeof encodedHash !== "string") return false
  const [algorithm, n, r, p, saltValue, keyValue, extra] = encodedHash.split("$")
  if (
    extra !== undefined ||
    algorithm !== "scrypt" ||
    n !== String(scryptParameters.N) ||
    r !== String(scryptParameters.r) ||
    p !== String(scryptParameters.p) ||
    !/^[A-Za-z0-9_-]{22}$/.test(saltValue ?? "") ||
    !/^[A-Za-z0-9_-]{86}$/.test(keyValue ?? "")
  ) return false

  const salt = Buffer.from(saltValue, "base64url")
  const expectedKey = Buffer.from(keyValue, "base64url")
  if (salt.length !== saltLength || expectedKey.length !== keyLength) return false

  const actualKey = await scrypt(password, salt, keyLength, scryptParameters)
  return timingSafeEqual(actualKey, expectedKey)
}
