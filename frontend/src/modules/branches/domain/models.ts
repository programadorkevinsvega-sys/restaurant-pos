export interface BranchLegalEntity {
  id: string
  legal_name: string
  commercial_name: string | null
  tax_country_code: string
  tax_identifier_type: string
  tax_identifier: string
}

export type BranchStatus = "active" | "suspended" | "closed"

export interface Branch {
  id: string
  code: string
  name: string
  status: BranchStatus
  status_changed_at: string
  closed_at: string | null
  legal_entities: BranchLegalEntity[]
  created_at: string
  updated_at: string
}

export interface BranchInput {
  code: string
  name: string
  legal_entity_ids: string[]
}

export interface BranchUpdate {
  code: string
  name: string
}

export interface BranchesResult {
  branches: Branch[]
  permissions: {
    can_manage: boolean
  }
}

 
export interface OperationalBranchLegalEntity {
  id: string
  legal_name: string
  commercial_name: string | null
}

export interface OperationalBranch {
  id: string
  code: string
  name: string
  status: BranchStatus
  status_changed_at: string
  closed_at: string | null
  legal_entities: OperationalBranchLegalEntity[]
  created_at: string
  updated_at: string
}

export interface AvailableBranchesResult {
  branches: OperationalBranch[]
}

export interface BranchUser {
  id: string
  email: string
  role: "staff" | "admin"
  assigned: boolean
}

export interface BranchUsersResult {
  users: BranchUser[]
}


export interface BranchLifecycleEvent {
  id: string
  previous_status: BranchStatus | null
  new_status: BranchStatus
  actor_user_id: string
  actor_email: string
  occurred_at: string
}

export interface BranchLifecycleResult {
  events: BranchLifecycleEvent[]
}
