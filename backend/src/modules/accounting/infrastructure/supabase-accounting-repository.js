import { unwrapSupabase } from "../../../shared/infrastructure/unwrap-supabase.js"
import { AccountingRepository } from "../domain/accounting-repository.js"

export class SupabaseAccountingRepository extends AccountingRepository {
  constructor(client) {
    super()
    this.client = client
  }

  async salesReport({ start_date, end_date, period }) {
    return unwrapSupabase(await this.client.rpc("get_sales_report", {
      p_start_date: start_date,
      p_end_date: end_date,
      p_period: period,
    }))
  }

  async bestSellingProducts({ start_date, end_date }) {
    return unwrapSupabase(await this.client.rpc("get_best_selling_products", {
      p_start_date: start_date,
      p_end_date: end_date,
    }))
  }
}
