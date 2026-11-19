-- N09-F1.5: append-only history for corporate structure changes.
-- Existing branch lifecycle and local-configuration logs are included in the
-- read model; they are not copied into this table.

CREATE TABLE public.organization_change_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (
    resource_type IN ('organization', 'legal_entity', 'branch', 'branch_legal_entity')
  ),
  resource_id uuid NOT NULL,
  branch_id uuid,
  action text NOT NULL CHECK (
    (resource_type = 'organization' AND action IN ('created', 'updated'))
    OR (resource_type = 'legal_entity' AND action IN ('created', 'updated'))
    OR (resource_type = 'branch' AND action IN ('created', 'updated'))
    OR (resource_type = 'branch_legal_entity' AND action IN ('associated', 'disassociated'))
  ),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  actor_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_change_events_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT organization_change_events_branch_scope
    CHECK (
      (resource_type IN ('branch', 'branch_legal_entity') AND branch_id IS NOT NULL)
      OR (resource_type IN ('organization', 'legal_entity') AND branch_id IS NULL)
    ),
  CONSTRAINT organization_change_events_state_shape
    CHECK (
      (action IN ('created', 'associated') AND before_state IS NULL AND after_state IS NOT NULL)
      OR (action = 'updated' AND before_state IS NOT NULL AND after_state IS NOT NULL)
      OR (action = 'disassociated' AND before_state IS NOT NULL AND after_state IS NULL)
    )
);

CREATE INDEX organization_change_events_timeline_idx
  ON public.organization_change_events(organization_id, occurred_at DESC, id DESC);

CREATE INDEX organization_change_events_resource_idx
  ON public.organization_change_events(
    organization_id, resource_type, resource_id, occurred_at DESC, id DESC
  );

REVOKE ALL ON TABLE public.organization_change_events FROM PUBLIC, restaurant_pos_app;

CREATE FUNCTION public.reject_organization_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Organization change history is append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER organization_change_events_append_only
  BEFORE UPDATE OR DELETE ON public.organization_change_events
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_organization_change_event_mutation();

CREATE FUNCTION public.capture_organization_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor_user_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.commercial_name IS NOT DISTINCT FROM NEW.commercial_name
     AND OLD.contact_email IS NOT DISTINCT FROM NEW.contact_email
     AND OLD.contact_phone IS NOT DISTINCT FROM NEW.contact_phone
     AND OLD.website_url IS NOT DISTINCT FROM NEW.website_url
     AND OLD.headquarters_address IS NOT DISTINCT FROM NEW.headquarters_address THEN
    RETURN NEW;
  END IF;

  v_actor_user_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.owner_user_id
    ELSE NEW.updated_by_user_id
  END;
  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;

  IF TG_OP = 'UPDATE' THEN
    v_before := jsonb_build_object(
      'name', OLD.name,
      'commercial_name', OLD.commercial_name,
      'contact_email', OLD.contact_email,
      'contact_phone', OLD.contact_phone,
      'website_url', OLD.website_url,
      'headquarters_address', OLD.headquarters_address
    );
  END IF;

  v_after := jsonb_build_object(
    'name', NEW.name,
    'commercial_name', NEW.commercial_name,
    'contact_email', NEW.contact_email,
    'contact_phone', NEW.contact_phone,
    'website_url', NEW.website_url,
    'headquarters_address', NEW.headquarters_address
  );

  INSERT INTO public.organization_change_events (
    organization_id, resource_type, resource_id, action,
    before_state, after_state, actor_user_id
  )
  VALUES (
    NEW.id, 'organization', NEW.id, v_action,
    v_before, v_after, v_actor_user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_change_history
  AFTER INSERT OR UPDATE OF
    name, commercial_name, contact_email, contact_phone, website_url, headquarters_address
  ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_organization_profile_change();

CREATE FUNCTION public.capture_legal_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor_user_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.legal_name IS NOT DISTINCT FROM NEW.legal_name
     AND OLD.commercial_name IS NOT DISTINCT FROM NEW.commercial_name
     AND OLD.tax_country_code IS NOT DISTINCT FROM NEW.tax_country_code
     AND OLD.tax_identifier_type IS NOT DISTINCT FROM NEW.tax_identifier_type
     AND OLD.tax_identifier IS NOT DISTINCT FROM NEW.tax_identifier
     AND OLD.registered_address IS NOT DISTINCT FROM NEW.registered_address
     AND OLD.contact_email IS NOT DISTINCT FROM NEW.contact_email
     AND OLD.contact_phone IS NOT DISTINCT FROM NEW.contact_phone THEN
    RETURN NEW;
  END IF;

  v_actor_user_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.created_by_user_id
    ELSE NEW.updated_by_user_id
  END;
  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;

  IF TG_OP = 'UPDATE' THEN
    v_before := jsonb_build_object(
      'legal_name', OLD.legal_name,
      'commercial_name', OLD.commercial_name,
      'tax_country_code', OLD.tax_country_code,
      'tax_identifier_type', OLD.tax_identifier_type,
      'tax_identifier', CASE
        WHEN OLD.tax_identifier IS NULL THEN NULL
        ELSE CASE WHEN char_length(OLD.tax_identifier) > 4
        THEN '****' || right(OLD.tax_identifier, 4)
        ELSE '****'
      END
      END,
      'registered_address', OLD.registered_address,
      'contact_email', OLD.contact_email,
      'contact_phone', OLD.contact_phone
    );
  END IF;

  v_after := jsonb_build_object(
    'legal_name', NEW.legal_name,
    'commercial_name', NEW.commercial_name,
    'tax_country_code', NEW.tax_country_code,
    'tax_identifier_type', NEW.tax_identifier_type,
    'tax_identifier', CASE
      WHEN NEW.tax_identifier IS NULL THEN NULL
      ELSE CASE WHEN char_length(NEW.tax_identifier) > 4
        THEN '****' || right(NEW.tax_identifier, 4)
        ELSE '****'
      END
    END,
    'registered_address', NEW.registered_address,
    'contact_email', NEW.contact_email,
    'contact_phone', NEW.contact_phone
  );

  INSERT INTO public.organization_change_events (
    organization_id, resource_type, resource_id, action,
    before_state, after_state, actor_user_id
  )
  VALUES (
    NEW.organization_id, 'legal_entity', NEW.id, v_action,
    v_before, v_after, v_actor_user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER legal_entities_change_history
  AFTER INSERT OR UPDATE OF
    legal_name, commercial_name, tax_country_code, tax_identifier_type,
    tax_identifier, registered_address, contact_email, contact_phone
  ON public.legal_entities
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_legal_entity_change();

CREATE FUNCTION public.capture_branch_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_actor_user_id uuid;
  v_before jsonb;
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.code IS NOT DISTINCT FROM NEW.code
     AND OLD.name IS NOT DISTINCT FROM NEW.name THEN
    RETURN NEW;
  END IF;

  v_actor_user_id := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.created_by_user_id
    ELSE NEW.updated_by_user_id
  END;
  v_action := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;

  IF TG_OP = 'UPDATE' THEN
    v_before := jsonb_build_object('code', OLD.code, 'name', OLD.name);
  END IF;

  INSERT INTO public.organization_change_events (
    organization_id, resource_type, resource_id, branch_id, action,
    before_state, after_state, actor_user_id
  )
  VALUES (
    NEW.organization_id, 'branch', NEW.id, NEW.id, v_action,
    v_before, jsonb_build_object('code', NEW.code, 'name', NEW.name),
    v_actor_user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER branches_identity_change_history
  AFTER INSERT OR UPDATE OF code, name ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_branch_identity_change();

CREATE FUNCTION public.capture_branch_legal_entity_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_legal_name text;
  v_branch_code text;
BEGIN
  SELECT le.legal_name, b.code
    INTO v_legal_name, v_branch_code
  FROM public.legal_entities AS le
  JOIN public.branches AS b
    ON b.organization_id = le.organization_id
  WHERE le.organization_id = NEW.organization_id
    AND le.id = NEW.legal_entity_id
    AND b.id = NEW.branch_id;

  INSERT INTO public.organization_change_events (
    organization_id, resource_type, resource_id, branch_id, action,
    before_state, after_state, metadata, actor_user_id
  )
  VALUES (
    NEW.organization_id, 'branch_legal_entity', NEW.legal_entity_id,
    NEW.branch_id, 'associated', NULL,
    jsonb_build_object(
      'branch_id', NEW.branch_id,
      'legal_entity_id', NEW.legal_entity_id,
      'legal_name', v_legal_name
    ),
    jsonb_build_object('branch_code', v_branch_code),
    NEW.created_by_user_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER branch_legal_entities_change_history
  AFTER INSERT ON public.branch_legal_entities
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_branch_legal_entity_association();

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
  v_legal_name text;
  v_branch_code text;
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

  SELECT le.legal_name, b.code
    INTO v_legal_name, v_branch_code
  FROM public.branch_legal_entities AS ble
  JOIN public.legal_entities AS le
    ON le.organization_id = ble.organization_id
    AND le.id = ble.legal_entity_id
  JOIN public.branches AS b
    ON b.organization_id = ble.organization_id
    AND b.id = ble.branch_id
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

  IF FOUND THEN
    INSERT INTO public.organization_change_events (
      organization_id, resource_type, resource_id, branch_id, action,
      before_state, after_state, metadata, actor_user_id
    )
    VALUES (
      v_organization_id, 'branch_legal_entity', p_legal_entity_id,
      p_branch_id, 'disassociated',
      jsonb_build_object(
        'branch_id', p_branch_id,
        'legal_entity_id', p_legal_entity_id,
        'legal_name', v_legal_name
      ),
      NULL,
      jsonb_build_object('branch_code', v_branch_code),
      p_actor_user_id
    );
  END IF;

  RETURN 'REMOVED';
END;
$$;

CREATE FUNCTION public.list_organization_history(
  p_actor_user_id uuid,
  p_limit integer,
  p_before_at timestamptz,
  p_before_id uuid,
  p_resource_type text,
  p_branch_id uuid
)
RETURNS TABLE(
  id uuid,
  resource_type text,
  resource_id uuid,
  branch_id uuid,
  action text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  actor_user_id uuid,
  actor_email text,
  occurred_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS actor
    ON actor.id = o.owner_user_id
    AND actor.is_active = true
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 101
     OR (p_before_at IS NULL) <> (p_before_id IS NULL)
     OR (p_resource_type IS NOT NULL AND p_resource_type NOT IN (
       'organization', 'legal_entity', 'branch', 'branch_legal_entity'
     )) THEN
    RAISE EXCEPTION 'Invalid organization history query'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH history AS (
    SELECT
      event.id,
      event.resource_type,
      event.resource_id,
      event.branch_id,
      event.action,
      event.before_state,
      event.after_state,
      event.metadata,
      event.actor_user_id,
      event.occurred_at
    FROM public.organization_change_events AS event
    WHERE event.organization_id = v_organization_id

    UNION ALL

    SELECT
      event.id,
      'branch'::text,
      event.branch_id,
      event.branch_id,
      'branch.lifecycle.changed'::text,
      jsonb_build_object('status', event.previous_status),
      jsonb_build_object('status', event.new_status),
      '{}'::jsonb,
      event.actor_user_id,
      event.occurred_at
    FROM public.branch_lifecycle_events AS event
    WHERE event.organization_id = v_organization_id
      AND event.previous_status IS NOT NULL

    UNION ALL

    SELECT
      event.id,
      'branch'::text,
      event.branch_id,
      event.branch_id,
      event.event_type,
      event.before_state,
      event.after_state,
      CASE
        WHEN event.local_date IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('local_date', to_char(event.local_date, 'YYYY-MM-DD'))
      END,
      event.actor_user_id,
      event.occurred_at
    FROM public.branch_local_configuration_events AS event
    WHERE event.organization_id = v_organization_id
  )
  SELECT
    history.id,
    history.resource_type,
    history.resource_id,
    history.branch_id,
    history.action,
    history.before_state,
    history.after_state,
    history.metadata,
    history.actor_user_id,
    actor.email,
    history.occurred_at
  FROM history
  JOIN public.app_users AS actor ON actor.id = history.actor_user_id
  WHERE (p_resource_type IS NULL OR history.resource_type = p_resource_type)
    AND (p_branch_id IS NULL OR history.branch_id = p_branch_id)
    AND (
      p_before_at IS NULL
      OR (history.occurred_at, history.id) < (p_before_at, p_before_id)
    )
  ORDER BY history.occurred_at DESC, history.id DESC
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_organization_profile_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_legal_entity_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_branch_identity_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_branch_legal_entity_association() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_organization_change_event_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_branch_legal_entity(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_organization_history(uuid, integer, timestamptz, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.remove_branch_legal_entity(uuid, uuid, uuid)
  TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.list_organization_history(uuid, integer, timestamptz, uuid, text, uuid)
  TO restaurant_pos_app;
