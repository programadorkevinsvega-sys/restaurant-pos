import type { PricingRepository, PricingSnapshot } from "../domain/models"
import type { HttpClient } from "@/shared/infrastructure/http-client"

export class HttpPricingRepository implements PricingRepository {
 constructor(private readonly http:HttpClient) {}
 list(signal?:AbortSignal){ return this.http.get<PricingSnapshot>("/admin/pricing",signal) }
 createPriceList(input:unknown){ return this.http.post<{id:string}>("/admin/pricing/price-lists",input) }
 assignPriceList(input:unknown){ return this.http.put<{assigned:boolean}>("/admin/pricing/price-list-assignments",input) }
 setPrice(input:unknown){ return this.http.put<{saved:boolean}>("/admin/pricing/product-prices",input) }
 createTaxRule(input:unknown){ return this.http.post<{id:string}>("/admin/pricing/tax-rules",input) }
 setProductTax(input:unknown){ return this.http.put<{saved:boolean}>("/admin/pricing/product-tax-profiles",input) }
 createPromotion(input:unknown){ return this.http.post<{id:string}>("/admin/pricing/promotions",input) }
}
