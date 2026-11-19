CREATE TABLE public.product_option_groups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('presentation', 'modifier')),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  min_selections smallint NOT NULL,
  max_selections smallint NOT NULL,
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 999),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_option_groups_cardinality CHECK (
    min_selections >= 0 AND max_selections BETWEEN 1 AND 10
    AND min_selections <= max_selections
    AND (
      (kind = 'presentation' AND min_selections = 1 AND max_selections = 1)
      OR
      (kind = 'modifier' AND min_selections <= 10)
    )
  )
);

CREATE UNIQUE INDEX product_option_groups_product_name_unique
  ON public.product_option_groups (organization_id, product_id, lower(name));
CREATE UNIQUE INDEX product_option_groups_single_presentation
  ON public.product_option_groups (product_id)
  WHERE kind = 'presentation';
CREATE INDEX product_option_groups_product_order_idx
  ON public.product_option_groups (organization_id, product_id, is_active, position, id);

COMMENT ON TABLE public.product_option_groups IS
  'Configuration corporativa de selecciones del producto. presentation requiere exactamente una opción; modifier aplica su cardinalidad declarada.';

CREATE TABLE public.product_options (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id uuid NOT NULL REFERENCES public.product_option_groups(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  position integer NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 999),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_options_group_name_unique
  ON public.product_options (group_id, lower(name));
CREATE INDEX product_options_group_order_idx
  ON public.product_options (group_id, is_active, position, id);

COMMENT ON TABLE public.product_options IS
  'Opciones estables de una presentación o grupo de modificadores. Su nombre se copia al snapshot de cada línea de pedido.';

CREATE TABLE public.product_option_change_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (resource_type IN ('group', 'option')),
  resource_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'activated', 'deactivated')),
  snapshot jsonb NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_option_change_events_history_idx
  ON public.product_option_change_events (organization_id, product_id, sequence DESC);

CREATE TABLE public.branch_product_option_overrides (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE RESTRICT,
  is_enabled boolean NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  changed_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_product_option_overrides_pk PRIMARY KEY (organization_id, branch_id, option_id),
  CONSTRAINT branch_product_option_overrides_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX branch_product_option_overrides_option_idx
  ON public.branch_product_option_overrides (option_id, branch_id);

COMMENT ON TABLE public.branch_product_option_overrides IS
  'Excepción de disponibilidad de una opción por sucursal. La ausencia de fila hereda la disponibilidad corporativa; true habilita explícitamente y false restringe.';

CREATE TABLE public.branch_product_option_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  option_id uuid NOT NULL REFERENCES public.product_options(id) ON DELETE RESTRICT,
  option_name text NOT NULL,
  group_name text NOT NULL,
  previous_state text NOT NULL CHECK (previous_state IN ('inherited', 'enabled', 'disabled')),
  new_state text NOT NULL CHECK (new_state IN ('inherited', 'enabled', 'disabled')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_product_option_events_state_change CHECK (previous_state <> new_state),
  CONSTRAINT branch_product_option_events_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX branch_product_option_events_history_idx
  ON public.branch_product_option_events (organization_id, branch_id, product_id, sequence DESC);

ALTER TABLE public.order_items
  ADD COLUMN selected_option_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN variant_selection_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT order_items_selected_option_ids_limit
    CHECK (cardinality(selected_option_ids) <= 40 AND array_position(selected_option_ids, NULL) IS NULL),
  ADD CONSTRAINT order_items_variant_snapshot_array
    CHECK (jsonb_typeof(variant_selection_snapshot) = 'array');

COMMENT ON COLUMN public.order_items.selected_option_ids IS
  'Identidades corporativas de las opciones seleccionadas al crear la línea; son inmutables.';
COMMENT ON COLUMN public.order_items.variant_selection_snapshot IS
  'Snapshot inmutable con nombres, grupos y tipos seleccionados en el momento de crear el pedido.';

CREATE FUNCTION public.prevent_product_option_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Product option events are append-only'
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_product_option_event_mutation() FROM PUBLIC;

CREATE TRIGGER product_option_change_events_append_only
  BEFORE UPDATE OR DELETE ON public.product_option_change_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_product_option_event_mutation();

CREATE TRIGGER branch_product_option_events_append_only
  BEFORE UPDATE OR DELETE ON public.branch_product_option_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_product_option_event_mutation();

CREATE FUNCTION public.validate_product_option_group_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organizations AS organization
    JOIN public.products AS product ON product.id = NEW.product_id AND product.is_active = true
    LEFT JOIN public.categories AS category ON category.id = product.category_id
    WHERE organization.id = NEW.organization_id
      AND organization.installation_slot = 1
      AND coalesce(category.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'PRODUCT_OPTION_PRODUCT_NOT_ACTIVE_OR_ORGANIZATION_INVALID'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_option_group_scope() FROM PUBLIC;

CREATE TRIGGER product_option_groups_validate_scope
  BEFORE INSERT OR UPDATE OF organization_id, product_id
  ON public.product_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_option_group_scope();
CREATE FUNCTION public.validate_product_option_group_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $group$
DECLARE
  v_active_options integer;
  v_branch record;
  v_branch_options integer;
BEGIN
  IF NEW.is_active THEN
    SELECT count(*)::integer INTO v_active_options
    FROM public.product_options AS option
    WHERE option.group_id = NEW.id AND option.is_active = true;
    IF v_active_options < NEW.min_selections THEN
      RAISE EXCEPTION 'PRODUCT_OPTION_MINIMUM_REQUIRED'
        USING ERRCODE = '23514';
    END IF;

    FOR v_branch IN
      SELECT branch.organization_id, branch.id AS branch_id
      FROM public.branches AS branch
      WHERE branch.organization_id = NEW.organization_id
        AND branch.status <> 'closed'
        AND NOT EXISTS (
          SELECT 1 FROM public.branch_catalog_product_exclusions AS excluded
          WHERE excluded.organization_id = branch.organization_id
            AND excluded.branch_id = branch.id
            AND excluded.product_id = NEW.product_id
        )
    LOOP
      SELECT count(*)::integer INTO v_branch_options
      FROM public.product_options AS option
      LEFT JOIN public.branch_product_option_overrides AS override
        ON override.organization_id = v_branch.organization_id
       AND override.branch_id = v_branch.branch_id
       AND override.option_id = option.id
      WHERE option.group_id = NEW.id
        AND option.is_active = true
        AND coalesce(override.is_enabled, true) = true;
      IF v_branch_options < NEW.min_selections THEN
        RAISE EXCEPTION 'PRODUCT_OPTION_BRANCH_MINIMUM_REQUIRED'
          USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$group$;
REVOKE ALL ON FUNCTION public.validate_product_option_group_activation() FROM PUBLIC;

CREATE TRIGGER product_option_groups_preserve_minimum
  BEFORE INSERT OR UPDATE OF is_active, min_selections, max_selections, kind
  ON public.product_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_option_group_activation();


CREATE FUNCTION public.validate_product_option_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_option_groups AS option_group
    JOIN public.products AS product ON product.id = option_group.product_id AND product.is_active = true
    WHERE option_group.id = NEW.group_id
  ) THEN
    RAISE EXCEPTION 'PRODUCT_OPTION_GROUP_NOT_FOUND_OR_PRODUCT_INACTIVE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_option_scope() FROM PUBLIC;

CREATE TRIGGER product_options_validate_scope
  BEFORE INSERT OR UPDATE OF group_id
  ON public.product_options
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_option_scope();
CREATE FUNCTION public.validate_branch_product_option_reenable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reenable$
DECLARE
  v_group record;
  v_available integer;
BEGIN
  FOR v_group IN
    SELECT option_group.id, option_group.min_selections
    FROM public.product_option_groups AS option_group
    WHERE option_group.organization_id = OLD.organization_id
      AND option_group.product_id = OLD.product_id
      AND option_group.is_active = true
    ORDER BY option_group.id
    FOR SHARE
  LOOP
    SELECT count(*)::integer INTO v_available
    FROM public.product_options AS option
    LEFT JOIN public.branch_product_option_overrides AS override
      ON override.organization_id = OLD.organization_id
     AND override.branch_id = OLD.branch_id
     AND override.option_id = option.id
    WHERE option.group_id = v_group.id
      AND option.is_active = true
      AND coalesce(override.is_enabled, true) = true;

    IF v_available < v_group.min_selections THEN
      RAISE EXCEPTION 'BRANCH_PRODUCT_OPTION_MINIMUM_REQUIRED'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN OLD;
END;
$reenable$;
REVOKE ALL ON FUNCTION public.validate_branch_product_option_reenable() FROM PUBLIC;

CREATE TRIGGER branch_catalog_reenable_respects_product_option_minimum
  BEFORE DELETE ON public.branch_catalog_product_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_product_option_reenable();

CREATE FUNCTION public.prevent_product_option_deactivation_below_minimum()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_minimum integer;
  v_group_active boolean;
  v_branch record;
  v_available integer;
BEGIN
  IF OLD.is_active AND NOT NEW.is_active THEN
    SELECT option_group.min_selections, option_group.is_active
    INTO v_minimum, v_group_active
    FROM public.product_option_groups AS option_group
    WHERE option_group.id = OLD.group_id
    FOR UPDATE;

    IF v_group_active AND (
      SELECT count(*) FROM public.product_options AS option
      WHERE option.group_id = OLD.group_id
        AND option.is_active = true
        AND option.id <> OLD.id
    ) < v_minimum THEN
      RAISE EXCEPTION 'PRODUCT_OPTION_REQUIRED_BY_GROUP'
        USING ERRCODE = '23514';
    END IF;

    IF v_group_active THEN
      FOR v_branch IN
        SELECT branch.organization_id, branch.id AS branch_id
        FROM public.branches AS branch
        JOIN public.products AS product
          ON product.id = (SELECT product_id FROM public.product_option_groups WHERE id = OLD.group_id)
        WHERE branch.organization_id = (
          SELECT organization_id FROM public.product_option_groups WHERE id = OLD.group_id
        )
          AND branch.status <> 'closed'
          AND NOT EXISTS (
            SELECT 1 FROM public.branch_catalog_product_exclusions AS excluded
            WHERE excluded.organization_id = branch.organization_id
              AND excluded.branch_id = branch.id
              AND excluded.product_id = (
                SELECT product_id FROM public.product_option_groups WHERE id = OLD.group_id
              )
          )
          AND EXISTS (
            SELECT 1 FROM public.branch_product_option_overrides AS override
            JOIN public.product_options AS option ON option.id = override.option_id
            WHERE override.organization_id = branch.organization_id
              AND override.branch_id = branch.id
              AND option.group_id = OLD.group_id
          )
      LOOP
        SELECT count(*) INTO v_available
        FROM public.product_options AS option
        LEFT JOIN public.branch_product_option_overrides AS override
          ON override.organization_id = v_branch.organization_id
         AND override.branch_id = v_branch.branch_id
         AND override.option_id = option.id
        WHERE option.group_id = OLD.group_id
          AND option.is_active = true
          AND option.id <> OLD.id
          AND coalesce(override.is_enabled, true) = true;

        IF v_available < v_minimum THEN
          RAISE EXCEPTION 'PRODUCT_OPTION_REQUIRED_BY_BRANCH_EXCEPTION'
            USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_product_option_deactivation_below_minimum() FROM PUBLIC;

CREATE TRIGGER product_options_preserve_group_minimum
  BEFORE UPDATE OF is_active ON public.product_options
  FOR EACH ROW EXECUTE FUNCTION public.prevent_product_option_deactivation_below_minimum();

CREATE FUNCTION public.validate_branch_product_option_override()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_group_id uuid;
  v_minimum integer;
  v_branch_status text;
  v_available integer;
BEGIN
  SELECT branch.status, option_group.id, option_group.min_selections
  INTO v_branch_status, v_group_id, v_minimum
  FROM public.branches AS branch
  JOIN public.product_option_groups AS option_group
    ON option_group.organization_id = branch.organization_id
  JOIN public.product_options AS option ON option.group_id = option_group.id
  JOIN public.products AS product ON product.id = option_group.product_id AND product.is_active = true
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  WHERE branch.organization_id = NEW.organization_id
    AND branch.id = NEW.branch_id
    AND option.id = NEW.option_id
    AND option_group.is_active = true
    AND option.is_active = true
    AND coalesce(category.is_active, true) = true
  FOR UPDATE OF branch, option_group;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_OPTION_SCOPE_OR_ACTIVE_STATE_INVALID'
      USING ERRCODE = '23514';
  END IF;
  IF v_branch_status <> 'active' THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE'
      USING ERRCODE = '55000';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.branch_catalog_product_exclusions AS exclusion
    WHERE exclusion.organization_id = NEW.organization_id
      AND exclusion.branch_id = NEW.branch_id
      AND exclusion.product_id = (
        SELECT product_id FROM public.product_option_groups WHERE id = v_group_id
      )
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_ENABLED_FOR_BRANCH'
      USING ERRCODE = '55000';
  END IF;

  IF NOT NEW.is_enabled THEN
    SELECT count(*) INTO v_available
    FROM public.product_options AS option
    LEFT JOIN public.branch_product_option_overrides AS override
      ON override.organization_id = NEW.organization_id
     AND override.branch_id = NEW.branch_id
     AND override.option_id = option.id
    WHERE option.group_id = v_group_id
      AND option.is_active = true
      AND option.id <> NEW.option_id
      AND coalesce(override.is_enabled, true) = true;

    IF v_available < v_minimum THEN
      RAISE EXCEPTION 'BRANCH_OPTION_WOULD_VIOLATE_GROUP_MINIMUM'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_branch_product_option_override() FROM PUBLIC;

CREATE TRIGGER branch_product_option_overrides_validate
  BEFORE INSERT OR UPDATE OF organization_id, branch_id, option_id, is_enabled
  ON public.branch_product_option_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_branch_product_option_override();

CREATE FUNCTION public.snapshot_and_validate_order_item_options()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_id uuid;
  v_selected_count integer;
  v_group record;
  v_group_selected integer;
BEGIN
  SELECT orders.organization_id, orders.branch_id
  INTO v_organization_id, v_branch_id
  FROM public.orders
  WHERE orders.id = NEW.order_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_organization_id IS NULL OR v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Order item requires explicit branch context'
      USING ERRCODE = '23514';
  END IF;
  PERFORM 1
  FROM public.branches AS branch
  WHERE branch.id = v_branch_id AND branch.organization_id = v_organization_id
    AND branch.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BRANCH_NOT_ACTIVE' USING ERRCODE = '55000';
  END IF;

  PERFORM 1
  FROM public.products AS product
  WHERE product.id = NEW.product_id AND product.is_active = true
    AND (product.category_id IS NULL OR EXISTS (
      SELECT 1 FROM public.categories AS category
      WHERE category.id = product.category_id AND category.is_active = true
    ))
    AND NOT EXISTS (
      SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
      WHERE exclusion.organization_id = v_organization_id
        AND exclusion.branch_id = v_branch_id AND exclusion.product_id = product.id
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_ACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH' USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.product_option_groups AS option_group
  WHERE option_group.organization_id = v_organization_id
    AND option_group.product_id = NEW.product_id
  ORDER BY option_group.id
  FOR SHARE;

  PERFORM 1
  FROM public.product_options AS option
  JOIN public.product_option_groups AS option_group ON option_group.id = option.group_id
  WHERE option_group.organization_id = v_organization_id
    AND option_group.product_id = NEW.product_id
  ORDER BY option_group.id, option.id
  FOR SHARE OF option, option_group;
  IF cardinality(NEW.selected_option_ids) > 40
     OR array_position(NEW.selected_option_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid product option selection'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT selected.option_id)::integer
  INTO v_selected_count
  FROM unnest(NEW.selected_option_ids) AS selected(option_id);

  IF v_selected_count <> cardinality(NEW.selected_option_ids) THEN
    RAISE EXCEPTION 'Duplicate product option selection'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
  INTO v_selected_count
  FROM unnest(NEW.selected_option_ids) AS selected(option_id)
  JOIN public.product_options AS option ON option.id = selected.option_id AND option.is_active = true
  JOIN public.product_option_groups AS option_group
    ON option_group.id = option.group_id
   AND option_group.product_id = NEW.product_id
   AND option_group.organization_id = v_organization_id
   AND option_group.is_active = true
  LEFT JOIN public.branch_product_option_overrides AS override
    ON override.organization_id = v_organization_id
   AND override.branch_id = v_branch_id
   AND override.option_id = option.id
  WHERE coalesce(override.is_enabled, true) = true;

  IF v_selected_count <> cardinality(NEW.selected_option_ids) THEN
    RAISE EXCEPTION 'PRODUCT_OPTION_INVALID_INACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH'
      USING ERRCODE = '23514';
  END IF;

  FOR v_group IN
    SELECT option_group.id, option_group.min_selections, option_group.max_selections
    FROM public.product_option_groups AS option_group
    WHERE option_group.organization_id = v_organization_id
      AND option_group.product_id = NEW.product_id
      AND option_group.is_active = true
    FOR KEY SHARE
  LOOP
    SELECT count(*)::integer
    INTO v_group_selected
    FROM unnest(NEW.selected_option_ids) AS selected(option_id)
    JOIN public.product_options AS option
      ON option.id = selected.option_id
     AND option.group_id = v_group.id
     AND option.is_active = true
    LEFT JOIN public.branch_product_option_overrides AS override
      ON override.organization_id = v_organization_id
     AND override.branch_id = v_branch_id
     AND override.option_id = option.id
    WHERE coalesce(override.is_enabled, true) = true;

    IF v_group_selected < v_group.min_selections
       OR v_group_selected > v_group.max_selections THEN
      RAISE EXCEPTION 'PRODUCT_OPTION_GROUP_CARDINALITY_INVALID'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'option_id', option.id,
    'group_id', option_group.id,
    'group_name', option_group.name,
    'group_kind', option_group.kind,
    'name', option.name,
    'group_position', option_group.position,
    'position', option.position
  ) ORDER BY option_group.position, option_group.name, option.position, option.name), '[]'::jsonb)
  INTO NEW.variant_selection_snapshot
  FROM unnest(NEW.selected_option_ids) AS selected(option_id)
  JOIN public.product_options AS option ON option.id = selected.option_id
  JOIN public.product_option_groups AS option_group ON option_group.id = option.group_id;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_and_validate_order_item_options() FROM PUBLIC;

CREATE TRIGGER order_items_snapshot_product_options
  BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_and_validate_order_item_options();

CREATE FUNCTION public.prevent_order_item_option_snapshot_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.selected_option_ids IS DISTINCT FROM OLD.selected_option_ids
     OR NEW.variant_selection_snapshot IS DISTINCT FROM OLD.variant_selection_snapshot THEN
    RAISE EXCEPTION 'Order item option snapshots are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_order_item_option_snapshot_rewrite() FROM PUBLIC;

CREATE TRIGGER order_items_options_immutable
  BEFORE UPDATE OF selected_option_ids, variant_selection_snapshot
  ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_order_item_option_snapshot_rewrite();

REVOKE ALL ON TABLE public.product_option_groups, public.product_options,
  public.product_option_change_events, public.branch_product_option_overrides,
  public.branch_product_option_events FROM PUBLIC;
CREATE FUNCTION public.set_branch_product_option_availability(
  p_branch_id uuid,
  p_option_id uuid,
  p_enabled boolean,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid;
  v_branch_status text;
  v_option_id uuid;
  v_option_name text;
  v_group_name text;
  v_product_id uuid;
  v_previous_enabled boolean;
  v_previous_state text;
  v_new_state text;
BEGIN
  IF p_enabled IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid branch product option override'
      USING ERRCODE = '22023';
  END IF;

  SELECT organization.id INTO v_organization_id
  FROM public.organizations AS organization
  JOIN public.app_users AS owner
    ON owner.id = organization.owner_user_id AND owner.is_active = true
  WHERE organization.installation_slot = 1
    AND organization.owner_user_id = p_actor_user_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  SELECT branch.status, option.id, option.name,
         option_group.name, option_group.product_id
  INTO v_branch_status, v_option_id, v_option_name, v_group_name, v_product_id
  FROM public.branches AS branch
  JOIN public.product_option_groups AS option_group
    ON option_group.organization_id = branch.organization_id
  JOIN public.product_options AS option ON option.group_id = option_group.id
  JOIN public.products AS product ON product.id = option_group.product_id AND product.is_active = true
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  WHERE branch.organization_id = v_organization_id
    AND branch.id = p_branch_id
    AND option.id = p_option_id
    AND option_group.is_active = true
    AND option.is_active = true
    AND coalesce(category.is_active, true) = true
  FOR UPDATE OF branch, option_group, option;

  IF v_option_id IS NULL THEN
    RETURN 'OPTION_NOT_ACTIVE';
  END IF;
  IF v_branch_status <> 'active' THEN
    RETURN 'BRANCH_NOT_ACTIVE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.branch_catalog_product_exclusions AS exclusion
    WHERE exclusion.organization_id = v_organization_id
      AND exclusion.branch_id = p_branch_id
      AND exclusion.product_id = v_product_id
  ) THEN
    RETURN 'PRODUCT_NOT_ENABLED_FOR_BRANCH';
  END IF;

  SELECT override.is_enabled INTO v_previous_enabled
  FROM public.branch_product_option_overrides AS override
  WHERE override.organization_id = v_organization_id
    AND override.branch_id = p_branch_id
    AND override.option_id = p_option_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_previous_state := 'inherited';
  ELSE
    v_previous_state := CASE WHEN v_previous_enabled THEN 'enabled' ELSE 'disabled' END;
  END IF;
  v_new_state := CASE WHEN p_enabled THEN 'enabled' ELSE 'disabled' END;
  IF v_previous_state = v_new_state THEN
    RETURN 'UNCHANGED';
  END IF;

  INSERT INTO public.branch_product_option_overrides (
    organization_id, branch_id, option_id, is_enabled, reason, changed_by_user_id
  )
  VALUES (v_organization_id, p_branch_id, p_option_id, p_enabled, btrim(p_reason), p_actor_user_id)
  ON CONFLICT (organization_id, branch_id, option_id)
  DO UPDATE SET is_enabled = EXCLUDED.is_enabled, reason = EXCLUDED.reason,
                changed_by_user_id = EXCLUDED.changed_by_user_id, updated_at = now();

  INSERT INTO public.branch_product_option_events (
    organization_id, branch_id, product_id, option_id, option_name, group_name,
    previous_state, new_state, reason, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, v_product_id, p_option_id,
    v_option_name, v_group_name, v_previous_state,
    v_new_state, btrim(p_reason), p_actor_user_id
  );
  RETURN 'CHANGED';
END;
$function$;

CREATE FUNCTION public.clear_branch_product_option_override(
  p_branch_id uuid,
  p_option_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_organization_id uuid;
  v_branch_status text;
  v_option_id uuid;
  v_option_name text;
  v_group_name text;
  v_product_id uuid;
  v_previous_enabled boolean;
  v_previous_state text;
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid branch product option override reason'
      USING ERRCODE = '22023';
  END IF;
  SELECT organization.id INTO v_organization_id
  FROM public.organizations AS organization
  JOIN public.app_users AS owner
    ON owner.id = organization.owner_user_id AND owner.is_active = true
  WHERE organization.installation_slot = 1
    AND organization.owner_user_id = p_actor_user_id;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active organization owner required'
      USING ERRCODE = '42501';
  END IF;

  SELECT branch.status, option.id, option.name,
         option_group.name, option_group.product_id
  INTO v_branch_status, v_option_id, v_option_name, v_group_name, v_product_id
  FROM public.branches AS branch
  JOIN public.product_option_groups AS option_group
    ON option_group.organization_id = branch.organization_id
  JOIN public.product_options AS option ON option.group_id = option_group.id
  WHERE branch.organization_id = v_organization_id
    AND branch.id = p_branch_id AND option.id = p_option_id
  FOR UPDATE OF branch, option_group, option;
  IF v_option_id IS NULL THEN
    RETURN 'OPTION_NOT_FOUND';
  END IF;
  IF v_branch_status <> 'active' THEN
    RETURN 'BRANCH_NOT_ACTIVE';
  END IF;

  SELECT override.is_enabled INTO v_previous_enabled
  FROM public.branch_product_option_overrides AS override
  WHERE override.organization_id = v_organization_id
    AND override.branch_id = p_branch_id
    AND override.option_id = p_option_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'UNCHANGED';
  END IF;
  v_previous_state := CASE WHEN v_previous_enabled THEN 'enabled' ELSE 'disabled' END;

  DELETE FROM public.branch_product_option_overrides
  WHERE organization_id = v_organization_id
    AND branch_id = p_branch_id AND option_id = p_option_id;
  INSERT INTO public.branch_product_option_events (
    organization_id, branch_id, product_id, option_id, option_name, group_name,
    previous_state, new_state, reason, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, v_product_id, p_option_id,
    v_option_name, v_group_name, v_previous_state,
    'inherited', btrim(p_reason), p_actor_user_id
  );
  RETURN 'CHANGED';
END;
$function$;

REVOKE ALL ON FUNCTION public.set_branch_product_option_availability(uuid, uuid, boolean, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_branch_product_option_override(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_product_option_availability(uuid, uuid, boolean, text, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.clear_branch_product_option_override(uuid, uuid, text, uuid) TO restaurant_pos_app;

GRANT SELECT, INSERT, UPDATE ON TABLE public.product_option_groups TO restaurant_pos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.product_options TO restaurant_pos_app;
GRANT SELECT, INSERT ON TABLE public.product_option_change_events TO restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_product_option_overrides, public.branch_product_option_events TO restaurant_pos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.order_items TO restaurant_pos_app;

CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_table_number text,
  p_customer_name text,
  p_order_type text,
  p_items jsonb,
  p_delivery_address text,
  p_delivery_phone text,
  p_branch_id uuid,
  p_legal_entity_id uuid,
  p_actor_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_order_id uuid;
  v_organization_id uuid;
  v_item_count integer;
  v_valid_item_count integer;
  v_subtotal numeric(10, 2);
  v_tax_rate numeric(8, 6) := 0;
  v_tax numeric(10, 2);
  v_delivery_fee numeric(10, 2) := 0;
BEGIN
  IF p_order_type NOT IN ('Comer aquí', 'Para llevar', 'A domicilio') THEN
    RAISE EXCEPTION 'Invalid order type';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid order items';
  END IF;
  IF p_branch_id IS NULL OR p_legal_entity_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Active branch, legal entity and actor are required'
      USING ERRCODE = '23514';
  END IF;
  IF p_order_type = 'A domicilio'
     AND (NULLIF(trim(p_delivery_address), '') IS NULL OR NULLIF(trim(p_delivery_phone), '') IS NULL) THEN
    RAISE EXCEPTION 'Delivery details are required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS items(item)
    WHERE jsonb_typeof(coalesce(item->'option_ids', '[]'::jsonb)) <> 'array'
  ) THEN
    RAISE EXCEPTION 'Invalid product option selection payload'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS items(item)
    WHERE jsonb_array_length(coalesce(item->'option_ids', '[]'::jsonb)) > 40
  ) THEN
    RAISE EXCEPTION 'Too many product options selected'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS items(item)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(item->'option_ids', '[]'::jsonb)) AS selected(value)
    WHERE jsonb_typeof(selected.value) <> 'string'
  ) THEN
    RAISE EXCEPTION 'Invalid product option identifier'
      USING ERRCODE = '23514';
  END IF;

  SELECT b.organization_id INTO v_organization_id
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
    AND assignment.user_id = p_actor_user_id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id
  FOR KEY SHARE OF assignment;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User is not assigned to the active branch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branch_legal_entities AS association
    WHERE association.organization_id = v_organization_id
      AND association.branch_id = p_branch_id
      AND association.legal_entity_id = p_legal_entity_id
  ) THEN
    RAISE EXCEPTION 'Legal entity is not associated with the active branch'
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_item_count FROM jsonb_array_elements(p_items);
  SELECT count(*), coalesce(sum(round(p.price * (100 - p.discount_percentage) / 100, 2) * i.quantity), 0)
    INTO v_valid_item_count, v_subtotal
  FROM jsonb_to_recordset(p_items) AS i(id uuid, quantity integer)
  JOIN public.products p ON p.id = i.id
  WHERE i.quantity BETWEEN 1 AND 50;

  IF v_item_count <> v_valid_item_count THEN
    RAISE EXCEPTION 'One or more order items are invalid';
  END IF;

  IF p_order_type = 'A domicilio' THEN
    SELECT coalesce(value::numeric, 0) INTO v_delivery_fee
    FROM public.settings WHERE key = 'delivery_fee';
    v_delivery_fee := coalesce(v_delivery_fee, 0);
  END IF;

  SELECT coalesce(value::numeric, 0) INTO v_tax_rate
  FROM public.settings WHERE key = 'tax_rate';
  v_tax_rate := coalesce(v_tax_rate, 0);
  IF v_tax_rate < 0 OR v_tax_rate > 1 THEN
    RAISE EXCEPTION 'Invalid tax configuration';
  END IF;
  v_tax := round(v_subtotal * v_tax_rate, 2);

  INSERT INTO public.orders (
    table_number, customer_name, order_type, total_amount, status,
    organization_id, branch_id, legal_entity_id, created_by_user_id
  )
  VALUES (
    left(trim(p_table_number), 30),
    NULLIF(trim(p_customer_name), ''),
    p_order_type,
    v_subtotal + v_tax + v_delivery_fee,
    'pending',
    v_organization_id,
    p_branch_id,
    p_legal_entity_id,
    p_actor_user_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, quantity, price_at_order, selected_option_ids
  )
  SELECT
    v_order_id,
    p.id,
    i.quantity,
    round(p.price * (100 - p.discount_percentage) / 100, 2),
    ARRAY(
      SELECT selected.value::uuid
      FROM jsonb_array_elements_text(coalesce(i.option_ids, '[]'::jsonb)) AS selected(value)
    )
  FROM jsonb_to_recordset(p_items) AS i(id uuid, quantity integer, option_ids jsonb)
  JOIN public.products AS p ON p.id = i.id;

  IF p_order_type = 'A domicilio' THEN
    INSERT INTO public.delivery_info (order_id, address, phone, delivery_fee)
    VALUES (v_order_id, trim(p_delivery_address), trim(p_delivery_phone), v_delivery_fee);
  END IF;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text, uuid, uuid, uuid)
  FROM PUBLIC, restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text, uuid, uuid, uuid)
  TO restaurant_pos_app;
