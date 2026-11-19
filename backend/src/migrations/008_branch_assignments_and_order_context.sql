CREATE TABLE public.branch_user_assignments (
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  assigned_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_user_assignments_pk PRIMARY KEY (organization_id, branch_id, user_id),
  CONSTRAINT branch_user_assignments_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX branch_user_assignments_user_idx
  ON public.branch_user_assignments(user_id, organization_id, branch_id);

REVOKE ALL ON TABLE public.branch_user_assignments FROM PUBLIC;
REVOKE ALL ON TABLE public.branch_user_assignments FROM restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_user_assignments TO restaurant_pos_app;

CREATE FUNCTION public.assign_user_to_branch(
  p_branch_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.branches AS b
    WHERE b.id = p_branch_id AND b.organization_id = v_organization_id
  ) THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.app_users AS u
    WHERE u.id = p_user_id AND u.is_active = true
  ) THEN
    RETURN 'USER_NOT_FOUND';
  END IF;

  INSERT INTO public.branch_user_assignments (
    organization_id, branch_id, user_id, assigned_by_user_id
  )
  VALUES (v_organization_id, p_branch_id, p_user_id, p_actor_user_id)
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    RETURN 'ASSIGNED';
  END IF;
  RETURN 'ALREADY_ASSIGNED';
END;
$$;

CREATE FUNCTION public.remove_user_from_branch(
  p_branch_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_deleted_count integer;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.branches AS b
    WHERE b.id = p_branch_id AND b.organization_id = v_organization_id
  ) THEN
    RETURN 'BRANCH_NOT_FOUND';
  END IF;

  DELETE FROM public.branch_user_assignments
  WHERE organization_id = v_organization_id
    AND branch_id = p_branch_id
    AND user_id = p_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count = 1 THEN
    RETURN 'REMOVED';
  END IF;
  RETURN 'NOT_ASSIGNED';
END;
$$;

ALTER TABLE public.orders
  ADD COLUMN organization_id uuid,
  ADD COLUMN branch_id uuid,
  ADD COLUMN legal_entity_id uuid,
  ADD COLUMN created_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT orders_branch_legal_context_all_or_none
    CHECK (
      (organization_id IS NULL AND branch_id IS NULL AND legal_entity_id IS NULL AND created_by_user_id IS NULL)
      OR
      (organization_id IS NOT NULL AND branch_id IS NOT NULL AND legal_entity_id IS NOT NULL AND created_by_user_id IS NOT NULL)
    ),
  ADD CONSTRAINT orders_branch_legal_entity_fk
    FOREIGN KEY (organization_id, branch_id, legal_entity_id)
    REFERENCES public.branch_legal_entities(organization_id, branch_id, legal_entity_id)
    ON DELETE RESTRICT;

CREATE INDEX orders_branch_created_at_idx
  ON public.orders(branch_id, created_at DESC);

COMMENT ON COLUMN public.orders.branch_id IS
  'Sucursal operativa atribuida al crear el pedido. Permanece NULL en pedidos históricos anteriores a la activación del contexto multisucursal.';
COMMENT ON COLUMN public.orders.legal_entity_id IS
  'Entidad legal elegida explícitamente para la operación. Permanece NULL en pedidos históricos y no se completa retroactivamente.';
COMMENT ON COLUMN public.orders.created_by_user_id IS
  'Usuario autenticado que registró el pedido con su contexto operativo.';

CREATE FUNCTION public.prevent_order_context_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'Order operational and legal context is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_context_immutable
  BEFORE UPDATE OF organization_id, branch_id, legal_entity_id, created_by_user_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_context_reassignment();

REVOKE EXECUTE ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text)
  FROM PUBLIC, restaurant_pos_app;

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

  SELECT b.organization_id INTO v_organization_id
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
    AND assignment.user_id = p_actor_user_id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id;

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

  INSERT INTO public.order_items (order_id, product_id, quantity, price_at_order)
  SELECT v_order_id, p.id, i.quantity, round(p.price * (100 - p.discount_percentage) / 100, 2)
  FROM jsonb_to_recordset(p_items) AS i(id uuid, quantity integer)
  JOIN public.products p ON p.id = i.id;

  IF p_order_type = 'A domicilio' THEN
    INSERT INTO public.delivery_info (order_id, address, phone, delivery_fee)
    VALUES (v_order_id, trim(p_delivery_address), trim(p_delivery_phone), v_delivery_fee);
  END IF;
  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_user_to_branch(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_user_from_branch(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text, uuid, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_user_to_branch(uuid, uuid, uuid)
  TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.remove_user_from_branch(uuid, uuid, uuid)
  TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text, uuid, uuid, uuid)
  TO restaurant_pos_app;

REVOKE EXECUTE ON FUNCTION public.assign_delivery_driver(uuid, text, text, integer)
  FROM PUBLIC, restaurant_pos_app;

CREATE FUNCTION public.assign_delivery_driver(
  p_order_id uuid,
  p_driver_name text,
  p_driver_phone text,
  p_estimated_time integer,
  p_branch_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_delivery public.delivery_info;
BEGIN
  IF p_driver_name IS NULL OR char_length(btrim(p_driver_name)) = 0
     OR char_length(btrim(p_driver_name)) > 120
     OR (p_estimated_time IS NOT NULL AND p_estimated_time NOT BETWEEN 1 AND 1440)
     OR p_branch_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Invalid delivery assignment';
  END IF;

  UPDATE public.delivery_info AS d
  SET driver_name = btrim(p_driver_name),
      driver_phone = NULLIF(btrim(p_driver_phone), ''),
      estimated_time = p_estimated_time,
      status = 'assigned',
      updated_at = now()
  FROM public.orders AS o
  WHERE d.order_id = p_order_id
    AND o.id = d.order_id
    AND o.branch_id = p_branch_id
    AND EXISTS (
      SELECT 1
      FROM public.branch_user_assignments AS assignment
      JOIN public.app_users AS actor
        ON actor.id = assignment.user_id
        AND actor.is_active = true
      WHERE assignment.organization_id = o.organization_id
        AND assignment.branch_id = o.branch_id
        AND assignment.user_id = p_actor_user_id
    )
  RETURNING d.* INTO v_delivery;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found in active branch or user is not assigned'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders
  SET status = 'preparing', updated_at = now()
  WHERE id = p_order_id AND branch_id = p_branch_id;

  RETURN to_jsonb(v_delivery);
END;
$;

REVOKE ALL ON FUNCTION public.assign_delivery_driver(uuid, text, text, integer, uuid, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_delivery_driver(uuid, text, text, integer, uuid, uuid)
  TO restaurant_pos_app;
