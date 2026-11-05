export class AccountingUseCases {
  constructor(repository) {
    this.repository = repository
  }

  salesReport(filters) {
    return this.repository.salesReport(filters)
  }

  bestSellingProducts(filters) {
    return this.repository.bestSellingProducts(filters)
  }
}
