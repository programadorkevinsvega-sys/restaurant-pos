import { queryPostgres } from "../../../shared/infrastructure/postgres.js"
import { AccountingRepository } from "../domain/accounting-repository.js"

export class PostgresAccountingRepository extends AccountingRepository {
  constructor(pool) {
    super()
    this.pool = pool
  }

  async salesReport({ start_date, end_date, period }) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.get_sales_report($1::timestamptz, $2::timestamptz, $3) AS report`,
      [start_date, end_date, period],
    )
    return rows[0].report
  }

  async bestSellingProducts({ start_date, end_date }) {
    const { rows } = await queryPostgres(
      this.pool,
      `SELECT public.get_best_selling_products($1::timestamptz, $2::timestamptz) AS products`,
      [start_date, end_date],
    )
    return rows[0].products
  }
}
