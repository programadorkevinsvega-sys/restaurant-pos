import type { HttpClient } from "@/shared/infrastructure/http-client"
import type { LegalEntitiesResult, LegalEntity, LegalEntityInput } from "../domain/models"
import type { LegalEntityRepository } from "../domain/legal-entity-repository"

export class HttpLegalEntityRepository implements LegalEntityRepository {
  constructor(private readonly http: HttpClient) {}

  list(signal?: AbortSignal) {
    return this.http.get<LegalEntitiesResult>("/legal-entities", signal)
  }

  async create(input: LegalEntityInput) {
    const result = await this.http.post<{ legal_entity: LegalEntity }>("/legal-entities", input)
    return result.legal_entity
  }

  async update(id: string, input: LegalEntityInput) {
    const result = await this.http.patch<{ legal_entity: LegalEntity }>(
      `/legal-entities/${encodeURIComponent(id)}`,
      input,
    )
    return result.legal_entity
  }
}
