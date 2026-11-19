CREATE TABLE public.branch_catalog_product_exclusions (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  excluded_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  excluded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_catalog_product_exclusions_pk
    PRIMARY KEY (organization_id, branch_id, product_id),
  CONSTRAINT branch_catalog_product_exclusions_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX branch_catalog_product_exclusions_product_idx
  ON public.branch_catalog_product_exclusions(product_id, branch_id);

COMMENT ON TABLE public.branch_catalog_product_exclusions IS
  'Excepciones locales del catálogo maestro corporativo. Sin fila, el producto permanece heredado y disponible en las sucursales de la organización; con fila, queda excluido de esa sucursal. No duplica el producto.';

CREATE TABLE public.branch_catalog_product_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  previous_enabled boolean NOT NULL,
  new_enabled boolean NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_catalog_product_events_change CHECK (previous_enabled <> new_enabled),
  CONSTRAINT branch_catalog_product_events_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX branch_catalog_product_events_branch_history_idx
  ON public.branch_catalog_product_events(organization_id, branch_id, sequence DESC);

REVOKE ALL ON TABLE public.branch_catalog_product_exclusions FROM PUBLIC, restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_catalog_product_exclusions TO restaurant_pos_app;
REVOKE ALL ON TABLE public.branch_catalog_product_events FROM PUBLIC, restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_catalog_product_events TO restaurant_pos_app;

CREATE FUNCTION public.prevent_branch_catalog_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Branch catalog events are append-only'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_branch_catalog_event_mutation() FROM PUBLIC;

CREATE TRIGGER branch_catalog_product_events_append_only
  BEFORE UPDATE OR DELETE ON public.branch_catalog_product_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_branch_catalog_event_mutation();

CREATE FUNCTION public.list_branch_catalog_products(
  p_branch_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  price numeric,
  image_url text,
  discount_percentage integer,
  type text,
  category_id uuid,
  category_name text,
  category_icon text,
  enabled boolean,
  last_changed_at timestamptz,
  last_changed_by_user_id uuid,
  last_changed_by_email text
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
  JOIN public.app_users AS owner
    ON owner.id = o.owner_user_id AND owner.is_active = true
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches AS b
    WHERE b.organization_id = v_organization_id AND b.id = p_branch_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    p.image_url,
    p.discount_percentage,
    p.type,
    p.category_id,
    c.name,
    c.icon,
    (excluded.product_id IS NULL) AS enabled,
    latest.occurred_at,
    latest.actor_user_id,
    latest.actor_email
  FROM public.products AS p
  LEFT JOIN public.categories AS c ON c.id = p.category_id
  LEFT JOIN public.branch_catalog_product_exclusions AS excluded
    ON excluded.organization_id = v_organization_id
    AND excluded.branch_id = p_branch_id
    AND excluded.product_id = p.id
  LEFT JOIN LATERAL (
    SELECT event.occurred_at, event.actor_user_id, actor.email AS actor_email
    FROM public.branch_catalog_product_events AS event
    JOIN public.app_users AS actor ON actor.id = event.actor_user_id
    WHERE event.organization_id = v_organization_id
      AND event.branch_id = p_branch_id
      AND event.product_id = p.id
    ORDER BY event.sequence DESC
    LIMIT 1
  ) AS latest ON true
  ORDER BY p.name, p.id;
END;
$$;

CREATE FUNCTION public.set_branch_catalog_product_enabled(
  p_branch_id uuid,
  p_product_id uuid,
  p_enabled boolean,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_status text;
  v_product_name text;
  v_previous_enabled boolean;
BEGIN
  IF p_enabled IS NULL THEN
    RETURN 'INVALID_ENABLED_STATE';
  END IF;

  SELECT o.id INTO v_organization_id
  FROM public.organizations AS o
  JOIN public.app_users AS owner
    ON owner.id = o.owner_user_id AND owner.is_active = true
  WHERE o.installation_slot = 1
    AND o.owner_user_id = p_actor_user_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  SELECT b.status INTO v_branch_status
  FROM public.branches AS b
  WHERE b.organization_id = v_organization_id AND b.id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;

  IF v_branch_status <> 'active' THEN
    RETURN 'BRANCH_NOT_ACTIVE';
  END IF;

  SELECT p.name INTO v_product_name
  FROM public.products AS p
  WHERE p.id = p_product_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM public.branch_catalog_product_exclusions AS exclusion
    WHERE exclusion.organization_id = v_organization_id
      AND exclusion.branch_id = p_branch_id
      AND exclusion.product_id = p_product_id
  ) INTO v_previous_enabled;

  IF v_previous_enabled = p_enabled THEN
    RETURN 'UNCHANGED';
  END IF;

  IF p_enabled THEN
    DELETE FROM public.branch_catalog_product_exclusions
    WHERE organization_id = v_organization_id
      AND branch_id = p_branch_id
      AND product_id = p_product_id;
  ELSE
    INSERT INTO public.branch_catalog_product_exclusions (
      organization_id, branch_id, product_id, excluded_by_user_id
    )
    VALUES (v_organization_id, p_branch_id, p_product_id, p_actor_user_id);
  END IF;

  INSERT INTO public.branch_catalog_product_events (
    organization_id, branch_id, product_id, product_name,
    previous_enabled, new_enabled, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, p_product_id, v_product_name,
    v_previous_enabled, p_enabled, p_actor_user_id
  );

  RETURN 'CHANGED';
END;
$$;

CREATE FUNCTION public.prevent_order_item_for_excluded_branch_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_id uuid;
BEGIN
  SELECT o.organization_id, o.branch_id
  INTO v_organization_id, v_branch_id
  FROM public.orders AS o
  JOIN public.branches AS branch
    ON branch.organization_id = o.organization_id
   AND branch.id = o.branch_id
  WHERE o.id = NEW.order_id
  FOR KEY SHARE OF branch;

  IF NOT FOUND OR v_organization_id IS NULL OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'New order items require explicit branch context'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.branch_catalog_product_exclusions AS exclusion
    WHERE exclusion.organization_id = v_organization_id
      AND exclusion.branch_id = v_branch_id
      AND exclusion.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_ENABLED_FOR_BRANCH'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.list_branch_catalog_products(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_branch_catalog_product_enabled(uuid, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_order_item_for_excluded_branch_product() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_branch_catalog_products(uuid, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.set_branch_catalog_product_enabled(uuid, uuid, boolean, uuid) TO restaurant_pos_app;

CREATE TRIGGER order_items_require_branch_catalog_product
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_item_for_excluded_branch_product();
