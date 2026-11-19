CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  installation_slot smallint NOT NULL DEFAULT 1,
  name text NOT NULL,
  commercial_name text,
  contact_email text,
  contact_phone text,
  website_url text,
  headquarters_address jsonb,
  owner_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_single_installation_slot
    CHECK (installation_slot = 1),
  CONSTRAINT organizations_installation_slot_unique
    UNIQUE (installation_slot),
  CONSTRAINT organizations_name_length
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT organizations_commercial_name_length
    CHECK (
      commercial_name IS NULL
      OR char_length(btrim(commercial_name)) BETWEEN 1 AND 160
    ),
  CONSTRAINT organizations_contact_email_format
    CHECK (
      contact_email IS NULL
      OR (
        char_length(btrim(contact_email)) BETWEEN 3 AND 254
        AND contact_email = lower(btrim(contact_email))
      )
    ),
  CONSTRAINT organizations_contact_phone_length
    CHECK (
      contact_phone IS NULL
      OR char_length(btrim(contact_phone)) BETWEEN 7 AND 32
    ),
  CONSTRAINT organizations_website_url_length
    CHECK (website_url IS NULL OR char_length(btrim(website_url)) <= 2048),
  CONSTRAINT organizations_headquarters_address_object
    CHECK (
      headquarters_address IS NULL
      OR jsonb_typeof(headquarters_address) = 'object'
    )
);

COMMENT ON TABLE public.organizations IS
  'Perfil corporativo único de la cadena en esta instalación. No representa entidades legales ni tenants independientes.';
COMMENT ON COLUMN public.organizations.installation_slot IS
  'Restricción explícita de una organización por instalación. El valor 1 impide crear organizaciones adicionales.';
COMMENT ON COLUMN public.organizations.owner_user_id IS
  'Usuario que completó el bootstrap inicial. No se deriva del rol heredado admin en operaciones posteriores.';
COMMENT ON COLUMN public.organizations.headquarters_address IS
  'Dirección corporativa no fiscal. La identidad fiscal pertenece a cada entidad legal.';

REVOKE ALL ON TABLE public.organizations FROM PUBLIC;
REVOKE ALL ON TABLE public.organizations FROM restaurant_pos_app;
GRANT SELECT ON TABLE public.organizations TO restaurant_pos_app;

CREATE FUNCTION public.bootstrap_organization_profile(
  p_name text,
  p_commercial_name text,
  p_contact_email text,
  p_contact_phone text,
  p_website_url text,
  p_headquarters_address jsonb,
  p_actor_user_id uuid
)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.organizations;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE id = p_actor_user_id
      AND role = 'admin'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active administrator required for organization bootstrap'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organizations (
    installation_slot,
    name,
    commercial_name,
    contact_email,
    contact_phone,
    website_url,
    headquarters_address,
    owner_user_id,
    updated_by_user_id
  )
  VALUES (
    1,
    p_name,
    p_commercial_name,
    p_contact_email,
    p_contact_phone,
    p_website_url,
    p_headquarters_address,
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT (installation_slot) DO NOTHING
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_profile;
END;
$$;

CREATE FUNCTION public.update_organization_profile(
  p_actor_user_id uuid,
  p_name_provided boolean,
  p_name text,
  p_commercial_name_provided boolean,
  p_commercial_name text,
  p_contact_email_provided boolean,
  p_contact_email text,
  p_contact_phone_provided boolean,
  p_contact_phone text,
  p_website_url_provided boolean,
  p_website_url text,
  p_headquarters_address_provided boolean,
  p_headquarters_address jsonb
)
RETURNS SETOF public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.organizations;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE id = p_actor_user_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    p_name_provided
    OR p_commercial_name_provided
    OR p_contact_email_provided
    OR p_contact_phone_provided
    OR p_website_url_provided
    OR p_headquarters_address_provided
  ) THEN
    RAISE EXCEPTION 'At least one organization field must be provided'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.organizations
  SET
    name = CASE WHEN p_name_provided THEN p_name ELSE name END,
    commercial_name = CASE
      WHEN p_commercial_name_provided THEN p_commercial_name
      ELSE commercial_name
    END,
    contact_email = CASE
      WHEN p_contact_email_provided THEN p_contact_email
      ELSE contact_email
    END,
    contact_phone = CASE
      WHEN p_contact_phone_provided THEN p_contact_phone
      ELSE contact_phone
    END,
    website_url = CASE
      WHEN p_website_url_provided THEN p_website_url
      ELSE website_url
    END,
    headquarters_address = CASE
      WHEN p_headquarters_address_provided THEN p_headquarters_address
      ELSE headquarters_address
    END,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  WHERE installation_slot = 1
    AND owner_user_id = p_actor_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_organization_profile(
  text, text, text, text, text, jsonb, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_profile(
  uuid, boolean, text, boolean, text, boolean, text,
  boolean, text, boolean, text, boolean, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.bootstrap_organization_profile(
  text, text, text, text, text, jsonb, uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.update_organization_profile(
  uuid, boolean, text, boolean, text, boolean, text,
  boolean, text, boolean, text, boolean, jsonb
) TO restaurant_pos_app;
