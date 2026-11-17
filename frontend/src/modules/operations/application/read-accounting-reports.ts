import type { AccountingRepository } from "../domain/accounting-repository"
import { traceOperation } from "../../../shared/infrastructure/tracing"

export class ReadAccountingReports {
  constructor(private readonly accounting: AccountingRepository) {}

  getSalesReport(signal?: AbortSignal) {
    return traceOperation("accounting.sales_report", () => this.accounting.getSalesReport(signal))
  }

  getBestSellingProducts(signal?: AbortSignal) {
    return traceOperation("accounting.best_selling_products", () => this.accounting.getBestSellingProducts(signal))
  }
}
