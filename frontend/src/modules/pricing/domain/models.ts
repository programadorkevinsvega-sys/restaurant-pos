export interface PriceList { id:string; name:string; currency_code:string; scope:string; is_active:boolean; assignments:Array<{branch_id:string;legal_entity_id:string}> }
export interface TaxRule { id:string; legal_entity_id:string; code:string; name:string; tax_type:string; rate:string|number; is_active:boolean }
export interface Promotion { id:string; name:string; scope:string; discount_type:string; discount_value:string|number; branch_ids:string[] }
export interface PricingSnapshot { price_lists:PriceList[]; tax_rules:TaxRule[]; promotions:Promotion[] }
export interface PricingRepository {
 list(signal?:AbortSignal):Promise<PricingSnapshot>
 createPriceList(input:unknown):Promise<{id:string}>
 assignPriceList(input:unknown):Promise<{assigned:boolean}>
 setPrice(input:unknown):Promise<{saved:boolean}>
 createTaxRule(input:unknown):Promise<{id:string}>
 setProductTax(input:unknown):Promise<{saved:boolean}>
 createPromotion(input:unknown):Promise<{id:string}>
}
