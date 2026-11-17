CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('staff', 'admin')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX app_users_email_normalized_unique
  ON public.app_users (lower(email));

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (refresh_expires_at > access_expires_at)
);

CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions(user_id);
CREATE INDEX auth_sessions_refresh_expiry_idx ON public.auth_sessions(refresh_expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users, public.auth_sessions
  TO restaurant_pos_app;
