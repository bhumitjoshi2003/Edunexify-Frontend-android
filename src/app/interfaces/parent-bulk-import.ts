/** Mirrors the backend's ParentBulkImportDtos — a stateless two-call flow (preview, then
 *  confirm), no persisted staging table: both calls independently re-parse and re-validate
 *  the same uploaded file from scratch. */

export type RowStatus =
  | 'VALID_NEW_PARENT'
  | 'VALID_EXISTING_PARENT_MATCH'
  | 'CONFLICT_PHONE_MATCH_EMAIL_DIFFERS'
  | 'CONFLICT_EMAIL_MATCH_PHONE_DIFFERS'
  | 'INVALID_STUDENT_ID'
  | 'STUDENT_EXITED'
  | 'MISSING_REQUIRED_FIELD'
  | 'DUPLICATE_ROW_IN_FILE'
  | 'ALREADY_LINKED'
  /** The matched parent's link to this student ended — re-opened only if the admin chooses Restore. */
  | 'RESTORABLE';

export interface ParentImportRowPreview {
  row: number;
  parentName: string;
  phone: string;
  email: string;
  studentId: string;
  relationship: string;
  status: RowStatus;
  message: string;
  studentName: string | null;
  className: string | null;
  matchedParentId: string | null;
  siblingGroup: number | null;
}

export interface ParentImportPreviewResponse {
  totalRows: number;
  rows: ParentImportRowPreview[];
  newParentCount: number;
  existingParentMatchCount: number;
  conflictCount: number;
  invalidCount: number;
  duplicateCount: number;
}

export type RowAction = 'CREATE_NEW' | 'LINK_EXISTING' | 'SKIP' | 'RESTORE';

export interface RowResolution {
  action: RowAction;
  existingParentId: string | null;
}

/** Keyed by row number (as a string — JSON object keys are always strings). */
export type ParentImportResolutions = Record<string, RowResolution>;

export interface ParentImportConfirmedRow {
  row: number;
  parentId: string;
  studentId: string;
  outcome: string;
}

export interface ParentImportConfirmResponse {
  totalRows: number;
  parentsCreated: number;
  relationshipsCreated: number;
  skipped: number;
  created: ParentImportConfirmedRow[];
  skippedRows: ParentImportRowPreview[];
  /** Per row: SUCCESS (linked / restored), WARNING (nothing written) or ERROR. Each row commits on its own. */
  results?: ParentImportRowResult[];
}

export interface ParentImportRowResult {
  row: number;
  outcome: 'SUCCESS' | 'WARNING' | 'ERROR';
  message: string;
  parentId: string | null;
  studentId: string;
}

/** Rows the admin can act on — everything else auto-proceeds (VALID_NEW_PARENT /
 *  VALID_EXISTING_PARENT_MATCH) or is always skipped regardless of any resolution
 *  (INVALID_STUDENT_ID / STUDENT_EXITED / MISSING_REQUIRED_FIELD / DUPLICATE_ROW_IN_FILE /
 *  ALREADY_LINKED — data-integrity issues, not identity ambiguity). */
export const RESOLVABLE_STATUSES: RowStatus[] = [
  'CONFLICT_PHONE_MATCH_EMAIL_DIFFERS',
  'CONFLICT_EMAIL_MATCH_PHONE_DIFFERS',
  'RESTORABLE',
];
