\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'restaurant_pos') THEN
    RAISE EXCEPTION 'Database restaurant_pos already exists; refusing to alter it.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('restaurant_pos_migrator', 'restaurant_pos_app')
  ) THEN
    RAISE EXCEPTION 'A Restaurant POS role already exists; inspect the cluster before provisioning.';
  END IF;
END;
$$;

SET password_encryption = 'scram-sha-256';

CREATE ROLE restaurant_pos_migrator
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 2;
\password restaurant_pos_migrator

CREATE ROLE restaurant_pos_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 20;
\password restaurant_pos_app

CREATE DATABASE restaurant_pos OWNER restaurant_pos_migrator;
\connect restaurant_pos

ALTER DATABASE restaurant_pos SET timezone TO 'UTC';
REVOKE CONNECT ON DATABASE restaurant_pos FROM PUBLIC;
GRANT CONNECT ON DATABASE restaurant_pos TO restaurant_pos_migrator, restaurant_pos_app;

ALTER SCHEMA public OWNER TO restaurant_pos_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO restaurant_pos_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public TO restaurant_pos_app;
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public TO restaurant_pos_app;

ALTER DEFAULT PRIVILEGES FOR ROLE restaurant_pos_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO restaurant_pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE restaurant_pos_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO restaurant_pos_app;
ALTER DEFAULT PRIVILEGES FOR ROLE restaurant_pos_migrator
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

\echo 'PostgreSQL database and roles provisioned. Store the two passwords in the approved secret manager.'
