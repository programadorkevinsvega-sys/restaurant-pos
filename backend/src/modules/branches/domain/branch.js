export function toBranchDto(branch) {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    legal_entities: branch.legal_entities ?? [],
    created_at: branch.created_at,
    updated_at: branch.updated_at,
  }
}
