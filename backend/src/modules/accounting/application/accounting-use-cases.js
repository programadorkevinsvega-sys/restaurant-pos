import { traceOperation } from "../../../shared/infrastructure/tracing.js"

export class AccountingUseCases {
  constructor(repository) {
    this.repository = repository
  }

  salesReport(filters) {
    return traceOperation("accounting.sales_report", () => this.repository.salesReport(filters))
  }

  bestSellingProducts(filters) {
    return traceOperation("accounting.best_selling_products", () => this.repository.bestSellingProducts(filters))
  }
}
