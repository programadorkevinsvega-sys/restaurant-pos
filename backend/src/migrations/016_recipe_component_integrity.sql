CREATE OR REPLACE FUNCTION public.validate_recipe_ingredient_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_organization_id uuid;
BEGIN
  SELECT organization_id INTO v_organization_id
  FROM public.product_recipes
  WHERE id = NEW.recipe_id;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'RECIPE_NOT_FOUND'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM public.ingredients AS ingredient
  WHERE ingredient.id = NEW.ingredient_id
    AND ingredient.organization_id = v_organization_id
    AND ingredient.is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECIPE_INGREDIENT_NOT_ACTIVE_OR_IN_SCOPE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_recipe_ingredient_scope() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.prevent_ingredient_deactivation_when_used()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1
    FROM public.recipe_ingredients AS line
    WHERE line.ingredient_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'INGREDIENT_IN_USE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_ingredient_deactivation_when_used() FROM PUBLIC;

CREATE TRIGGER ingredients_preserve_recipe_components
  BEFORE UPDATE OF is_active ON public.ingredients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_ingredient_deactivation_when_used();
