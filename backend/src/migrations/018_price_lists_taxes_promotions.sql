-- N09-F2.3: price lists, product tax configuration and scoped promotions.
-- Monetary values remain NUMERIC; no implicit currency conversion or precedence is applied.
CREATE TABLE public.price_lists (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  currency_code char(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  scope text NOT NULL CHECK (scope IN ('corporate', 'legal_entity', 'branch')),
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE UNIQUE INDEX price_lists_name_scope_unique
  ON public.price_lists(organization_id, scope, lower(name));

CREATE TABLE public.price_list_assignments (
  organization_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  legal_entity_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, branch_id, legal_entity_id),
  FOREIGN KEY (organization_id, price_list_id)
    REFERENCES public.price_lists(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, branch_id, legal_entity_id)
    REFERENCES public.branch_legal_entities(organization_id, branch_id, legal_entity_id) ON DELETE RESTRICT
);
CREATE INDEX price_list_assignments_list_idx
  ON public.price_list_assignments(organization_id, price_list_id);

CREATE TABLE public.price_list_product_prices (
  organization_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  unit_price numeric(14,4) NOT NULL CHECK (unit_price >= 0),
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, price_list_id, product_id),
  FOREIGN KEY (organization_id, price_list_id)
    REFERENCES public.price_lists(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX price_list_product_prices_product_idx
  ON public.price_list_product_prices(organization_id, product_id);

CREATE TABLE public.tax_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  legal_entity_id uuid NOT NULL,
  code text NOT NULL CHECK (char_length(btrim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  tax_type text NOT NULL CHECK (char_length(btrim(tax_type)) BETWEEN 1 AND 40),
  rate numeric(12,8) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  is_active boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, legal_entity_id, code),
  FOREIGN KEY (organization_id, legal_entity_id)
    REFERENCES public.legal_entities(organization_id, id) ON DELETE RESTRICT,
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);
CREATE INDEX tax_rules_active_lookup_idx
  ON public.tax_rules(organization_id, legal_entity_id, is_active, valid_from, valid_until);

CREATE TABLE public.product_tax_assignments (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  legal_entity_id uuid NOT NULL,
  tax_rule_id uuid NOT NULL,
  price_tax_mode text NOT NULL CHECK (price_tax_mode IN ('inclusive', 'exclusive')),
  position smallint NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 99),
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, product_id, legal_entity_id, tax_rule_id),
  FOREIGN KEY (organization_id, legal_entity_id)
    REFERENCES public.legal_entities(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, tax_rule_id)
    REFERENCES public.tax_rules(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX product_tax_assignments_product_idx
  ON public.product_tax_assignments(organization_id, product_id, legal_entity_id, position);

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  scope text NOT NULL CHECK (scope IN ('corporate', 'branch')),
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value numeric(14,4) NOT NULL CHECK (discount_value > 0),
  currency_code char(3),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  CHECK (valid_until > valid_from),
  CHECK ((discount_type = 'percentage' AND discount_value <= 100)
      OR (discount_type = 'fixed_amount' AND currency_code ~ '^[A-Z]{3}$'))
);
CREATE TABLE public.promotion_branch_targets (
  organization_id uuid NOT NULL,
  promotion_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, promotion_id, branch_id),
  FOREIGN KEY (organization_id, promotion_id)
    REFERENCES public.promotions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, branch_id)
    REFERENCES public.branches(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE public.promotion_product_targets (
  organization_id uuid NOT NULL,
  promotion_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  PRIMARY KEY (organization_id, promotion_id, product_id),
  FOREIGN KEY (organization_id, promotion_id)
    REFERENCES public.promotions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE public.promotion_category_targets (
  organization_id uuid NOT NULL,
  promotion_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  PRIMARY KEY (organization_id, promotion_id, category_id),
  FOREIGN KEY (organization_id, promotion_id)
    REFERENCES public.promotions(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.orders
  ADD COLUMN currency_code char(3),
  ADD COLUMN price_list_id uuid,
  ADD COLUMN subtotal_before_discount numeric(14,4),
  ADD COLUMN discount_total numeric(14,4),
  ADD COLUMN tax_total numeric(14,4),
  ADD COLUMN delivery_fee_snapshot numeric(14,4);
ALTER TABLE public.order_items
  ADD COLUMN currency_code char(3),
  ADD COLUMN list_unit_price_snapshot numeric(14,4),
  ADD COLUMN unit_discount_snapshot numeric(14,4),
  ADD COLUMN tax_mode_snapshot text,
  ADD COLUMN tax_breakdown_snapshot jsonb,
  ADD COLUMN promotion_snapshot jsonb,
  ADD COLUMN price_list_id_snapshot uuid;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_tax_mode_snapshot_valid
    CHECK (tax_mode_snapshot IS NULL OR tax_mode_snapshot IN ('inclusive','exclusive')),
  ADD CONSTRAINT order_items_tax_breakdown_array
    CHECK (tax_breakdown_snapshot IS NULL OR jsonb_typeof(tax_breakdown_snapshot) = 'array'),
  ADD CONSTRAINT order_items_promotion_snapshot_object
    CHECK (promotion_snapshot IS NULL OR jsonb_typeof(promotion_snapshot) = 'object');

CREATE FUNCTION public.prevent_f23_order_snapshot_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF ROW(NEW.currency_code, NEW.list_unit_price_snapshot, NEW.unit_discount_snapshot,
         NEW.tax_mode_snapshot, NEW.tax_breakdown_snapshot, NEW.promotion_snapshot,
         NEW.price_list_id_snapshot)
     IS DISTINCT FROM
     ROW(OLD.currency_code, OLD.list_unit_price_snapshot, OLD.unit_discount_snapshot,
         OLD.tax_mode_snapshot, OLD.tax_breakdown_snapshot, OLD.promotion_snapshot,
         OLD.price_list_id_snapshot) THEN
    RAISE EXCEPTION 'F2.3 order price and tax snapshots are immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_f23_order_snapshot_rewrite() FROM PUBLIC;
CREATE TRIGGER order_items_f23_snapshots_immutable
  BEFORE UPDATE OF currency_code, list_unit_price_snapshot, unit_discount_snapshot,
    tax_mode_snapshot, tax_breakdown_snapshot, promotion_snapshot, price_list_id_snapshot
  ON public.order_items FOR EACH ROW
  EXECUTE FUNCTION public.prevent_f23_order_snapshot_rewrite();

-- Configuration is accessed only through backend-owned, explicitly scoped repositories/functions.
REVOKE ALL ON TABLE public.price_lists, public.price_list_assignments,
  public.price_list_product_prices, public.tax_rules, public.product_tax_assignments,
  public.promotions, public.promotion_branch_targets, public.promotion_product_targets,
  public.promotion_category_targets FROM PUBLIC, restaurant_pos_app;
GRANT SELECT ON TABLE public.price_lists, public.price_list_assignments,
  public.price_list_product_prices, public.tax_rules, public.product_tax_assignments,
  public.promotions, public.promotion_branch_targets, public.promotion_product_targets,
  public.promotion_category_targets TO restaurant_pos_app;
GRANT SELECT ON TABLE public.orders, public.order_items TO restaurant_pos_app;

COMMENT ON TABLE public.price_lists IS
  'Listas de precios explícitas. La asignación única sucursal-entidad legal evita precedencia implícita.';
COMMENT ON TABLE public.product_tax_assignments IS
  'Impuestos y modo de precio incluido/excluido configurables por producto y entidad legal; admite varios componentes.';
COMMENT ON TABLE public.promotions IS
  'Promociones corporativas o locales con destino explícito. No se asume acumulación ni prioridad automática.';
COMMENT ON COLUMN public.order_items.tax_breakdown_snapshot IS
  'Detalle fiscal inmutable por componente: regla, tasa, base, importe y modo aplicado.';
