ALTER TABLE public.branches
  ADD COLUMN status text NOT NULL DEFAULT 'active',
  ADD COLUMN status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_user_id uuid
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT branches_status_valid
    CHECK (status IN ('active', 'suspended', 'closed')),
  ADD CONSTRAINT branches_closed_metadata_consistent
    CHECK (
      (status = 'closed' AND closed_at IS NOT NULL AND closed_by_user_id IS NOT NULL)
      OR
      (status IN ('active', 'suspended') AND closed_at IS NULL AND closed_by_user_id IS NULL)
    );

UPDATE public.branches
SET status_changed_at = created_at;

COMMENT ON COLUMN public.branches.status IS
  'Estado operativo: active, suspended o closed. Las sucursales no activas conservan consulta histórica.';
COMMENT ON COLUMN public.branches.closed_at IS
  'Instante de cierre definitivo; la API no permite reabrir una sucursal cerrada.';

CREATE TABLE public.branch_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL
    CHECK (new_status IN ('active', 'suspended', 'closed')),
  actor_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_lifecycle_events_previous_status_valid
    CHECK (previous_status IS NULL OR previous_status IN ('active', 'suspended', 'closed')),
  CONSTRAINT branch_lifecycle_events_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX branch_lifecycle_events_branch_history_idx
  ON public.branch_lifecycle_events(organization_id, branch_id, occurred_at DESC, id);

REVOKE ALL ON TABLE public.branch_lifecycle_events FROM PUBLIC;
REVOKE ALL ON TABLE public.branch_lifecycle_events FROM restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_lifecycle_events TO restaurant_pos_app;

CREATE FUNCTION public.record_branch_initial_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  INSERT INTO public.branch_lifecycle_events (
    organization_id, branch_id, previous_status, new_status, actor_user_id, occurred_at
  )
  VALUES (
    NEW.organization_id, NEW.id, NULL, NEW.status, NEW.created_by_user_id, NEW.created_at
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.record_branch_initial_status() FROM PUBLIC;

CREATE TRIGGER branches_record_initial_status
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.record_branch_initial_status();

-- Existing branches predate lifecycle state; their explicit baseline is active.
INSERT INTO public.branch_lifecycle_events (
  organization_id, branch_id, previous_status, new_status, actor_user_id, occurred_at
)
SELECT
  b.organization_id, b.id, NULL, b.status, b.created_by_user_id, b.created_at
FROM public.branches AS b;

CREATE FUNCTION public.change_branch_status(
  p_branch_id uuid,
  p_new_status text,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_previous_status text;
BEGIN
  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS owner ON owner.id = o.owner_user_id
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id
    AND owner.is_active = true;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN ('active', 'suspended', 'closed') THEN
    RETURN 'INVALID_STATUS';
  END IF;

  SELECT b.status INTO v_previous_status
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id
    AND b.id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;

  IF v_previous_status = p_new_status THEN
    RETURN 'UNCHANGED';
  END IF;

  IF v_previous_status = 'closed' THEN
    RETURN 'BRANCH_CLOSED';
  END IF;

  UPDATE public.branches
  SET
    status = p_new_status,
    status_changed_at = now(),
    closed_at = CASE WHEN p_new_status = 'closed' THEN now() ELSE NULL END,
    closed_by_user_id = CASE WHEN p_new_status = 'closed' THEN p_actor_user_id ELSE NULL END,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  WHERE organization_id = v_organization_id
    AND id = p_branch_id;

  INSERT INTO public.branch_lifecycle_events (
    organization_id, branch_id, previous_status, new_status, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, v_previous_status, p_new_status, p_actor_user_id
  );

  RETURN 'CHANGED';
END;
$$;

REVOKE ALL ON FUNCTION public.change_branch_status(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_branch_status(uuid, text, uuid)
  TO restaurant_pos_app;

REVOKE UPDATE ON TABLE public.branches FROM PUBLIC, restaurant_pos_app;

-- Lock the branch row when mutating an attributed order. FOR SHARE serializes
-- order writes with lifecycle transitions, which take FOR UPDATE on the branch.
CREATE FUNCTION public.guard_branch_order_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_branch_id uuid;
  v_organization_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_branch_id := OLD.branch_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_branch_id := NEW.branch_id;
    v_organization_id := NEW.organization_id;
  END IF;

  IF v_branch_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'BRANCH_CONTEXT_REQUIRED'
        USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT b.status INTO v_status
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id
    AND b.id = v_branch_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND'
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_branch_order_writes() FROM PUBLIC;

CREATE TRIGGER orders_require_active_branch
  BEFORE INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_order_writes();

-- Protect detail rows too: a caller cannot mutate order items or delivery
-- details independently after the owning branch has become read-only.
CREATE FUNCTION public.guard_branch_order_child_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_order_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
    IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'ORDER_DETAIL_PARENT_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  SELECT b.status INTO v_status
  FROM public.orders AS o
  JOIN public.branches AS b
    ON b.organization_id = o.organization_id
    AND b.id = o.branch_id
  WHERE o.id = v_order_id
  FOR SHARE OF b;

  -- Historical rows without branch attribution remain governed by their
  -- existing rules; no branch is inferred for them.
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_branch_order_child_writes() FROM PUBLIC;

CREATE TRIGGER order_items_require_active_branch
  BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_order_child_writes();

CREATE TRIGGER delivery_info_require_active_branch
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_info
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_order_child_writes();

CREATE FUNCTION public.guard_branch_user_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT b.status INTO v_status
  FROM public.branches AS b
  WHERE b.organization_id = NEW.organization_id
    AND b.id = NEW.branch_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND'
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_branch_user_assignments() FROM PUBLIC;

CREATE TRIGGER branch_user_assignments_require_active_branch
  BEFORE INSERT ON public.branch_user_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_user_assignments();


CREATE FUNCTION public.guard_branch_identity_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.status <> 'active'
     AND (NEW.code IS DISTINCT FROM OLD.code OR NEW.name IS DISTINCT FROM OLD.name) THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_branch_identity_writes() FROM PUBLIC;

CREATE TRIGGER branches_identity_requires_active_state
  BEFORE UPDATE OF code, name ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_identity_writes();

CREATE FUNCTION public.guard_branch_legal_entity_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_branch_id uuid;
  v_organization_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_branch_id := OLD.branch_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_branch_id := NEW.branch_id;
    v_organization_id := NEW.organization_id;
  END IF;

  SELECT b.status INTO v_status
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id
    AND b.id = v_branch_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND'
      USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_branch_legal_entity_writes() FROM PUBLIC;

CREATE TRIGGER branch_legal_entities_require_active_branch
  BEFORE INSERT OR UPDATE OR DELETE ON public.branch_legal_entities
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_branch_legal_entity_writes();
