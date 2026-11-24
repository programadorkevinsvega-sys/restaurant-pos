import type { PricingRepository } from "../domain/models"
export class ManagePricing {
 constructor(private readonly repository:PricingRepository) {}
 list(signal?:AbortSignal){ return this.repository.list(signal) }
 createPriceList(input:unknown){ return this.repository.createPriceList(input) }
 assignPriceList(input:unknown){ return this.repository.assignPriceList(input) }
 setPrice(input:unknown){ return this.repository.setPrice(input) }
 createTaxRule(input:unknown){ return this.repository.createTaxRule(input) }
 setProductTax(input:unknown){ return this.repository.setProductTax(input) }
 createPromotion(input:unknown){ return this.repository.createPromotion(input) }
}
