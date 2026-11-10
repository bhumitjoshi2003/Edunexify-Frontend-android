import { LeaveEscalation } from '../utils/leave-escalation.util';

export interface TeacherLeave {
  id: number;
  teacherId: string;
  teacherName: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  appliedDate: string;
  days: number;
  decidedBy?: string | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  /** SYSTEM_AUTO_APPROVAL when the seven-day deadline approved it; null for a person's decision. */
  decisionSource?: string | null;
  /** Review-calendar state while PENDING (server-computed, school time zone). */
  escalation?: LeaveEscalation | null;
}

export interface TeacherLeaveApplyRequest {
  startDate: string;
  endDate: string;
  reason: string;
}
