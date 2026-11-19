CREATE TABLE public.legal_entities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  commercial_name text,
  tax_country_code text NOT NULL,
  tax_identifier_type text NOT NULL,
  tax_identifier text NOT NULL,
  registered_address jsonb,
  contact_email text,
  contact_phone text,
  created_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT legal_entities_name_length
    CHECK (
      char_length(btrim(legal_name)) BETWEEN 2 AND 180
      AND legal_name = btrim(legal_name)
    ),
  CONSTRAINT legal_entities_commercial_name_length
    CHECK (
      commercial_name IS NULL
      OR (
        char_length(btrim(commercial_name)) BETWEEN 1 AND 180
        AND commercial_name = btrim(commercial_name)
      )
    ),
  CONSTRAINT legal_entities_tax_country_code_format
    CHECK (tax_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT legal_entities_tax_identifier_type_format
    CHECK (tax_identifier_type ~ '^[A-Z][A-Z0-9_-]{1,23}$'),
  CONSTRAINT legal_entities_tax_identifier_length
    CHECK (
      char_length(btrim(tax_identifier)) BETWEEN 1 AND 80
      AND tax_identifier = btrim(tax_identifier)
    ),
  CONSTRAINT legal_entities_registered_address_object
    CHECK (
      registered_address IS NULL
      OR jsonb_typeof(registered_address) = 'object'
    ),
  CONSTRAINT legal_entities_contact_email_length
    CHECK (
      contact_email IS NULL
      OR (
        char_length(btrim(contact_email)) BETWEEN 3 AND 254
        AND contact_email = lower(btrim(contact_email))
      )
    ),
  CONSTRAINT legal_entities_contact_phone_length
    CHECK (
      contact_phone IS NULL
      OR (
        char_length(btrim(contact_phone)) BETWEEN 7 AND 32
        AND contact_phone = btrim(contact_phone)
      )
    ),
  CONSTRAINT legal_entities_organization_id_id_unique
    UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX legal_entities_tax_identity_unique
  ON public.legal_entities (
    organization_id,
    tax_country_code,
    tax_identifier_type,
    upper(btrim(tax_identifier))
  );

COMMENT ON TABLE public.legal_entities IS
  'Entidades jurídicas/fiscales pertenecientes a la organización. Las reglas tributarias y la facturación se configuran en fases posteriores.';
COMMENT ON COLUMN public.legal_entities.tax_identifier IS
  'Identificador tributario oficial (por ejemplo NIT, RFC, RUC o TIN). Se conserva el formato canónico introducido; no se aplican validadores tributarios por país en esta fase.';
COMMENT ON COLUMN public.legal_entities.tax_country_code IS
  'Código ISO 3166-1 alpha-2 de la jurisdicción que expide el identificador tributario.';
COMMENT ON COLUMN public.legal_entities.tax_identifier_type IS
  'Esquema del identificador tributario, por ejemplo NIT, RFC, RUC o TIN; no implica configuración de régimen fiscal.';

CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  created_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branches_code_format
    CHECK (
      char_length(code) BETWEEN 2 AND 32
      AND code = upper(btrim(code))
      AND code ~ '^[A-Z0-9][A-Z0-9._-]*$'
    ),
  CONSTRAINT branches_name_length
    CHECK (
      char_length(btrim(name)) BETWEEN 2 AND 160
      AND name = btrim(name)
    ),
  CONSTRAINT branches_organization_code_unique
    UNIQUE (organization_id, code),
  CONSTRAINT branches_organization_id_id_unique
    UNIQUE (organization_id, id)
);

COMMENT ON TABLE public.branches IS
  'Identidad mínima de una sucursal para establecer su relación con entidades legales. Dirección, configuración, estado y ciclo de vida se desarrollan en N09-F1.3 y N09-F1.4.';

CREATE TABLE public.branch_legal_entities (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_legal_entities_pk
    PRIMARY KEY (organization_id, branch_id, legal_entity_id),
  CONSTRAINT branch_legal_entities_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT branch_legal_entities_legal_entity_fk
    FOREIGN KEY (organization_id, legal_entity_id)
    REFERENCES public.legal_entities(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX branch_legal_entities_legal_entity_idx
  ON public.branch_legal_entities(organization_id, legal_entity_id, branch_id);

COMMENT ON TABLE public.branch_legal_entities IS
  'Relación N:M explícita entre sucursales y entidades legales de la misma organización. Cada sucursal se crea con una o más entidades y no puede quedarse sin asociación.';

REVOKE ALL ON TABLE public.legal_entities FROM PUBLIC;
REVOKE ALL ON TABLE public.branches FROM PUBLIC;
REVOKE ALL ON TABLE public.branch_legal_entities FROM PUBLIC;

REVOKE ALL ON TABLE public.legal_entities FROM restaurant_pos_app;
REVOKE ALL ON TABLE public.branches FROM restaurant_pos_app;
REVOKE ALL ON TABLE public.branch_legal_entities FROM restaurant_pos_app;

GRANT SELECT ON TABLE public.legal_entities, public.branches, public.branch_legal_entities
  TO restaurant_pos_app;

CREATE FUNCTION public.create_legal_entity(
  p_legal_name text,
  p_commercial_name text,
  p_tax_country_code text,
  p_tax_identifier_type text,
  p_tax_identifier text,
  p_registered_address jsonb,
  p_contact_email text,
  p_contact_phone text,
  p_actor_user_id uuid
)
RETURNS SETOF public.legal_entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_entity public.legal_entities;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.legal_entities (
    organization_id,
    legal_name,
    commercial_name,
    tax_country_code,
    tax_identifier_type,
    tax_identifier,
    registered_address,
    contact_email,
    contact_phone,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    v_organization_id,
    p_legal_name,
    p_commercial_name,
    p_tax_country_code,
    p_tax_identifier_type,
    p_tax_identifier,
    p_registered_address,
    p_contact_email,
    p_contact_phone,
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_entity;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_entity;
END;
$$;

CREATE FUNCTION public.update_legal_entity(
  p_legal_entity_id uuid,
  p_legal_name text,
  p_commercial_name text,
  p_tax_country_code text,
  p_tax_identifier_type text,
  p_tax_identifier text,
  p_registered_address jsonb,
  p_contact_email text,
  p_contact_phone text,
  p_actor_user_id uuid
)
RETURNS SETOF public.legal_entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_entity public.legal_entities;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.legal_entities
  SET
    legal_name = p_legal_name,
    commercial_name = p_commercial_name,
    tax_country_code = p_tax_country_code,
    tax_identifier_type = p_tax_identifier_type,
    tax_identifier = p_tax_identifier,
    registered_address = p_registered_address,
    contact_email = p_contact_email,
    contact_phone = p_contact_phone,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  WHERE organization_id = v_organization_id
    AND id = p_legal_entity_id
  RETURNING * INTO v_entity;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_entity;
EXCEPTION
  WHEN unique_violation THEN
    RETURN;
END;
$$;

CREATE FUNCTION public.create_branch(
  p_code text,
  p_name text,
  p_legal_entity_ids uuid[],
  p_actor_user_id uuid
)
RETURNS TABLE(created_branch_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_id uuid;
  v_id_count integer;
  v_distinct_id_count integer;
  v_valid_id_count integer;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  IF p_legal_entity_ids IS NULL OR cardinality(p_legal_entity_ids) < 1 THEN
    RETURN QUERY SELECT NULL::uuid, 'LEGAL_ENTITY_REQUIRED'::text;
    RETURN;
  END IF;

  v_id_count := cardinality(p_legal_entity_ids);
  SELECT count(DISTINCT candidate_id)::integer
    INTO v_distinct_id_count
  FROM unnest(p_legal_entity_ids) AS input_ids(candidate_id);

  IF v_id_count <> v_distinct_id_count THEN
    RETURN QUERY SELECT NULL::uuid, 'DUPLICATE_LEGAL_ENTITY_IDS'::text;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_valid_id_count
  FROM public.legal_entities AS le
  WHERE le.organization_id = v_organization_id
    AND le.id = ANY(p_legal_entity_ids);

  IF v_valid_id_count <> v_id_count THEN
    RETURN QUERY SELECT NULL::uuid, 'LEGAL_ENTITY_SCOPE_INVALID'::text;
    RETURN;
  END IF;

  INSERT INTO public.branches (
    organization_id,
    code,
    name,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    v_organization_id,
    upper(btrim(p_code)),
    p_name,
    p_actor_user_id,
    p_actor_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_branch_id;

  IF v_branch_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'BRANCH_CODE_ALREADY_EXISTS'::text;
    RETURN;
  END IF;

  INSERT INTO public.branch_legal_entities (
    organization_id,
    branch_id,
    legal_entity_id,
    created_by_user_id
  )
  SELECT
    v_organization_id,
    v_branch_id,
    input_ids.legal_entity_id,
    p_actor_user_id
  FROM unnest(p_legal_entity_ids) AS input_ids(legal_entity_id);

  RETURN QUERY SELECT v_branch_id, 'CREATED'::text;
END;
$$;

CREATE FUNCTION public.update_branch_identity(
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_actor_user_id uuid
)
RETURNS SETOF public.branches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch public.branches;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.branches
  SET
    code = upper(btrim(p_code)),
    name = p_name,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  WHERE organization_id = v_organization_id
    AND id = p_branch_id
  RETURNING * INTO v_branch;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_branch;
EXCEPTION
  WHEN unique_violation THEN
    RETURN;
END;
$$;

CREATE FUNCTION public.assign_branch_legal_entity(
  p_branch_id uuid,
  p_legal_entity_id uuid,
  p_actor_user_id uuid
)
RETURNS SETOF public.branch_legal_entities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_assignment public.branch_legal_entities;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.branch_legal_entities (
    organization_id,
    branch_id,
    legal_entity_id,
    created_by_user_id
  )
  SELECT
    v_organization_id,
    b.id,
    le.id,
    p_actor_user_id
  FROM public.branches AS b
  JOIN public.legal_entities AS le
    ON le.organization_id = b.organization_id
  WHERE b.organization_id = v_organization_id
    AND b.id = p_branch_id
    AND le.id = p_legal_entity_id
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_assignment;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN NEXT v_assignment;
END;
$$;

CREATE FUNCTION public.remove_branch_legal_entity(
  p_branch_id uuid,
  p_legal_entity_id uuid,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_assignment_count integer;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS u ON u.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND u.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id
    AND b.id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;

  PERFORM 1
  FROM public.branch_legal_entities AS ble
  WHERE ble.organization_id = v_organization_id
    AND ble.branch_id = p_branch_id
    AND ble.legal_entity_id = p_legal_entity_id;

  IF NOT FOUND THEN
    RETURN 'ASSIGNMENT_NOT_FOUND';
  END IF;

  SELECT count(*)::integer INTO v_assignment_count
  FROM public.branch_legal_entities AS ble
  WHERE ble.organization_id = v_organization_id
    AND ble.branch_id = p_branch_id;

  IF v_assignment_count <= 1 THEN
    RETURN 'LAST_LEGAL_ENTITY';
  END IF;

  DELETE FROM public.branch_legal_entities AS ble
  WHERE ble.organization_id = v_organization_id
    AND ble.branch_id = p_branch_id
    AND ble.legal_entity_id = p_legal_entity_id;

  RETURN 'REMOVED';
END;
$$;

REVOKE ALL ON FUNCTION public.create_legal_entity(
  text, text, text, text, text, jsonb, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_legal_entity(
  uuid, text, text, text, text, text, jsonb, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_branch(
  text, text, uuid[], uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_branch_identity(
  uuid, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_branch_legal_entity(
  uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_branch_legal_entity(
  uuid, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_legal_entity(
  text, text, text, text, text, jsonb, text, text, uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.update_legal_entity(
  uuid, text, text, text, text, text, jsonb, text, text, uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.create_branch(
  text, text, uuid[], uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.update_branch_identity(
  uuid, text, text, uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.assign_branch_legal_entity(
  uuid, uuid, uuid
) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.remove_branch_legal_entity(
  uuid, uuid, uuid
) TO restaurant_pos_app;
