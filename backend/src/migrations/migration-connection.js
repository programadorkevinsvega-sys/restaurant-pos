export function getMigrationConnectionString(env = process.env) {
  const connectionString = env.MIGRATIONS_DATABASE_URL
  if (!connectionString) {
    throw new Error("MIGRATIONS_DATABASE_URL es obligatoria para ejecutar migraciones.")
  }
  return connectionString
}
