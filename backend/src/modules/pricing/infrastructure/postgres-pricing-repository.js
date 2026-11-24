import { queryPostgres } from "../../../shared/infrastructure/postgres.js"

export class PostgresPricingRepository {
  constructor(pool) { this.pool = pool }

  async list(actor) {
    const [lists, rules, promotions] = await Promise.all([
      queryPostgres(this.pool, `SELECT l.*, COALESCE(jsonb_agg(jsonb_build_object('branch_id',a.branch_id,'legal_entity_id',a.legal_entity_id) ORDER BY a.branch_id) FILTER (WHERE a.branch_id IS NOT NULL),'[]'::jsonb) assignments FROM public.price_lists l LEFT JOIN public.price_list_assignments a ON a.organization_id=l.organization_id AND a.price_list_id=l.id JOIN public.organizations o ON o.id=l.organization_id AND o.owner_user_id=$1 GROUP BY l.id ORDER BY l.created_at DESC`, [actor.userId]),
      queryPostgres(this.pool, `SELECT t.* FROM public.tax_rules t JOIN public.organizations o ON o.id=t.organization_id AND o.owner_user_id=$1 ORDER BY t.name,t.id`, [actor.userId]),
      queryPostgres(this.pool, `SELECT p.*, COALESCE((SELECT jsonb_agg(branch_id) FROM public.promotion_branch_targets b WHERE b.organization_id=p.organization_id AND b.promotion_id=p.id),'[]'::jsonb) branch_ids FROM public.promotions p JOIN public.organizations o ON o.id=p.organization_id AND o.owner_user_id=$1 ORDER BY p.created_at DESC`, [actor.userId]),
    ])
    return { price_lists: lists.rows, tax_rules: rules.rows, promotions: promotions.rows }
  }

  async createPriceList(input, actor) {
    const { rows } = await queryPostgres(this.pool, "SELECT public.f23_create_price_list($1,$2,$3,$4,$5,$6) id",
      [input.name,input.currency_code,input.scope,actor.userId,input.valid_from ?? null,input.valid_until ?? null])
    return { id: rows[0].id }
  }

  async assignPriceList(input, actor) {
    await queryPostgres(this.pool, "SELECT public.f23_assign_price_list($1,$2,$3,$4)",
      [input.price_list_id,input.branch_id,input.legal_entity_id,actor.userId])
    return { assigned: true }
  }

  async setPrice(input, actor) {
    await queryPostgres(this.pool, "SELECT public.f23_set_product_price($1,$2,$3,$4)",
      [input.price_list_id,input.product_id,input.unit_price,actor.userId])
    return { saved: true }
  }

  async createTaxRule(input, actor) {
    const { rows } = await queryPostgres(this.pool,
      "SELECT public.f23_create_tax_rule($1,$2,$3,$4,$5,$6,$7,$8) id",
      [input.legal_entity_id,input.code,input.name,input.tax_type,input.rate,actor.userId,input.valid_from ?? null,input.valid_until ?? null])
    return { id: rows[0].id }
  }

  async setProductTax(input, actor) {
    await queryPostgres(this.pool, "SELECT public.f23_set_product_tax_profile($1,$2,$3,$4::uuid[],$5)",
      [input.product_id,input.legal_entity_id,input.price_tax_mode,input.tax_rule_ids,actor.userId])
    return { saved: true }
  }

  async createPromotion(input, actor) {
    const { rows } = await queryPostgres(this.pool,
      "SELECT public.f23_create_promotion($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9::uuid[],$10::uuid[],$11) id",
      [input.name,input.scope,input.discount_type,input.discount_value,input.currency_code ?? null,
        input.valid_from,input.valid_until,input.branch_ids,input.product_ids ?? [],input.category_ids ?? [],actor.userId])
    return { id: rows[0].id }
  }
}
