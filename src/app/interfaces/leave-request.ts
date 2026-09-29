/** What a student or parent sends to apply for leave: only the day and the reason. The server
 *  sets the student, class, school and status (always PENDING) itself. */
export interface LeaveRequest {
  leaveDate: string;
  reason: string;
}