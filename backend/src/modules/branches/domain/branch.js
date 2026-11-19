export function toBranchDto(branch) {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    status: branch.status,
    status_changed_at: branch.status_changed_at,
    closed_at: branch.closed_at ?? null,
    legal_entities: branch.legal_entities ?? [],
    created_at: branch.created_at,
    updated_at: branch.updated_at,
  }
}


export function toAvailableBranchDto(branch) {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    status: branch.status,
    status_changed_at: branch.status_changed_at,
    closed_at: branch.closed_at ?? null,
    legal_entities: (branch.legal_entities ?? []).map((entity) => ({
      id: entity.id,
      legal_name: entity.legal_name,
      commercial_name: entity.commercial_name ?? null,
    })),
    created_at: branch.created_at,
    updated_at: branch.updated_at,
  }
}
