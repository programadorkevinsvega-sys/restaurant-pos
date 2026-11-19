ALTER TABLE public.branches
  ADD COLUMN operational_address jsonb,
  ADD COLUMN time_zone text,
  ADD COLUMN currency_code text,
  ADD COLUMN weekly_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE FUNCTION public.branch_operational_address_valid(p_address jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_key text;
  v_value jsonb;
BEGIN
  IF p_address IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(p_address) <> 'object' THEN RETURN false; END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_address) LOOP
    IF v_key NOT IN (
      'line_1', 'line_2', 'locality', 'administrative_area',
      'postal_code', 'country_code'
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  IF jsonb_typeof(p_address->'line_1') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_address->'locality') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_address->'country_code') IS DISTINCT FROM 'string' THEN
    RETURN false;
  END IF;

  IF char_length(btrim(p_address->>'line_1')) NOT BETWEEN 1 AND 180
     OR p_address->>'line_1' <> btrim(p_address->>'line_1')
     OR char_length(btrim(p_address->>'locality')) NOT BETWEEN 1 AND 120
     OR p_address->>'locality' <> btrim(p_address->>'locality')
     OR (p_address->>'country_code') !~ '^[A-Z]{2}$' THEN
    RETURN false;
  END IF;

  FOREACH v_key IN ARRAY ARRAY['line_2', 'administrative_area', 'postal_code'] LOOP
    v_value := p_address->v_key;
    IF v_value IS NOT NULL AND v_value <> 'null'::jsonb THEN
      IF jsonb_typeof(v_value) <> 'string'
         OR char_length(btrim(v_value #>> '{}')) > 120
         OR v_value #>> '{}' <> btrim(v_value #>> '{}') THEN
        RETURN false;
      END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branch_local_periods_valid(
  p_periods jsonb,
  p_minimum integer,
  p_maximum integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_period jsonb;
  v_other jsonb;
  v_ordinal bigint;
  v_start integer;
  v_end integer;
  v_other_start integer;
  v_other_end integer;
  v_close_next_day boolean;
BEGIN
  IF p_periods IS NULL OR jsonb_typeof(p_periods) <> 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_periods) < p_minimum
     OR jsonb_array_length(p_periods) > p_maximum THEN
    RETURN false;
  END IF;

  FOR v_period, v_ordinal IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_periods) WITH ORDINALITY
  LOOP
    IF jsonb_typeof(v_period) <> 'object' THEN
      RETURN false;
    END IF;

    IF NOT (v_period ? 'opens_at')
       OR NOT (v_period ? 'closes_at')
       OR NOT (v_period ? 'closes_next_day')
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_period) AS keys(key_name)
         WHERE key_name NOT IN ('opens_at', 'closes_at', 'closes_next_day')
       )
       OR jsonb_typeof(v_period->'opens_at') <> 'string'
       OR jsonb_typeof(v_period->'closes_at') <> 'string'
       OR jsonb_typeof(v_period->'closes_next_day') <> 'boolean'
       OR (v_period->>'opens_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       OR (v_period->>'closes_at') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
      RETURN false;
    END IF;

    v_start := split_part(v_period->>'opens_at', ':', 1)::integer * 60
      + split_part(v_period->>'opens_at', ':', 2)::integer;
    v_end := split_part(v_period->>'closes_at', ':', 1)::integer * 60
      + split_part(v_period->>'closes_at', ':', 2)::integer;
    v_close_next_day := (v_period->>'closes_next_day')::boolean;
    IF v_close_next_day THEN v_end := v_end + 1440; END IF;

    IF v_end <= v_start OR v_end - v_start > 1440 THEN
      RETURN false;
    END IF;

    FOR v_other IN
      SELECT value
      FROM jsonb_array_elements(p_periods) WITH ORDINALITY AS entries(value, ordinality)
      WHERE ordinality < v_ordinal
    LOOP
      v_other_start := split_part(v_other->>'opens_at', ':', 1)::integer * 60
        + split_part(v_other->>'opens_at', ':', 2)::integer;
      v_other_end := split_part(v_other->>'closes_at', ':', 1)::integer * 60
        + split_part(v_other->>'closes_at', ':', 2)::integer;
      IF (v_other->>'closes_next_day')::boolean THEN
        v_other_end := v_other_end + 1440;
      END IF;
      IF v_start < v_other_end AND v_other_start < v_end THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION public.branch_weekly_hours_valid(p_hours jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_entry jsonb;
  v_conflict boolean;
BEGIN
  IF p_hours IS NULL OR jsonb_typeof(p_hours) <> 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_hours) > 35 THEN RETURN false; END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_hours) LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      RETURN false;
    END IF;
    IF NOT (v_entry ? 'weekday')
       OR NOT (v_entry ? 'opens_at')
       OR NOT (v_entry ? 'closes_at')
       OR NOT (v_entry ? 'closes_next_day')
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_entry) AS keys(key_name)
         WHERE key_name NOT IN ('weekday', 'opens_at', 'closes_at', 'closes_next_day')
       )
       OR jsonb_typeof(v_entry->'weekday') <> 'number'
       OR (v_entry->>'weekday') !~ '^[1-7]$'
       OR NOT public.branch_local_periods_valid(
         jsonb_build_array(jsonb_build_object(
           'opens_at', v_entry->>'opens_at',
           'closes_at', v_entry->>'closes_at',
           'closes_next_day', v_entry->'closes_next_day'
         )),
         1,
         1
       ) THEN
      RETURN false;
    END IF;
  END LOOP;

  WITH periods AS (
    SELECT
      ordinality,
      ((value->>'weekday')::integer - 1) * 1440
        + split_part(value->>'opens_at', ':', 1)::integer * 60
        + split_part(value->>'opens_at', ':', 2)::integer AS starts_at,
      ((value->>'weekday')::integer - 1) * 1440
        + split_part(value->>'closes_at', ':', 1)::integer * 60
        + split_part(value->>'closes_at', ':', 2)::integer
        + CASE WHEN (value->>'closes_next_day')::boolean THEN 1440 ELSE 0 END AS ends_at
    FROM jsonb_array_elements(p_hours) WITH ORDINALITY AS entries(value, ordinality)
  )
  SELECT EXISTS (
    SELECT 1
    FROM periods AS first_period
    JOIN periods AS second_period
      ON first_period.ordinality < second_period.ordinality
    CROSS JOIN generate_series(-10080, 10080, 10080) AS weekly_shift(minutes)
    WHERE first_period.starts_at < second_period.ends_at + weekly_shift.minutes
      AND second_period.starts_at + weekly_shift.minutes < first_period.ends_at
  )
  INTO v_conflict;

  RETURN NOT v_conflict;
END;
$$;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_operational_address_valid
    CHECK (public.branch_operational_address_valid(operational_address)),
  ADD CONSTRAINT branches_time_zone_format
    CHECK (time_zone IS NULL OR (
      char_length(btrim(time_zone)) BETWEEN 1 AND 100
      AND time_zone = btrim(time_zone)
    )),
  ADD CONSTRAINT branches_currency_code_format
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT branches_weekly_hours_valid
    CHECK (public.branch_weekly_hours_valid(weekly_hours));

COMMENT ON COLUMN public.branches.operational_address IS
  'Dirección física/operativa del local. No representa ni sustituye el domicilio registrado de una entidad legal.';
COMMENT ON COLUMN public.branches.time_zone IS
  'Zona IANA declarada por la sucursal. Esta fase la almacena; no determina precedencia ni reglas de corte contable.';
COMMENT ON COLUMN public.branches.currency_code IS
  'Código alfabético de moneda declarado por la sucursal. No activa conversiones ni reemplaza la moneda funcional de la entidad legal.';
COMMENT ON COLUMN public.branches.weekly_hours IS
  'Horario semanal local por día ISO (1=lunes..7=domingo), con intervalos y cierres al día siguiente opcionales.';

CREATE TABLE public.branch_calendar_exceptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  local_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('closed', 'special_hours')),
  periods jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL,
  created_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_calendar_exceptions_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT branch_calendar_exceptions_date_unique
    UNIQUE (organization_id, branch_id, local_date),
  CONSTRAINT branch_calendar_exceptions_reason_valid
    CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500 AND reason = btrim(reason)),
  CONSTRAINT branch_calendar_exceptions_periods_valid
    CHECK (
      (kind = 'closed' AND periods = '[]'::jsonb)
      OR
      (kind = 'special_hours' AND public.branch_local_periods_valid(periods, 1, 5))
    )
);

CREATE INDEX branch_calendar_exceptions_range_idx
  ON public.branch_calendar_exceptions(organization_id, branch_id, local_date);

CREATE TABLE public.branch_local_configuration_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('configuration.updated', 'calendar.upserted', 'calendar.deleted')
  ),
  local_date date,
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid NOT NULL
    REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branch_local_configuration_events_branch_fk
    FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX branch_local_configuration_events_history_idx
  ON public.branch_local_configuration_events(organization_id, branch_id, sequence DESC);

REVOKE ALL ON TABLE public.branch_calendar_exceptions FROM PUBLIC, restaurant_pos_app;
REVOKE ALL ON TABLE public.branch_local_configuration_events FROM PUBLIC, restaurant_pos_app;
GRANT SELECT ON TABLE public.branch_calendar_exceptions, public.branch_local_configuration_events
  TO restaurant_pos_app;

CREATE FUNCTION public.update_branch_local_configuration(
  p_branch_id uuid,
  p_operational_address jsonb,
  p_time_zone text,
  p_currency_code text,
  p_weekly_hours jsonb,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_status text;
  v_before jsonb;
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

  SELECT status INTO v_status
  FROM public.branches
  WHERE organization_id = v_organization_id AND id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'BRANCH_NOT_FOUND'; END IF;
  IF v_status <> 'active' THEN RETURN 'BRANCH_NOT_ACTIVE'; END IF;
  IF NOT public.branch_operational_address_valid(p_operational_address) THEN
    RETURN 'INVALID_ADDRESS';
  END IF;
  IF p_time_zone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = p_time_zone
  ) THEN
    RETURN 'INVALID_TIME_ZONE';
  END IF;
  IF p_currency_code IS NOT NULL AND p_currency_code !~ '^[A-Z]{3}$' THEN
    RETURN 'INVALID_CURRENCY';
  END IF;
  IF NOT public.branch_weekly_hours_valid(p_weekly_hours) THEN
    RETURN 'INVALID_WEEKLY_HOURS';
  END IF;
  IF jsonb_array_length(p_weekly_hours) > 0 AND p_time_zone IS NULL THEN
    RETURN 'TIME_ZONE_REQUIRED';
  END IF;

  SELECT jsonb_build_object(
    'operational_address', operational_address,
    'time_zone', time_zone,
    'currency_code', currency_code,
    'weekly_hours', weekly_hours
  ) INTO v_before
  FROM public.branches
  WHERE organization_id = v_organization_id AND id = p_branch_id;

  UPDATE public.branches
  SET operational_address = p_operational_address,
      time_zone = p_time_zone,
      currency_code = p_currency_code,
      weekly_hours = p_weekly_hours,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  WHERE organization_id = v_organization_id AND id = p_branch_id;

  INSERT INTO public.branch_local_configuration_events (
    organization_id, branch_id, event_type, before_state, after_state, actor_user_id
  )
  VALUES (
    v_organization_id,
    p_branch_id,
    'configuration.updated',
    v_before,
    jsonb_build_object(
      'operational_address', p_operational_address,
      'time_zone', p_time_zone,
      'currency_code', p_currency_code,
      'weekly_hours', p_weekly_hours
    ),
    p_actor_user_id
  );
  RETURN 'UPDATED';
END;
$$;

CREATE FUNCTION public.upsert_branch_calendar_exception(
  p_branch_id uuid,
  p_local_date date,
  p_kind text,
  p_periods jsonb,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_status text;
  v_time_zone text;
  v_before jsonb;
  v_after jsonb;
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

  SELECT status, time_zone INTO v_status, v_time_zone
  FROM public.branches
  WHERE organization_id = v_organization_id AND id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'BRANCH_NOT_FOUND'; END IF;
  IF v_status <> 'active' THEN RETURN 'BRANCH_NOT_ACTIVE'; END IF;
  IF v_time_zone IS NULL THEN RETURN 'TIME_ZONE_REQUIRED'; END IF;
  IF p_periods IS NULL THEN RETURN 'INVALID_PERIODS'; END IF;
  IF p_local_date IS NULL OR p_kind IS NULL OR p_kind NOT IN ('closed', 'special_hours') THEN
    RETURN 'INVALID_CALENDAR_EXCEPTION';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
     OR p_reason <> btrim(p_reason) THEN
    RETURN 'INVALID_REASON';
  END IF;
  IF p_kind = 'closed' AND p_periods <> '[]'::jsonb THEN
    RETURN 'INVALID_PERIODS';
  END IF;
  IF p_kind = 'special_hours' AND NOT public.branch_local_periods_valid(p_periods, 1, 5) THEN
    RETURN 'INVALID_PERIODS';
  END IF;

  SELECT jsonb_build_object(
    'kind', kind, 'periods', periods, 'reason', reason
  ) INTO v_before
  FROM public.branch_calendar_exceptions
  WHERE organization_id = v_organization_id
    AND branch_id = p_branch_id
    AND local_date = p_local_date;

  INSERT INTO public.branch_calendar_exceptions (
    organization_id, branch_id, local_date, kind, periods, reason,
    created_by_user_id, updated_by_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, p_local_date, p_kind, p_periods, p_reason,
    p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (organization_id, branch_id, local_date)
  DO UPDATE SET
    kind = EXCLUDED.kind,
    periods = EXCLUDED.periods,
    reason = EXCLUDED.reason,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = now()
  RETURNING jsonb_build_object(
    'kind', kind, 'periods', periods, 'reason', reason
  ) INTO v_after;

  INSERT INTO public.branch_local_configuration_events (
    organization_id, branch_id, event_type, local_date, before_state, after_state, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, 'calendar.upserted', p_local_date,
    v_before, v_after, p_actor_user_id
  );
  RETURN 'SAVED';
END;
$$;

CREATE FUNCTION public.delete_branch_calendar_exception(
  p_branch_id uuid,
  p_local_date date,
  p_actor_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
  v_status text;
  v_before jsonb;
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

  SELECT status INTO v_status
  FROM public.branches
  WHERE organization_id = v_organization_id AND id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'BRANCH_NOT_FOUND'; END IF;
  IF v_status <> 'active' THEN RETURN 'BRANCH_NOT_ACTIVE'; END IF;

  DELETE FROM public.branch_calendar_exceptions
  WHERE organization_id = v_organization_id
    AND branch_id = p_branch_id
    AND local_date = p_local_date
  RETURNING jsonb_build_object(
    'kind', kind, 'periods', periods, 'reason', reason
  ) INTO v_before;

  IF NOT FOUND THEN RETURN 'CALENDAR_EXCEPTION_NOT_FOUND'; END IF;

  INSERT INTO public.branch_local_configuration_events (
    organization_id, branch_id, event_type, local_date, before_state, after_state, actor_user_id
  )
  VALUES (
    v_organization_id, p_branch_id, 'calendar.deleted', p_local_date,
    v_before, NULL, p_actor_user_id
  );
  RETURN 'DELETED';
END;
$$;

REVOKE ALL ON FUNCTION public.branch_operational_address_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_local_periods_valid(jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branch_weekly_hours_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_branch_local_configuration(uuid, jsonb, text, text, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_branch_calendar_exception(uuid, date, text, jsonb, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_branch_calendar_exception(uuid, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_branch_local_configuration(uuid, jsonb, text, text, jsonb, uuid)
  TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.upsert_branch_calendar_exception(uuid, date, text, jsonb, text, uuid)
  TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.delete_branch_calendar_exception(uuid, date, uuid)
  TO restaurant_pos_app;
