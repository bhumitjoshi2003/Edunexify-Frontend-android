/** Fulfilment stages, in order; REJECTED closes a request from any open stage. */
export type AccountDeletionRequestStatus =
  | 'PENDING' | 'IDENTITY_VERIFIED' | 'IN_REVIEW' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export const ACCOUNT_DELETION_STATUSES: AccountDeletionRequestStatus[] =
  ['PENDING', 'IDENTITY_VERIFIED', 'IN_REVIEW', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'];

export const ACCOUNT_DELETION_STATUS_LABELS: Record<AccountDeletionRequestStatus, string> = {
  PENDING: 'Received',
  IDENTITY_VERIFIED: 'Identity verified',
  IN_REVIEW: 'Awaiting school review',
  APPROVED: 'Approved for deletion',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  REJECTED: 'Not fulfilled',
};

/** The one stage that may follow each open stage (besides REJECTED). Mirrors the backend. */
export const ACCOUNT_DELETION_NEXT_STATUS: Partial<Record<AccountDeletionRequestStatus, AccountDeletionRequestStatus>> = {
  PENDING: 'IDENTITY_VERIFIED',
  IDENTITY_VERIFIED: 'IN_REVIEW',
  IN_REVIEW: 'APPROVED',
  APPROVED: 'PROCESSING',
  PROCESSING: 'COMPLETED',
};

export function isOpenDeletionStatus(status: AccountDeletionRequestStatus): boolean {
  return status !== 'COMPLETED' && status !== 'REJECTED';
}

/** The requester's own view — the backend never sends the internal review note here. */
export interface AccountDeletionRequest {
  reference: string;
  status: AccountDeletionRequestStatus;
  requestedAt: string;
  resolvedAt: string | null;
  userMessage: string | null;
}

/** SUPER_ADMIN review view. */
export interface AccountDeletionRequestAdminView {
  id: number;
  reference: string;
  schoolId: number;
  schoolName: string | null;
  userId: string;
  userRole: string;
  platform: 'WEB' | 'ANDROID';
  status: AccountDeletionRequestStatus;
  reason: string | null;
  userMessage: string | null;
  internalNote: string | null;
  retainedData: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDeletionStatusUpdate {
  status: AccountDeletionRequestStatus;
  userMessage: string | null;
  internalNote: string | null;
  retainedData: string | null;
  /** Required to complete: every agreed deletion/anonymisation step was carried out. */
  fulfilmentConfirmed: boolean;
}

/** Live check of the requester's access; completion needs accessRemoved. */
export interface AccountDeletionAccessCheck {
  login: 'ACTIVE' | 'INACTIVE' | 'REMOVED' | 'OTHER_SCHOOL';
  activeSessions: number;
  pushTokens: number;
  accessRemoved: boolean;
}

export interface AccountDeletionAccessRevocation {
  sessionsRevoked: number;
  pushTokensRemoved: number;
  after: AccountDeletionAccessCheck;
}

export interface AccountDeletionRequestPage {
  content: AccountDeletionRequestAdminView[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
