import { StringDecoder } from "node:string_decoder"
import { z } from "zod"
import { hashPassword } from "../src/modules/auth/application/passwords.js"
import { createPostgresPool } from "../src/shared/infrastructure/postgres.js"
import { loadConfig } from "../src/shared/infrastructure/config.js"

const emailSchema = z.string().email().max(254)

function readSecret(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("La creación de cuentas requiere una terminal interactiva.")
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin
    const output = process.stdout
    const decoder = new StringDecoder("utf8")
    let value = ""
    output.write(prompt)
    input.setRawMode(true)
    input.resume()

    function finish(error) {
      input.off("data", onData)
      input.setRawMode(false)
      input.pause()
      output.write("\n")
      if (error) reject(error)
      else resolve(value)
    }

    function onData(buffer) {
      for (const character of decoder.write(buffer)) {
        if (character === "\u0003") {
          finish(new Error("Operación cancelada."))
          return
        }
        if (character === "\r" || character === "\n") {
          finish()
          return
        }
        if (character === "\u007f" || character === "\b") {
          value = Array.from(value).slice(0, -1).join("")
          output.write("\b \b")
          continue
        }
        if (character >= " " && character !== "\u007f") {
          value += character
          output.write("*")
        }
      }
    }

    input.on("data", onData)
  })
}

async function main() {
  const [emailArgument, roleArgument = "staff", ...extraArguments] = process.argv.slice(2)
  const email = emailSchema.safeParse(emailArgument?.trim().toLowerCase())
  const role = roleArgument.trim().toLowerCase()
  if (!email.success || !["staff", "admin"].includes(role) || extraArguments.length > 0) {
    throw new Error("Uso: pnpm user:create <correo> [staff|admin]")
  }

  const password = await readSecret("Contraseña (mínimo 12 caracteres): ")
  const confirmation = await readSecret("Confirma la contraseña: ")
  if (password.length < 12 || password.length > 256 || password !== confirmation) {
    throw new Error("La contraseña debe tener entre 12 y 256 caracteres y ambas entradas deben coincidir.")
  }

  const config = loadConfig()
  const pool = createPostgresPool(config)
  try {
    const passwordHash = await hashPassword(password)
    let result
    try {
      result = await pool.query(`
        INSERT INTO public.app_users (email, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING id, email, role
      `, [email.data, passwordHash, role])
    } catch (error) {
      if (error.code === "23505") throw new Error("Ya existe una cuenta con ese correo.")
      throw error
    }
    console.log(`Cuenta creada: ${result.rows[0].email} (${result.rows[0].role}, ${result.rows[0].id})`)
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
