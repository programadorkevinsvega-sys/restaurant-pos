export type ProductOptionGroupKind = "presentation" | "modifier"
export type BranchOptionState = "inherited" | "enabled" | "disabled"

export interface ProductOption {
  id: string
  name: string
  position: number
  is_active: boolean
}

export interface ProductOptionGroup {
  id: string
  product_id: string
  kind: ProductOptionGroupKind
  name: string
  min_selections: number
  max_selections: number
  position: number
  is_active: boolean
  options: ProductOption[]
}

export interface ProductOptionConfiguration {
  product_id: string
  product_name: string
  groups: ProductOptionGroup[]
}

export interface ProductOptionSelection {
  id: string
  name: string
  group_id: string
  group_name: string
  group_kind: ProductOptionGroupKind
}

export interface PosProductOption {
  id: string
  name: string
  position: number
}

export interface PosProductOptionGroup {
  id: string
  kind: ProductOptionGroupKind
  name: string
  min_selections: number
  max_selections: number
  position: number
  options: PosProductOption[]
}

export interface BranchOptionOverride {
  product_id: string
  product_name: string
  group_id: string
  group_name: string
  kind: ProductOptionGroupKind
  min_selections: number
  max_selections: number
  group_is_active: boolean
  option_id: string
  option_name: string
  position: number
  option_is_active: boolean
  state: BranchOptionState
  effective_enabled: boolean
  reason: string | null
  changed_by_user_id: string | null
  changed_by_email: string | null
  updated_at: string | null
  product_enabled: boolean
}

export interface BranchOptionEvent {
  sequence: string
  product_id: string
  option_id: string
  option_name: string
  group_name: string
  previous_state: BranchOptionState
  new_state: BranchOptionState
  reason: string
  actor_user_id: string
  actor_email: string
  occurred_at: string
}

export interface BranchProductOptions {
  branch: { id: string; name: string; code: string; status: "active" | "suspended" | "closed" }
  options: BranchOptionOverride[]
  events: BranchOptionEvent[]
}

export interface ProductOptionGroupInput {
  kind: ProductOptionGroupKind
  name: string
  min_selections: number
  max_selections: number
  position: number
  is_active: boolean
}

export interface ProductOptionInput {
  name: string
  position: number
  is_active: boolean
}
