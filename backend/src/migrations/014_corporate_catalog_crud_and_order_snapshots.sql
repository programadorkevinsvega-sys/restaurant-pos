ALTER TABLE public.products
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.categories
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.order_items
  ADD COLUMN product_name_at_order text,
  ADD COLUMN product_image_url_at_order text;

UPDATE public.order_items AS item
SET product_name_at_order = product.name,
    product_image_url_at_order = product.image_url
FROM public.products AS product
WHERE product.id = item.product_id
  AND item.product_name_at_order IS NULL;

CREATE INDEX products_active_category_name_idx
  ON public.products(category_id, name)
  WHERE is_active = true;

CREATE INDEX categories_active_name_idx
  ON public.categories(name)
  WHERE is_active = true;

COMMENT ON COLUMN public.products.is_active IS
  'Baja lógica del producto maestro. Se conserva la fila para preservar referencias históricas de pedidos.';
COMMENT ON COLUMN public.categories.is_active IS
  'Baja lógica de la categoría corporativa. Solo puede darse de baja cuando no tenga productos activos.';
COMMENT ON COLUMN public.order_items.product_name_at_order IS
  'Snapshot del nombre del producto al registrar el pedido; no cambia al editar el catálogo maestro.';
COMMENT ON COLUMN public.order_items.product_image_url_at_order IS
  'Snapshot de la imagen del producto al registrar el pedido.';

CREATE FUNCTION public.snapshot_and_validate_order_item_product()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_name text;
  v_image_url text;
  v_active boolean;
  v_category_active boolean;
BEGIN
  SELECT product.name, product.image_url, product.is_active,
         coalesce(category.is_active, true)
  INTO v_name, v_image_url, v_active, v_category_active
  FROM public.products AS product
  LEFT JOIN public.categories AS category ON category.id = product.category_id
  WHERE product.id = NEW.product_id
  FOR KEY SHARE OF product;

  IF NOT FOUND OR NOT v_active OR NOT v_category_active THEN
    RAISE EXCEPTION 'PRODUCT_NOT_ACTIVE'
      USING ERRCODE = '23514';
  END IF;

  NEW.product_name_at_order := v_name;
  NEW.product_image_url_at_order := v_image_url;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_and_validate_order_item_product() FROM PUBLIC;

CREATE TRIGGER order_items_snapshot_active_product
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_and_validate_order_item_product();

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

  SELECT coalesce(jsonb_agg(to_jsonb(result_row)), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT oi.product_id AS id, oi.product_name_at_order AS name,
      coalesce(category.name, 'Sin categoría') AS category,
      sum(oi.quantity)::integer AS total_quantity,
      sum(oi.quantity * oi.price_at_order) AS total_revenue
    FROM public.order_items AS oi
    JOIN public.orders AS orders ON orders.id = oi.order_id
    LEFT JOIN public.products AS product ON product.id = oi.product_id
    LEFT JOIN public.categories AS category ON category.id = product.category_id
    WHERE orders.status = 'completed'
      AND orders.created_at >= p_start_date AND orders.created_at <= p_end_date
    GROUP BY oi.product_id, oi.product_name_at_order, category.name
    ORDER BY total_quantity DESC, name
    LIMIT 10
  ) AS result_row;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.prevent_category_deactivation_with_active_products()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1 FROM public.products AS product
    WHERE product.category_id = NEW.id AND product.is_active = true
  ) THEN
    RAISE EXCEPTION 'CATEGORY_HAS_ACTIVE_PRODUCTS'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_category_deactivation_with_active_products() FROM PUBLIC;

CREATE TRIGGER categories_preserve_active_product_classification
  BEFORE UPDATE OF is_active ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_category_deactivation_with_active_products();

CREATE FUNCTION public.prevent_product_assignment_to_inactive_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.is_active AND NEW.category_id IS NOT NULL THEN
    PERFORM 1 FROM public.categories
    WHERE id = NEW.category_id AND is_active = true
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CATEGORY_NOT_ACTIVE'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_product_assignment_to_inactive_category() FROM PUBLIC;

CREATE TRIGGER products_require_active_category
  BEFORE INSERT OR UPDATE OF category_id, is_active ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_product_assignment_to_inactive_category();

CREATE FUNCTION public.prevent_order_item_snapshot_rewrite()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.product_name_at_order IS DISTINCT FROM OLD.product_name_at_order
     OR NEW.product_image_url_at_order IS DISTINCT FROM OLD.product_image_url_at_order THEN
    RAISE EXCEPTION 'Order item product snapshots are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_order_item_snapshot_rewrite() FROM PUBLIC;

CREATE TRIGGER order_items_product_snapshots_immutable
  BEFORE UPDATE OF product_name_at_order, product_image_url_at_order
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_order_item_snapshot_rewrite();
