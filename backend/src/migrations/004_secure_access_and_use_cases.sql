DO $$
DECLARE
  table_name text;
  policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'categories', 'products', 'orders', 'order_items', 'tables',
    'reservations', 'delivery_info', 'settings'
  ]
  LOOP
    FOR policy_name IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, table_name);
    END LOOP;
  END LOOP;
END;
$$;

ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_info DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories, public.products,
  public.orders, public.order_items, public.tables, public.reservations,
  public.delivery_info, public.settings TO restaurant_pos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO restaurant_pos_app;

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
  ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_date_status
  ON public.reservations(reservation_date, status);
CREATE INDEX IF NOT EXISTS idx_delivery_info_status
  ON public.delivery_info(status);

CREATE OR REPLACE FUNCTION public.create_pos_order(
  p_table_number text,
  p_customer_name text,
  p_order_type text,
  p_items jsonb,
  p_delivery_address text DEFAULT NULL,
  p_delivery_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
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
  IF p_order_type = 'A domicilio'
     AND (NULLIF(trim(p_delivery_address), '') IS NULL OR NULLIF(trim(p_delivery_phone), '') IS NULL) THEN
    RAISE EXCEPTION 'Delivery details are required';
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

  INSERT INTO public.orders (table_number, customer_name, order_type, total_amount, status)
  VALUES (
    left(trim(p_table_number), 30),
    NULLIF(trim(p_customer_name), ''),
    p_order_type,
    v_subtotal + v_tax + v_delivery_fee,
    'pending'
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

CREATE OR REPLACE FUNCTION public.assign_delivery_driver(
  p_order_id uuid,
  p_driver_name text,
  p_driver_phone text DEFAULT NULL,
  p_estimated_time integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.delivery_info;
BEGIN
  IF p_driver_name IS NULL OR length(trim(p_driver_name)) = 0
     OR length(trim(p_driver_name)) > 120
     OR (p_estimated_time IS NOT NULL AND p_estimated_time NOT BETWEEN 1 AND 1440) THEN
    RAISE EXCEPTION 'Invalid delivery assignment';
  END IF;

  UPDATE public.delivery_info
  SET driver_name = trim(p_driver_name),
      driver_phone = NULLIF(trim(p_driver_phone), ''),
      estimated_time = p_estimated_time,
      status = 'assigned',
      updated_at = now()
  WHERE order_id = p_order_id
  RETURNING * INTO v_delivery;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  UPDATE public.orders SET status = 'preparing', updated_at = now()
  WHERE id = p_order_id;
  RETURN to_jsonb(v_delivery);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_period text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_period NOT IN ('hourly', 'daily', 'monthly') OR p_end_date <= p_start_date
     OR p_end_date - p_start_date > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid report range';
  END IF;

  WITH completed AS (
    SELECT id, total_amount, created_at, order_type
    FROM public.orders
    WHERE status = 'completed' AND created_at >= p_start_date AND created_at <= p_end_date
  ), sales_by_bucket AS (
    SELECT
      date_trunc(p_period, created_at) AS bucket,
      count(*) AS orders,
      sum(total_amount) AS revenue
    FROM completed
    GROUP BY date_trunc(p_period, created_at)
  ), types_by_bucket AS (
    SELECT bucket,
      jsonb_object_agg(order_type, order_count) AS order_types
    FROM (
      SELECT date_trunc(p_period, created_at) AS bucket, order_type, count(*) AS order_count
      FROM completed
      GROUP BY date_trunc(p_period, created_at), order_type
    ) type_counts
    GROUP BY bucket
  )
  SELECT jsonb_build_object(
    'period', p_period,
    'total_orders', (SELECT count(*) FROM completed),
    'total_revenue', coalesce((SELECT sum(total_amount) FROM completed), 0),
    'data', coalesce(jsonb_agg(jsonb_build_object(
      'period', CASE p_period
        WHEN 'hourly' THEN to_char(sales_by_bucket.bucket, 'YYYY-MM-DD HH24:00')
        WHEN 'monthly' THEN to_char(sales_by_bucket.bucket, 'YYYY-MM')
        ELSE to_char(sales_by_bucket.bucket, 'YYYY-MM-DD')
      END,
      'orders', orders,
      'revenue', revenue,
      'order_types', order_types
    ) ORDER BY sales_by_bucket.bucket), '[]'::jsonb)
  )
  INTO v_result
  FROM sales_by_bucket
  JOIN types_by_bucket USING (bucket);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_best_selling_products(
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_end_date <= p_start_date OR p_end_date - p_start_date > interval '366 days' THEN
    RAISE EXCEPTION 'Invalid report range';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT p.id, p.name, coalesce(c.name, 'Sin categoría') AS category,
      sum(oi.quantity)::integer AS total_quantity,
      sum(oi.quantity * oi.price_at_order) AS total_revenue
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE o.status = 'completed' AND o.created_at >= p_start_date AND o.created_at <= p_end_date
    GROUP BY p.id, p.name, c.name
    ORDER BY total_quantity DESC, p.name
    LIMIT 10
  ) r;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_delivery_driver(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_report(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_best_selling_products(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_pos_order(text, text, text, jsonb, text, text) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.assign_delivery_driver(uuid, text, text, integer) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.get_sales_report(timestamptz, timestamptz, text) TO restaurant_pos_app;
GRANT EXECUTE ON FUNCTION public.get_best_selling_products(timestamptz, timestamptz) TO restaurant_pos_app;
