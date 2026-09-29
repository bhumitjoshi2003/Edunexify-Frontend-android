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
}

export interface TeacherLeaveApplyRequest {
  startDate: string;
  endDate: string;
  reason: string;
}
