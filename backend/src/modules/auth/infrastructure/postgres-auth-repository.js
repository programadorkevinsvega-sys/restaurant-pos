import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

function mapUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    isActive: row.is_active,
  }
}

export class PostgresAuthRepository {
  constructor(pool) {
    this.pool = pool
  }

  async findUserByEmail(email) {
    const result = await queryPostgres(this.pool, `
      SELECT id, email, role, password_hash, is_active
      FROM public.app_users
      WHERE lower(email) = $1
      LIMIT 1
    `, [email])
    return mapUser(result.rows[0])
  }

  async createSession(session) {
    await queryPostgres(this.pool, `
      INSERT INTO public.auth_sessions (
        user_id, access_token_hash, refresh_token_hash,
        access_expires_at, refresh_expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
    `, [
      session.userId,
      session.accessTokenHash,
      session.refreshTokenHash,
      session.accessExpiresAt,
      session.refreshExpiresAt,
    ])
  }

  async rotateSession(session) {
    const result = await queryPostgres(this.pool, `
      UPDATE public.auth_sessions AS s
      SET access_token_hash = $2,
          refresh_token_hash = $3,
          access_expires_at = $4,
          refresh_expires_at = $5,
          updated_at = now()
      FROM public.app_users AS u
      WHERE s.refresh_token_hash = $1
        AND s.user_id = u.id
        AND s.revoked_at IS NULL
        AND s.refresh_expires_at > now()
        AND u.is_active = true
      RETURNING u.id, u.email, u.role, u.is_active
    `, [
      session.currentRefreshTokenHash,
      session.accessTokenHash,
      session.refreshTokenHash,
      session.accessExpiresAt,
      session.refreshExpiresAt,
    ])
    return mapUser(result.rows[0])
  }

  async findUserByAccessTokenHash(accessTokenHash) {
    const result = await queryPostgres(this.pool, `
      SELECT u.id, u.email, u.role, u.is_active
      FROM public.auth_sessions AS s
      JOIN public.app_users AS u ON u.id = s.user_id
      WHERE s.access_token_hash = $1
        AND s.access_expires_at > now()
        AND s.revoked_at IS NULL
        AND u.is_active = true
      LIMIT 1
    `, [accessTokenHash])
    return mapUser(result.rows[0])
  }

  async revokeSession(tokens) {
    await queryPostgres(this.pool, `
      UPDATE public.auth_sessions
      SET revoked_at = now(),
          updated_at = now()
      WHERE revoked_at IS NULL
        AND (
          ($1::text IS NOT NULL AND access_token_hash = $1)
          OR ($2::text IS NOT NULL AND refresh_token_hash = $2)
        )
    `, [tokens.accessTokenHash, tokens.refreshTokenHash])
  }
}
