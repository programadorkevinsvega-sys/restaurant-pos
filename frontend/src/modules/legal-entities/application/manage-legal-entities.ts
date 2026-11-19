import type { LegalEntityRepository } from "../domain/legal-entity-repository"
import type { LegalEntitiesResult, LegalEntity, LegalEntityInput } from "../domain/models"

export class ManageLegalEntities {
  constructor(private readonly repository: LegalEntityRepository) {}

  list(signal?: AbortSignal): Promise<LegalEntitiesResult> {
    return this.repository.list(signal)
  }

  create(input: LegalEntityInput): Promise<LegalEntity> {
    return this.repository.create(input)
  }

  update(id: string, input: LegalEntityInput): Promise<LegalEntity> {
    return this.repository.update(id, input)
  }
}
