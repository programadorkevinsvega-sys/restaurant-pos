import type { AccountingRepository } from "../domain/accounting-repository"

export class ReadAccountingReports {
  constructor(private readonly accounting: AccountingRepository) {}

  getSalesReport(signal?: AbortSignal) {
    return this.accounting.getSalesReport(signal)
  }

  getBestSellingProducts(signal?: AbortSignal) {
    return this.accounting.getBestSellingProducts(signal)
  }
}
