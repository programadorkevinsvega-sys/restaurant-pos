import type { LegalEntitiesResult, LegalEntity, LegalEntityInput } from "./models"

export interface LegalEntityRepository {
  list(signal?: AbortSignal): Promise<LegalEntitiesResult>
  create(input: LegalEntityInput): Promise<LegalEntity>
  update(id: string, input: LegalEntityInput): Promise<LegalEntity>
}
