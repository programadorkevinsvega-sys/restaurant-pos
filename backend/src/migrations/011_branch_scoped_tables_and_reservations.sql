-- Branch-scoped tables and reservations.
-- Historical rows intentionally remain unassigned (NULL scope); no branch is inferred.

ALTER TABLE public.tables
  DROP CONSTRAINT IF EXISTS tables_number_key,
  ADD COLUMN organization_id uuid,
  ADD COLUMN branch_id uuid,
  ADD COLUMN created_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD COLUMN updated_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tables_branch_context_all_or_none
    CHECK (
      (organization_id IS NULL AND branch_id IS NULL
        AND created_by_user_id IS NULL AND updated_by_user_id IS NULL)
      OR
      (organization_id IS NOT NULL AND branch_id IS NOT NULL
        AND created_by_user_id IS NOT NULL AND updated_by_user_id IS NOT NULL)
    ),
  ADD CONSTRAINT tables_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT tables_organization_branch_id_unique
    UNIQUE (organization_id, branch_id, id);

ALTER TABLE public.reservations
  ADD COLUMN organization_id uuid,
  ADD COLUMN branch_id uuid,
  ADD COLUMN created_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD COLUMN updated_by_user_id uuid REFERENCES public.app_users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT reservations_branch_context_all_or_none
    CHECK (
      (organization_id IS NULL AND branch_id IS NULL
        AND created_by_user_id IS NULL AND updated_by_user_id IS NULL)
      OR
      (organization_id IS NOT NULL AND branch_id IS NOT NULL
        AND created_by_user_id IS NOT NULL AND updated_by_user_id IS NOT NULL
        AND table_id IS NOT NULL)
    ),
  ADD CONSTRAINT reservations_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT reservations_branch_table_fk
    FOREIGN KEY (organization_id, branch_id, table_id)
    REFERENCES public.tables(organization_id, branch_id, id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX tables_branch_number_unique
  ON public.tables(branch_id, number)
  WHERE branch_id IS NOT NULL;

-- Keep legacy, unassigned table numbers unique among themselves.
CREATE UNIQUE INDEX tables_legacy_number_unique
  ON public.tables(number)
  WHERE branch_id IS NULL;

CREATE INDEX tables_branch_lookup_idx
  ON public.tables(organization_id, branch_id, number)
  WHERE branch_id IS NOT NULL;

CREATE INDEX reservations_branch_date_status_idx
  ON public.reservations(organization_id, branch_id, reservation_date, status)
  WHERE branch_id IS NOT NULL;

COMMENT ON COLUMN public.tables.branch_id IS
  'Sucursal propietaria de la mesa. NULL identifica un registro histórico sin atribución; no se infiere su sucursal.';
COMMENT ON COLUMN public.reservations.branch_id IS
  'Sucursal propietaria de la reserva. NULL identifica un registro histórico sin atribución; no se infiere su sucursal.';

-- The runtime role cannot bypass branch checks with direct table reads or writes.
REVOKE ALL ON TABLE public.tables, public.reservations FROM PUBLIC, restaurant_pos_app;

CREATE FUNCTION public.list_branch_tables(
  p_branch_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE(
  id uuid,
  number text,
  capacity integer,
  status text,
  current_order jsonb,
  branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS b
    JOIN public.branch_user_assignments AS assignment
      ON assignment.organization_id = b.organization_id
      AND assignment.branch_id = b.id
    JOIN public.app_users AS actor
      ON actor.id = assignment.user_id
      AND actor.is_active = true
    WHERE b.id = p_branch_id
      AND assignment.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.number,
    t.capacity,
    t.status,
    CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', o.id,
      'total_amount', o.total_amount,
      'status', o.status,
      'created_at', o.created_at
    ) END,
    t.branch_id
  FROM public.tables AS t
  LEFT JOIN public.orders AS o
    ON o.id = t.current_order_id
    AND o.organization_id = t.organization_id
    AND o.branch_id = t.branch_id
  WHERE t.organization_id = (
    SELECT b.organization_id FROM public.branches AS b WHERE b.id = p_branch_id
  )
    AND t.branch_id = p_branch_id
  ORDER BY t.number, t.id
  LIMIT 100;
END;
$$;

CREATE FUNCTION public.create_branch_table(
  p_branch_id uuid,
  p_number text,
  p_capacity integer,
  p_actor_user_id uuid
)
RETURNS TABLE(created_table_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_status text;
  v_table_id uuid;
BEGIN
  IF p_number IS NULL
     OR p_number <> btrim(p_number)
     OR char_length(p_number) NOT BETWEEN 1 AND 30
     OR p_capacity IS NULL
     OR p_capacity NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT NULL::uuid, 'INVALID_TABLE'::text;
    RETURN;
  END IF;

  SELECT b.organization_id, b.status
    INTO v_organization_id, v_branch_status
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id
    AND assignment.user_id = p_actor_user_id
  FOR SHARE OF b;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  IF v_branch_status <> 'active' THEN
    RETURN QUERY SELECT NULL::uuid, 'BRANCH_NOT_ACTIVE'::text;
    RETURN;
  END IF;

  INSERT INTO public.tables (
    number, capacity, organization_id, branch_id,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    p_number, p_capacity, v_organization_id, p_branch_id,
    p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_table_id;

  IF v_table_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'TABLE_NUMBER_EXISTS'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_table_id, 'CREATED'::text;
END;
$$;

CREATE FUNCTION public.update_branch_table(
  p_table_id uuid,
  p_branch_id uuid,
  p_status text,
  p_current_order_id uuid,
  p_set_current_order boolean,
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
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('available', 'occupied', 'reserved', 'maintenance') THEN
    RETURN 'INVALID_TABLE_STATUS';
  END IF;

  SELECT b.organization_id, b.status
    INTO v_organization_id, v_branch_status
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id
    AND assignment.user_id = p_actor_user_id
  FOR SHARE OF b;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  IF v_branch_status <> 'active' THEN
    RETURN 'BRANCH_NOT_ACTIVE';
  END IF;

  PERFORM 1
  FROM public.tables AS t
  WHERE t.id = p_table_id
    AND t.organization_id = v_organization_id
    AND t.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'TABLE_NOT_FOUND';
  END IF;

  IF p_set_current_order AND p_current_order_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.orders AS o
       WHERE o.id = p_current_order_id
         AND o.organization_id = v_organization_id
         AND o.branch_id = p_branch_id
     ) THEN
    RETURN 'ORDER_NOT_IN_BRANCH';
  END IF;

  UPDATE public.tables
  SET status = p_status,
      current_order_id = CASE
        WHEN p_set_current_order THEN p_current_order_id
        ELSE current_order_id
      END,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  WHERE id = p_table_id
    AND organization_id = v_organization_id
    AND branch_id = p_branch_id;

  RETURN 'UPDATED';
END;
$$;

CREATE FUNCTION public.list_branch_reservations(
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_status text
)
RETURNS TABLE(
  id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  table_id uuid,
  reservation_date timestamptz,
  party_size integer,
  notes text,
  status text,
  "table" jsonb,
  branch_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF (p_from IS NULL) <> (p_to IS NULL) OR (p_from IS NOT NULL AND p_to <= p_from) THEN
    RAISE EXCEPTION 'Invalid reservation date range'
      USING ERRCODE = '22023';
  END IF;

  IF p_status IS NOT NULL
     AND p_status NOT IN ('confirmed', 'seated', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Invalid reservation status'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches AS b
    JOIN public.branch_user_assignments AS assignment
      ON assignment.organization_id = b.organization_id
      AND assignment.branch_id = b.id
    JOIN public.app_users AS actor
      ON actor.id = assignment.user_id
      AND actor.is_active = true
    WHERE b.id = p_branch_id
      AND assignment.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.customer_name,
    r.customer_phone,
    r.customer_email,
    r.table_id,
    r.reservation_date,
    r.party_size,
    r.notes,
    r.status,
    CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', t.id, 'number', t.number, 'capacity', t.capacity
    ) END,
    r.branch_id
  FROM public.reservations AS r
  LEFT JOIN public.tables AS t
    ON t.id = r.table_id
    AND t.organization_id = r.organization_id
    AND t.branch_id = r.branch_id
  WHERE r.organization_id = (
    SELECT b.organization_id FROM public.branches AS b WHERE b.id = p_branch_id
  )
    AND r.branch_id = p_branch_id
    AND (p_from IS NULL OR (r.reservation_date >= p_from AND r.reservation_date < p_to))
    AND (p_status IS NULL OR r.status = p_status)
  ORDER BY r.reservation_date, r.id
  LIMIT 100;
END;
$$;

CREATE FUNCTION public.create_branch_reservation(
  p_branch_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_table_id uuid,
  p_reservation_date timestamptz,
  p_party_size integer,
  p_notes text,
  p_actor_user_id uuid
)
RETURNS TABLE(created_reservation_id uuid, outcome text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_branch_status text;
  v_reservation_id uuid;
BEGIN
  IF p_customer_name IS NULL
     OR p_customer_name <> btrim(p_customer_name)
     OR char_length(p_customer_name) NOT BETWEEN 1 AND 120
     OR p_table_id IS NULL
     OR p_reservation_date IS NULL
     OR p_party_size IS NULL
     OR p_party_size NOT BETWEEN 1 AND 100
     OR (p_customer_phone IS NOT NULL AND char_length(p_customer_phone) > 32)
     OR (p_customer_email IS NOT NULL AND char_length(p_customer_email) > 254)
     OR (p_notes IS NOT NULL AND char_length(p_notes) > 1000) THEN
    RETURN QUERY SELECT NULL::uuid, 'INVALID_RESERVATION'::text;
    RETURN;
  END IF;

  SELECT b.organization_id, b.status
    INTO v_organization_id, v_branch_status
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id
    AND assignment.user_id = p_actor_user_id
  FOR SHARE OF b;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  IF v_branch_status <> 'active' THEN
    RETURN QUERY SELECT NULL::uuid, 'BRANCH_NOT_ACTIVE'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tables AS t
    WHERE t.id = p_table_id
      AND t.organization_id = v_organization_id
      AND t.branch_id = p_branch_id
  ) THEN
    RETURN QUERY SELECT NULL::uuid, 'TABLE_NOT_IN_BRANCH'::text;
    RETURN;
  END IF;

  INSERT INTO public.reservations (
    customer_name, customer_phone, customer_email, table_id,
    reservation_date, party_size, notes,
    organization_id, branch_id, created_by_user_id, updated_by_user_id
  )
  VALUES (
    p_customer_name, p_customer_phone, p_customer_email, p_table_id,
    p_reservation_date, p_party_size, p_notes,
    v_organization_id, p_branch_id, p_actor_user_id, p_actor_user_id
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT v_reservation_id, 'CREATED'::text;
END;
$$;

CREATE FUNCTION public.update_branch_reservation_status(
  p_reservation_id uuid,
  p_branch_id uuid,
  p_status text,
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
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('confirmed', 'seated', 'completed', 'cancelled', 'no_show') THEN
    RETURN 'INVALID_RESERVATION_STATUS';
  END IF;

  SELECT b.organization_id, b.status
    INTO v_organization_id, v_branch_status
  FROM public.branches AS b
  JOIN public.branch_user_assignments AS assignment
    ON assignment.organization_id = b.organization_id
    AND assignment.branch_id = b.id
  JOIN public.app_users AS actor
    ON actor.id = assignment.user_id
    AND actor.is_active = true
  WHERE b.id = p_branch_id
    AND assignment.user_id = p_actor_user_id
  FOR SHARE OF b;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Active branch assignment required'
      USING ERRCODE = '42501';
  END IF;

  IF v_branch_status <> 'active' THEN
    RETURN 'BRANCH_NOT_ACTIVE';
  END IF;

  PERFORM 1
  FROM public.reservations AS r
  WHERE r.id = p_reservation_id
    AND r.organization_id = v_organization_id
    AND r.branch_id = p_branch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'RESERVATION_NOT_FOUND';
  END IF;

  UPDATE public.reservations
  SET status = p_status,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  WHERE id = p_reservation_id
    AND organization_id = v_organization_id
    AND branch_id = p_branch_id;

  RETURN 'UPDATED';
END;
$$;

REVOKE ALL ON FUNCTION public.list_branch_tables(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_branch_table(uuid, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_branch_table(uuid, uuid, text, uuid, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_branch_reservations(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_branch_reservation(uuid, text, text, text, uuid, timestamptz, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_branch_reservation_status(uuid, uuid, text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_branch_tables(uuid, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.create_branch_table(uuid, text, integer, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.update_branch_table(uuid, uuid, text, uuid, boolean, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.list_branch_reservations(uuid, uuid, timestamptz, timestamptz, text) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.create_branch_reservation(uuid, text, text, text, uuid, timestamptz, integer, text, uuid) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.update_branch_reservation_status(uuid, uuid, text, uuid) TO restaurant_pos_app;
