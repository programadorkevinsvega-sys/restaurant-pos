export class OperationsRepository {
  async listTables(branchId, userId) { throw new Error("Not implemented") }
  async createTable(input, branchId, userId) { throw new Error("Not implemented") }
  async updateTable(id, input, branchId, userId) { throw new Error("Not implemented") }
  async listReservations(filters, branchId, userId) { throw new Error("Not implemented") }
  async createReservation(input, branchId, userId) { throw new Error("Not implemented") }
  async updateReservation(id, status, branchId, userId) { throw new Error("Not implemented") }
  async listDeliveries(status, branchId, userId) { throw new Error("Not implemented") }
  async assignDriver(input, branchId, userId) { throw new Error("Not implemented") }
  async getSettings() { throw new Error("Not implemented") }
  async updateSettings(input) { throw new Error("Not implemented") }
}
