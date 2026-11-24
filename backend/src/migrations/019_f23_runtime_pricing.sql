-- N09-F2.3 runtime. All configuration mutations are SECURITY DEFINER and owner-scoped.
CREATE TABLE public.product_tax_profiles (
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 legal_entity_id uuid NOT NULL,
 price_tax_mode text NOT NULL CHECK(price_tax_mode IN('inclusive','exclusive')),
 updated_by_user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,product_id,legal_entity_id),
 FOREIGN KEY(organization_id,legal_entity_id) REFERENCES public.legal_entities(organization_id,id) ON DELETE RESTRICT
);
ALTER TABLE public.orders ALTER COLUMN total_amount TYPE numeric(14,4);
ALTER TABLE public.order_items ALTER COLUMN price_at_order TYPE numeric(14,4);

CREATE FUNCTION public.f23_create_price_list(p_name text,p_currency char(3),p_scope text,p_actor uuid,p_from timestamptz DEFAULT NULL,p_until timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; result_id uuid;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF length(btrim(p_name)) NOT BETWEEN 2 AND 120 OR p_currency !~ '^[A-Z]{3}$'
 OR p_scope NOT IN('corporate','legal_entity','branch') OR (p_until IS NOT NULL AND p_from IS NOT NULL AND p_until<=p_from)
 THEN RAISE EXCEPTION 'INVALID_PRICE_LIST'; END IF;
 INSERT INTO public.price_lists(organization_id,name,currency_code,scope,valid_from,valid_until,created_by_user_id,updated_by_user_id)
 VALUES(org,btrim(p_name),p_currency,p_scope,p_from,p_until,p_actor,p_actor) RETURNING id INTO result_id;
 RETURN result_id;
END $$;

CREATE FUNCTION public.f23_assign_price_list(p_list uuid,p_branch uuid,p_entity uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.price_lists WHERE organization_id=org AND id=p_list AND is_active)
 OR NOT EXISTS(SELECT 1 FROM public.branch_legal_entities WHERE organization_id=org AND branch_id=p_branch AND legal_entity_id=p_entity)
 THEN RAISE EXCEPTION 'PRICE_LIST_ASSIGNMENT_SCOPE_INVALID'; END IF;
 INSERT INTO public.price_list_assignments(organization_id,price_list_id,branch_id,legal_entity_id,created_by_user_id)
 VALUES(org,p_list,p_branch,p_entity,p_actor)
 ON CONFLICT(organization_id,branch_id,legal_entity_id) DO UPDATE SET price_list_id=excluded.price_list_id,created_by_user_id=excluded.created_by_user_id,created_at=now();
END $$;

CREATE FUNCTION public.f23_set_product_price(p_list uuid,p_product uuid,p_price numeric,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF p_price IS NULL OR p_price<0 OR p_price>999999999.9999 OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product AND is_active)
 THEN RAISE EXCEPTION 'INVALID_PRODUCT_PRICE'; END IF;
 INSERT INTO public.price_list_product_prices(organization_id,price_list_id,product_id,unit_price,created_by_user_id,updated_by_user_id)
 VALUES(org,p_list,p_product,p_price,p_actor,p_actor)
 ON CONFLICT(organization_id,price_list_id,product_id) DO UPDATE SET unit_price=excluded.unit_price,updated_by_user_id=excluded.updated_by_user_id,updated_at=now();
END $$;

CREATE FUNCTION public.f23_create_tax_rule(p_entity uuid,p_code text,p_name text,p_type text,p_rate numeric,p_actor uuid,p_from timestamptz DEFAULT NULL,p_until timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; result_id uuid;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF p_rate IS NULL OR p_rate NOT BETWEEN 0 AND 1 OR length(btrim(p_code)) NOT BETWEEN 1 AND 40 OR length(btrim(p_name)) NOT BETWEEN 2 AND 120
 OR (p_until IS NOT NULL AND p_from IS NOT NULL AND p_until<=p_from)
 OR NOT EXISTS(SELECT 1 FROM public.legal_entities WHERE organization_id=org AND id=p_entity)
 THEN RAISE EXCEPTION 'INVALID_TAX_RULE'; END IF;
 INSERT INTO public.tax_rules(organization_id,legal_entity_id,code,name,tax_type,rate,valid_from,valid_until,created_by_user_id,updated_by_user_id)
 VALUES(org,p_entity,btrim(p_code),btrim(p_name),btrim(p_type),p_rate,p_from,p_until,p_actor,p_actor) RETURNING id INTO result_id;
 RETURN result_id;
END $$;

CREATE FUNCTION public.f23_set_product_tax_profile(p_product uuid,p_entity uuid,p_mode text,p_rule_ids uuid[],p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; total integer; valid integer;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF p_mode NOT IN('inclusive','exclusive') OR p_rule_ids IS NULL OR cardinality(p_rule_ids)>20 THEN RAISE EXCEPTION 'INVALID_TAX_PROFILE'; END IF;
 SELECT count(*),count(DISTINCT x) INTO total,valid FROM unnest(p_rule_ids) x;
 IF total<>valid THEN RAISE EXCEPTION 'DUPLICATE_TAX_RULE'; END IF;
 SELECT count(*) INTO valid FROM public.tax_rules WHERE organization_id=org AND legal_entity_id=p_entity AND id=ANY(p_rule_ids);
 IF valid<>total THEN RAISE EXCEPTION 'TAX_RULE_SCOPE_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product AND is_active) THEN RAISE EXCEPTION 'PRODUCT_NOT_ACTIVE'; END IF;
 INSERT INTO public.product_tax_profiles(organization_id,product_id,legal_entity_id,price_tax_mode,updated_by_user_id)
 VALUES(org,p_product,p_entity,p_mode,p_actor)
 ON CONFLICT(organization_id,product_id,legal_entity_id) DO UPDATE SET price_tax_mode=excluded.price_tax_mode,updated_by_user_id=excluded.updated_by_user_id,updated_at=now();
 DELETE FROM public.product_tax_assignments WHERE organization_id=org AND product_id=p_product AND legal_entity_id=p_entity;
 INSERT INTO public.product_tax_assignments(organization_id,product_id,legal_entity_id,tax_rule_id,price_tax_mode,position,created_by_user_id)
 SELECT org,p_product,p_entity,x,p_mode,(n-1)::smallint,p_actor FROM unnest(p_rule_ids) WITH ORDINALITY t(x,n);
END $$;

CREATE FUNCTION public.f23_create_promotion(p_name text,p_scope text,p_type text,p_value numeric,p_currency char(3),p_from timestamptz,p_until timestamptz,p_branches uuid[],p_products uuid[],p_categories uuid[],p_actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; result_id uuid; n integer;
BEGIN
 SELECT id INTO org FROM public.organizations WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501'; END IF;
 IF length(btrim(p_name)) NOT BETWEEN 2 AND 120 OR p_scope NOT IN('corporate','branch') OR p_type NOT IN('percentage','fixed_amount')
 OR p_value<=0 OR (p_type='percentage' AND p_value>100) OR (p_type='fixed_amount' AND p_currency !~ '^[A-Z]{3}$')
 OR p_from IS NULL OR p_until<=p_from OR p_branches IS NULL OR cardinality(p_branches)=0
 OR (p_scope='branch' AND cardinality(p_branches)<>1) THEN RAISE EXCEPTION 'INVALID_PROMOTION'; END IF;
 SELECT count(*) INTO n FROM public.branches WHERE organization_id=org AND id=ANY(p_branches);
 IF n<>cardinality(p_branches) THEN RAISE EXCEPTION 'PROMOTION_BRANCH_SCOPE_INVALID'; END IF;
 INSERT INTO public.promotions(organization_id,name,scope,discount_type,discount_value,currency_code,valid_from,valid_until,created_by_user_id,updated_by_user_id)
 VALUES(org,btrim(p_name),p_scope,p_type,p_value,p_currency,p_from,p_until,p_actor,p_actor) RETURNING id INTO result_id;
 INSERT INTO public.promotion_branch_targets(organization_id,promotion_id,branch_id,created_by_user_id) SELECT org,result_id,x,p_actor FROM unnest(p_branches) x;
 INSERT INTO public.promotion_product_targets(organization_id,promotion_id,product_id) SELECT org,result_id,x FROM unnest(coalesce(p_products,'{}'::uuid[])) x;
 INSERT INTO public.promotion_category_targets(organization_id,promotion_id,category_id) SELECT org,result_id,x FROM unnest(coalesce(p_categories,'{}'::uuid[])) x;
 RETURN result_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_pos_order(
 p_table_number text,p_customer_name text,p_order_type text,p_items jsonb,p_delivery_address text,p_delivery_phone text,
 p_branch_id uuid,p_legal_entity_id uuid,p_actor_user_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 v_order uuid; org uuid; list_id uuid; currency char(3); fee numeric(14,4):=0;
 item record; product_row record; profile record; promo record; promo_matches integer;
 rate numeric(12,8); base numeric(14,4); discount numeric(14,4); net numeric(14,4); tax numeric(14,4);
 line_total numeric(14,4); subtotal numeric(14,4):=0; discounts numeric(14,4):=0; taxes numeric(14,4):=0; total numeric(14,4):=0;
 option_ids uuid[]; option_count integer; valid_options integer; tax_json jsonb; promo_json jsonb; now_at timestamptz:=now();
BEGIN
 IF p_order_type IS NULL OR p_order_type NOT IN('Comer aquí','Para llevar','A domicilio')
 THEN RAISE EXCEPTION 'Invalid order type' USING ERRCODE='22023'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
 OR p_branch_id IS NULL OR p_legal_entity_id IS NULL OR p_actor_user_id IS NULL
 THEN RAISE EXCEPTION 'INVALID_ORDER_REQUEST'; END IF;
 IF p_order_type='A domicilio' AND (nullif(btrim(p_delivery_address),'') IS NULL OR nullif(btrim(p_delivery_phone),'') IS NULL)
 THEN RAISE EXCEPTION 'DELIVERY_DETAILS_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) AS x(item) WHERE jsonb_typeof(coalesce(x.item->'option_ids','[]'::jsonb))<>'array'
 OR jsonb_array_length(coalesce(x.item->'option_ids','[]'::jsonb))>40) THEN RAISE EXCEPTION 'INVALID_OPTION_SELECTION'; END IF;
 SELECT b.organization_id INTO org FROM public.branches b
 JOIN public.branch_user_assignments a ON a.organization_id=b.organization_id AND a.branch_id=b.id AND a.user_id=p_actor_user_id
 JOIN public.app_users u ON u.id=a.user_id AND u.is_active WHERE b.id=p_branch_id FOR KEY SHARE OF a;
 IF org IS NULL OR NOT EXISTS(SELECT 1 FROM public.branch_legal_entities WHERE organization_id=org AND branch_id=p_branch_id AND legal_entity_id=p_legal_entity_id)
 THEN RAISE EXCEPTION 'BRANCH_OR_LEGAL_ENTITY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_items) i(id uuid,quantity integer) WHERE id IS NULL OR quantity NOT BETWEEN 1 AND 50)
 THEN RAISE EXCEPTION 'INVALID_ORDER_ITEM'; END IF;
 IF EXISTS(SELECT 1 FROM public.products p JOIN jsonb_to_recordset(p_items) i(id uuid,quantity integer) ON i.id=p.id WHERE p.is_active=false) THEN RAISE EXCEPTION 'PRODUCT_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.branch_catalog_product_exclusions e WHERE e.organization_id=org AND e.branch_id=p_branch_id AND e.product_id IN (SELECT i.id FROM jsonb_to_recordset(p_items) i(id uuid,quantity integer))) THEN RAISE EXCEPTION 'PRODUCT_NOT_ENABLED_FOR_BRANCH' USING ERRCODE='55000'; END IF;
 SELECT a.price_list_id,l.currency_code INTO list_id,currency FROM public.price_list_assignments a
 JOIN public.price_lists l ON l.organization_id=a.organization_id AND l.id=a.price_list_id
 WHERE a.organization_id=org AND a.branch_id=p_branch_id AND a.legal_entity_id=p_legal_entity_id
 AND l.is_active AND (l.valid_from IS NULL OR l.valid_from<=now_at) AND (l.valid_until IS NULL OR l.valid_until>now_at);
 IF list_id IS NULL THEN RAISE EXCEPTION 'PRICE_LIST_NOT_CONFIGURED'; END IF;
 IF p_order_type='A domicilio' THEN SELECT coalesce(value::numeric,0) INTO fee FROM public.settings WHERE key='delivery_fee'; fee:=coalesce(fee,0); END IF;
 INSERT INTO public.orders(table_number,customer_name,order_type,total_amount,status,organization_id,branch_id,legal_entity_id,created_by_user_id,
 currency_code,price_list_id,subtotal_before_discount,discount_total,tax_total,delivery_fee_snapshot)
 VALUES(left(btrim(p_table_number),30),nullif(btrim(p_customer_name),''),p_order_type,0,'pending',org,p_branch_id,p_legal_entity_id,p_actor_user_id,currency,list_id,0,0,0,fee)
 RETURNING id INTO v_order;
 FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id uuid,quantity integer,option_ids jsonb) LOOP
  SELECT p.id,p.name,p.image_url,p.category_id,pp.unit_price INTO product_row FROM public.products p
  JOIN public.price_list_product_prices pp ON pp.organization_id=org AND pp.price_list_id=list_id AND pp.product_id=p.id
  WHERE p.id=item.id AND p.is_active FOR KEY SHARE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_PRICE_NOT_CONFIGURED_OR_INACTIVE'; END IF;
  IF EXISTS(SELECT 1 FROM public.branch_catalog_product_exclusions WHERE organization_id=org AND branch_id=p_branch_id AND product_id=item.id)
  THEN RAISE EXCEPTION 'PRODUCT_NOT_ENABLED_FOR_BRANCH' USING ERRCODE='55000'; END IF;
  option_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(item.option_ids,'[]'::jsonb)));
  SELECT count(*),count(DISTINCT x) INTO option_count,valid_options FROM unnest(option_ids) x;
  IF option_count<>valid_options THEN RAISE EXCEPTION 'Duplicate product option selection' USING ERRCODE='23514'; END IF;
  SELECT count(*) INTO valid_options FROM public.product_options po JOIN public.product_option_groups pg ON pg.id=po.group_id
  WHERE po.id=ANY(option_ids) AND pg.product_id=item.id AND po.is_active AND pg.is_active
  AND NOT EXISTS(SELECT 1 FROM public.branch_product_option_overrides ov WHERE ov.organization_id=org AND ov.branch_id=p_branch_id AND ov.option_id=po.id AND ov.is_enabled=false);
  IF valid_options<>option_count THEN RAISE EXCEPTION 'PRODUCT_OPTION_INVALID_INACTIVE_OR_NOT_AVAILABLE_FOR_BRANCH' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.product_option_groups pg WHERE pg.product_id=item.id AND pg.is_active
   AND (SELECT count(*) FROM public.product_options po WHERE po.group_id=pg.id AND po.is_active
    AND (NOT EXISTS(SELECT 1 FROM public.branch_product_option_overrides ov WHERE ov.organization_id=org AND ov.branch_id=p_branch_id AND ov.option_id=po.id) OR EXISTS(SELECT 1 FROM public.branch_product_option_overrides ov WHERE ov.organization_id=org AND ov.branch_id=p_branch_id AND ov.option_id=po.id AND ov.is_enabled)))>0
   AND ((SELECT count(*) FROM public.product_options po WHERE po.group_id=pg.id AND po.id=ANY(option_ids))<pg.min_selections
     OR (SELECT count(*) FROM public.product_options po WHERE po.group_id=pg.id AND po.id=ANY(option_ids))>pg.max_selections))
  THEN RAISE EXCEPTION 'PRODUCT_OPTION_GROUP_CARDINALITY_INVALID' USING ERRCODE='23514'; END IF;
  SELECT * INTO profile FROM public.product_tax_profiles WHERE organization_id=org AND product_id=item.id AND legal_entity_id=p_legal_entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TAX_PROFILE_REQUIRED'; END IF;
  SELECT count(*) INTO promo_matches FROM public.promotions pr JOIN public.promotion_branch_targets bt
   ON bt.organization_id=pr.organization_id AND bt.promotion_id=pr.id AND bt.branch_id=p_branch_id
  WHERE pr.organization_id=org AND pr.is_active AND pr.valid_from<=now_at AND pr.valid_until>now_at
   AND ((NOT EXISTS(SELECT 1 FROM public.promotion_product_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id)
     AND NOT EXISTS(SELECT 1 FROM public.promotion_category_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id))
    OR EXISTS(SELECT 1 FROM public.promotion_product_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id AND t.product_id=item.id)
    OR EXISTS(SELECT 1 FROM public.promotion_category_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id AND t.category_id=product_row.category_id));
  IF promo_matches>1 THEN RAISE EXCEPTION 'PROMOTION_CONFLICT_MULTIPLE_MATCHES'; END IF;
  discount:=0; promo_json:=NULL; base:=product_row.unit_price;
  IF promo_matches=1 THEN
   SELECT pr.* INTO promo FROM public.promotions pr JOIN public.promotion_branch_targets bt ON bt.organization_id=pr.organization_id AND bt.promotion_id=pr.id AND bt.branch_id=p_branch_id
   WHERE pr.organization_id=org AND pr.is_active AND pr.valid_from<=now_at AND pr.valid_until>now_at
    AND ((NOT EXISTS(SELECT 1 FROM public.promotion_product_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id)
      AND NOT EXISTS(SELECT 1 FROM public.promotion_category_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id))
     OR EXISTS(SELECT 1 FROM public.promotion_product_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id AND t.product_id=item.id)
     OR EXISTS(SELECT 1 FROM public.promotion_category_targets t WHERE t.organization_id=org AND t.promotion_id=pr.id AND t.category_id=product_row.category_id));
   IF promo.discount_type='fixed_amount' AND promo.currency_code<>currency THEN RAISE EXCEPTION 'PROMOTION_CURRENCY_MISMATCH'; END IF;
   discount:=least(base,CASE WHEN promo.discount_type='percentage' THEN base*promo.discount_value/100 ELSE promo.discount_value END);
   promo_json:=jsonb_build_object('id',promo.id,'name',promo.name,'discount_type',promo.discount_type,'discount_value',promo.discount_value,'discount_amount',discount);
  END IF;
  base:=base-discount;
  SELECT coalesce(sum(tr.rate),0) INTO rate FROM public.product_tax_assignments ta JOIN public.tax_rules tr ON tr.organization_id=ta.organization_id AND tr.id=ta.tax_rule_id
  WHERE ta.organization_id=org AND ta.product_id=item.id AND ta.legal_entity_id=p_legal_entity_id AND tr.is_active
   AND (tr.valid_from IS NULL OR tr.valid_from<=now_at) AND (tr.valid_until IS NULL OR tr.valid_until>now_at);
  IF rate>1 THEN RAISE EXCEPTION 'COMBINED_TAX_RATE_INVALID'; END IF;
  IF profile.price_tax_mode='inclusive' THEN net:=base/(1+rate); tax:=base-net; line_total:=base;
  ELSE net:=base; tax:=base*rate; line_total:=base+tax; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('tax_rule_id',tr.id,'code',tr.code,'name',tr.name,'rate',tr.rate,
    'taxable_base',net,'amount',round(net*tr.rate,4),'price_mode',profile.price_tax_mode) ORDER BY ta.position,tr.id),'[]'::jsonb)
   INTO tax_json FROM public.product_tax_assignments ta JOIN public.tax_rules tr ON tr.organization_id=ta.organization_id AND tr.id=ta.tax_rule_id
   WHERE ta.organization_id=org AND ta.product_id=item.id AND ta.legal_entity_id=p_legal_entity_id AND tr.is_active
    AND (tr.valid_from IS NULL OR tr.valid_from<=now_at) AND (tr.valid_until IS NULL OR tr.valid_until>now_at);
  INSERT INTO public.order_items(order_id,product_id,quantity,price_at_order,selected_option_ids,currency_code,list_unit_price_snapshot,
   unit_discount_snapshot,tax_mode_snapshot,tax_breakdown_snapshot,promotion_snapshot,price_list_id_snapshot)
  VALUES(v_order,item.id,item.quantity,line_total,option_ids,currency,product_row.unit_price,discount,profile.price_tax_mode,tax_json,promo_json,list_id);
  subtotal:=subtotal+product_row.unit_price*item.quantity; discounts:=discounts+discount*item.quantity; taxes:=taxes+tax*item.quantity; total:=total+line_total*item.quantity;
 END LOOP;
 UPDATE public.orders SET subtotal_before_discount=subtotal,discount_total=discounts,tax_total=taxes,total_amount=total+fee WHERE id=v_order;
 IF p_order_type='A domicilio' THEN INSERT INTO public.delivery_info(order_id,address,phone,delivery_fee) VALUES(v_order,btrim(p_delivery_address),btrim(p_delivery_phone),fee); END IF;
 RETURN v_order;
END $$;

REVOKE ALL ON FUNCTION public.f23_create_price_list(text,char,text,uuid,timestamptz,timestamptz),
 public.f23_assign_price_list(uuid,uuid,uuid,uuid),public.f23_set_product_price(uuid,uuid,numeric,uuid),
 public.f23_create_tax_rule(uuid,text,text,text,numeric,uuid,timestamptz,timestamptz),
 public.f23_set_product_tax_profile(uuid,uuid,text,uuid[],uuid),
 public.f23_create_promotion(text,text,text,numeric,char,timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.f23_create_price_list(text,char,text,uuid,timestamptz,timestamptz),
 public.f23_assign_price_list(uuid,uuid,uuid,uuid),public.f23_set_product_price(uuid,uuid,numeric,uuid),
 public.f23_create_tax_rule(uuid,text,text,text,numeric,uuid,timestamptz,timestamptz),
 public.f23_set_product_tax_profile(uuid,uuid,text,uuid[],uuid),
 public.f23_create_promotion(text,text,text,numeric,char,timestamptz,timestamptz,uuid[],uuid[],uuid[],uuid),
 public.create_pos_order(text,text,text,jsonb,text,text,uuid,uuid,uuid) TO restaurant_pos_app;
COMMENT ON TABLE public.product_tax_profiles IS 'Modo tributario por producto y entidad legal; soporta modo incluido/excluido y cero o varios componentes.';
