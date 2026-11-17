import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import pg from "pg"
import { getMigrationConnectionString } from "./migration-connection.js"

dotenv.config()

const { Pool } = pg
const migrationDirectory = path.dirname(fileURLToPath(import.meta.url))
const connectionString = getMigrationConnectionString()

const pool = new Pool({ connectionString, max: 1 })

async function runMigrations() {
  const client = await pool.connect()
  try {
    await client.query("SELECT pg_advisory_lock($1)", [741258963])
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    const files = (await readdir(migrationDirectory))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort()

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM public.schema_migrations WHERE version = $1",
        [file],
      )
      if (alreadyApplied.rowCount) continue

      const migration = await readFile(path.join(migrationDirectory, file), "utf8")
      await client.query("BEGIN")
      try {
        await client.query(migration)
        await client.query("INSERT INTO public.schema_migrations(version) VALUES ($1)", [file])
        await client.query("COMMIT")
        console.info(`Applied ${file}`)
      } catch (error) {
        await client.query("ROLLBACK")
        throw new Error(`Migration failed: ${file}`, { cause: error })
      }
    }
    console.info("All migrations are applied.")
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [741258963])
    } finally {
      client.release()
      await pool.end()
    }
  }
}

runMigrations().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
