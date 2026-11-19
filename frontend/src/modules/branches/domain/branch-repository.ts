import type {
  AvailableBranchesResult,
  Branch,
  BranchCalendarExceptionInput,
  BranchCalendarResult,
  BranchInput,
  BranchLifecycleResult,
  BranchLocalConfiguration,
  BranchStatus,
  BranchesResult,
  BranchUpdate,
  BranchUsersResult,
} from "./models"

export interface BranchRepository {
  list(signal?: AbortSignal): Promise<BranchesResult>
  listAvailable(signal?: AbortSignal): Promise<AvailableBranchesResult>
  listUsers(branchId: string, signal?: AbortSignal): Promise<BranchUsersResult>
  assignUser(branchId: string, userId: string): Promise<BranchUsersResult>
  removeUser(branchId: string, userId: string): Promise<BranchUsersResult>
  changeStatus(id: string, status: BranchStatus): Promise<Branch>
  listLifecycleEvents(branchId: string, signal?: AbortSignal): Promise<BranchLifecycleResult>
  updateLocalConfiguration(id: string, input: BranchLocalConfiguration): Promise<Branch>
  listCalendar(branchId: string, from: string, to: string, signal?: AbortSignal): Promise<BranchCalendarResult>
  upsertCalendarException(branchId: string, localDate: string, input: BranchCalendarExceptionInput): Promise<void>
  deleteCalendarException(branchId: string, localDate: string): Promise<void>
  create(input: BranchInput): Promise<Branch>
  update(id: string, input: BranchUpdate): Promise<Branch>
  assignLegalEntity(branchId: string, legalEntityId: string): Promise<Branch>
  removeLegalEntity(branchId: string, legalEntityId: string): Promise<Branch>
}
