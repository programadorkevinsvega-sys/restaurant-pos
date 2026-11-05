import type { BestSellingProduct, SalesReport } from "./models"

export interface AccountingRepository {
  getSalesReport(signal?: AbortSignal): Promise<SalesReport>
  getBestSellingProducts(signal?: AbortSignal): Promise<BestSellingProduct[]>
}
