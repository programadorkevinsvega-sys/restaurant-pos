import { AppError } from "../../../shared/domain/app-error.js"
import { unwrapSupabase } from "../../../shared/infrastructure/unwrap-supabase.js"
import { OperationsRepository } from "../domain/operations-repository.js"

export class SupabaseOperationsRepository extends OperationsRepository {
  constructor(client) {
    super()
    this.client = client
  }

  async listTables() {
    return unwrapSupabase(await this.client
      .from("tables")
      .select("id,number,capacity,status,current_order:orders!tables_current_order_id_fkey(id,total_amount,status,created_at)")
      .order("number")
      .limit(100))
  }

  async createTable(input) {
    return unwrapSupabase(await this.client.from("tables").insert(input)
      .select("id,number,capacity,status").single())
  }

  async updateTable(id, input) {
    const result = await this.client.from("tables").update(input).eq("id", id)
      .select("id,number,capacity,status,current_order_id").maybeSingle()
    const table = unwrapSupabase(result)
    if (!table) throw new AppError(404, "NOT_FOUND", "Mesa no encontrada.")
    return table
  }

  async listReservations({ date, status }) {
    let query = this.client
      .from("reservations")
      .select("id,customer_name,customer_phone,customer_email,table_id,reservation_date,party_size,notes,status,table:tables(id,number,capacity)")
      .order("reservation_date")
      .limit(100)
    if (date) {
      query = query.gte("reservation_date", `${date}T00:00:00Z`).lt("reservation_date", `${date}T23:59:59.999Z`)
    }
    if (status) query = query.eq("status", status)
    return unwrapSupabase(await query)
  }

  async createReservation(input) {
    return unwrapSupabase(await this.client.from("reservations").insert(input)
      .select("id,customer_name,customer_phone,customer_email,table_id,reservation_date,party_size,notes,status")
      .single())
  }

  async updateReservation(id, status) {
    const result = await this.client.from("reservations").update({ status }).eq("id", id)
      .select("id,customer_name,customer_phone,customer_email,table_id,reservation_date,party_size,notes,status")
      .maybeSingle()
    const reservation = unwrapSupabase(result)
    if (!reservation) throw new AppError(404, "NOT_FOUND", "Reservación no encontrada.")
    return reservation
  }

  async listDeliveries(status) {
    let query = this.client
      .from("orders")
      .select("id,customer_name,table_number,total_amount,status,created_at,order_items(id,quantity,price_at_order,products(id,name,image_url)),delivery_info(address,phone,delivery_fee,estimated_time,driver_name,driver_phone,status)")
      .eq("order_type", "A domicilio")
      .order("created_at", { ascending: false })
      .limit(100)
    if (status) query = query.eq("status", status)
    return unwrapSupabase(await query)
  }

  async assignDriver({ order_id, driver_name, driver_phone, estimated_time }) {
    const result = await this.client.rpc("assign_delivery_driver", {
      p_order_id: order_id,
      p_driver_name: driver_name,
      p_driver_phone: driver_phone ?? null,
      p_estimated_time: estimated_time ?? null,
    })
    return unwrapSupabase(result)
  }

  async getSettings() {
    const data = unwrapSupabase(await this.client.from("settings").select("key,value").limit(100))
    return Object.fromEntries(data.map(({ key, value }) => [key, value]))
  }

  async updateSettings(settings) {
    const updates = Object.entries(settings).map(([key, value]) => ({ key, value }))
    const data = unwrapSupabase(await this.client.from("settings").upsert(updates, { onConflict: "key" })
      .select("key,value"))
    return { message: "Configuración actualizada exitosamente", data }
  }
}
