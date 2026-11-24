-- F2.3 requires every promotion to target at least one product or category.
-- Branch targets alone define distribution, not commercial eligibility.
CREATE OR REPLACE FUNCTION public.f23_create_promotion(
 p_name text,p_scope text,p_type text,p_value numeric,p_currency char(3),
 p_from timestamptz,p_until timestamptz,p_branches uuid[],p_products uuid[],p_categories uuid[],p_actor uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid; result_id uuid; n integer;
BEGIN
 SELECT id INTO org FROM public.organizations
 WHERE installation_slot=1 AND owner_user_id=p_actor
 AND EXISTS(SELECT 1 FROM public.app_users WHERE id=p_actor AND is_active);
 IF org IS NULL THEN
  RAISE EXCEPTION 'Active organization owner required' USING ERRCODE='42501';
 END IF;

 IF length(btrim(p_name)) NOT BETWEEN 2 AND 120
 OR p_scope NOT IN('corporate','branch')
 OR p_type NOT IN('percentage','fixed_amount')
 OR p_value IS NULL OR p_value<=0
 OR (p_type='percentage' AND p_value>100)
 OR (p_type='fixed_amount' AND p_currency !~ '^[A-Z]{3}$')
 OR p_from IS NULL OR p_until IS NULL OR p_until<=p_from
 OR p_branches IS NULL OR cardinality(p_branches)=0
 OR (p_scope='branch' AND cardinality(p_branches)<>1)
 THEN
  RAISE EXCEPTION 'INVALID_PROMOTION';
 END IF;

 IF cardinality(coalesce(p_products,'{}'::uuid[]))=0
 AND cardinality(coalesce(p_categories,'{}'::uuid[]))=0
 THEN
  RAISE EXCEPTION 'PROMOTION_TARGET_REQUIRED';
 END IF;

 IF cardinality(coalesce(p_products,'{}'::uuid[])) <>
    (SELECT count(DISTINCT target_id) FROM unnest(coalesce(p_products,'{}'::uuid[])) AS target(target_id))
 OR cardinality(coalesce(p_categories,'{}'::uuid[])) <>
    (SELECT count(DISTINCT target_id) FROM unnest(coalesce(p_categories,'{}'::uuid[])) AS target(target_id))
 THEN
  RAISE EXCEPTION 'INVALID_PROMOTION_TARGETS';
 END IF;

 SELECT count(*) INTO n FROM public.branches
 WHERE organization_id=org AND id=ANY(p_branches);
 IF n<>cardinality(p_branches) THEN
  RAISE EXCEPTION 'PROMOTION_BRANCH_SCOPE_INVALID';
 END IF;

 INSERT INTO public.promotions(
  organization_id,name,scope,discount_type,discount_value,currency_code,
  valid_from,valid_until,created_by_user_id,updated_by_user_id
 )
 VALUES(
  org,btrim(p_name),p_scope,p_type,p_value,p_currency,
  p_from,p_until,p_actor,p_actor
 )
 RETURNING id INTO result_id;

 INSERT INTO public.promotion_branch_targets(organization_id,promotion_id,branch_id,created_by_user_id)
 SELECT org,result_id,target_id,p_actor FROM unnest(p_branches) AS target(target_id);
 INSERT INTO public.promotion_product_targets(organization_id,promotion_id,product_id)
 SELECT org,result_id,target_id FROM unnest(coalesce(p_products,'{}'::uuid[])) AS target(target_id);
 INSERT INTO public.promotion_category_targets(organization_id,promotion_id,category_id)
 SELECT org,result_id,target_id FROM unnest(coalesce(p_categories,'{}'::uuid[])) AS target(target_id);

 RETURN result_id;
END $$;
