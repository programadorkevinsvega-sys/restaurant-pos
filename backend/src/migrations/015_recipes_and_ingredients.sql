CREATE TABLE public.ingredients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text,
  unit_code text NOT NULL CHECK (unit_code ~ '^[a-z][a-z0-9._-]{0,15}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ingredients_organization_name_unique
  ON public.ingredients (organization_id, lower(name));
CREATE INDEX ingredients_organization_active_name_idx
  ON public.ingredients (organization_id, is_active, name);

COMMENT ON TABLE public.ingredients IS
  'Identidad técnica corporativa reutilizable; no es un producto vendible. unit_code es estable y opaco en F2.2; las conversiones se definen en N02-F1.2.';

CREATE TABLE public.product_recipes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE RESTRICT,
  preparation_instructions text NOT NULL DEFAULT '',
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_recipes_organization_idx
  ON public.product_recipes (organization_id, product_id);

CREATE TABLE public.recipe_ingredients (
  recipe_id uuid NOT NULL REFERENCES public.product_recipes(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  position integer NOT NULL CHECK (position BETWEEN 0 AND 999),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipe_ingredients_pk PRIMARY KEY (recipe_id, ingredient_id),
  CONSTRAINT recipe_ingredients_position_unique UNIQUE (recipe_id, position)
);
CREATE INDEX recipe_ingredients_ingredient_idx
  ON public.recipe_ingredients (ingredient_id, recipe_id);

CREATE TABLE public.recipe_change_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  recipe_id uuid NOT NULL REFERENCES public.product_recipes(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated')),
  snapshot jsonb NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recipe_change_events_history_idx
  ON public.recipe_change_events (organization_id, recipe_id, sequence DESC);

CREATE FUNCTION public.validate_product_recipe_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products AS product
    LEFT JOIN public.categories AS category ON category.id = product.category_id
    WHERE product.id = NEW.product_id
      AND product.is_active = true
      AND coalesce(category.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'RECIPE_PRODUCT_NOT_ACTIVE'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = NEW.organization_id AND installation_slot = 1
  ) THEN
    RAISE EXCEPTION 'RECIPE_ORGANIZATION_INVALID'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_product_recipe_scope() FROM PUBLIC;
CREATE TRIGGER product_recipes_validate_scope
  BEFORE INSERT OR UPDATE OF product_id, organization_id
  ON public.product_recipes
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_recipe_scope();

CREATE FUNCTION public.validate_recipe_ingredient_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.product_recipes WHERE id = NEW.recipe_id;
  IF v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ingredients AS ingredient
    WHERE ingredient.id = NEW.ingredient_id
      AND ingredient.organization_id = v_organization_id
      AND ingredient.is_active = true
  ) THEN
    RAISE EXCEPTION 'RECIPE_INGREDIENT_NOT_ACTIVE_OR_IN_SCOPE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_recipe_ingredient_scope() FROM PUBLIC;
CREATE TRIGGER recipe_ingredients_validate_scope
  BEFORE INSERT OR UPDATE OF recipe_id, ingredient_id
  ON public.recipe_ingredients
  FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_ingredient_scope();

CREATE FUNCTION public.prevent_recipe_ingredient_unit_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.unit_code IS DISTINCT FROM OLD.unit_code AND EXISTS (
    SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'INGREDIENT_UNIT_IN_USE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_recipe_ingredient_unit_change() FROM PUBLIC;
CREATE TRIGGER ingredients_unit_immutable_when_used
  BEFORE UPDATE OF unit_code ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.prevent_recipe_ingredient_unit_change();

CREATE FUNCTION public.prevent_recipe_change_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Recipe change events are append-only'
    USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_recipe_change_event_mutation() FROM PUBLIC;
CREATE TRIGGER recipe_change_events_append_only
  BEFORE UPDATE OR DELETE ON public.recipe_change_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_recipe_change_event_mutation();

REVOKE ALL ON TABLE public.ingredients, public.product_recipes, public.recipe_ingredients,
  public.recipe_change_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ingredients TO restaurant_pos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE public.product_recipes TO restaurant_pos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recipe_ingredients TO restaurant_pos_app;
GRANT SELECT, INSERT ON TABLE public.recipe_change_events TO restaurant_pos_app;
