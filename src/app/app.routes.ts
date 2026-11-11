import { principalCapabilityGuard } from './auth/principal-capability.guard';
import { provideRouter, Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { roleGuard } from './auth/role.guard';
import { featureGuard } from './auth/feature.guard';
import { passwordChangeGuard } from './auth/password-change.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },

  {
    path: 'home',
    loadComponent: () => import('./components/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./components/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./components/legal/privacy-policy-page.component').then(m => m.PrivacyPolicyPageComponent)
  },
  {
    path: 'account-deletion',
    loadComponent: () => import('./components/legal/account-deletion-page.component').then(m => m.AccountDeletionPageComponent)
  },
  {
    path: 'change-initial-password',
    loadComponent: () => import('./components/change-initial-password/change-initial-password.component').then(m => m.ChangeInitialPasswordComponent),
    canActivate: [passwordChangeGuard]
  },
  {
    path: 'verify-rc',
    loadComponent: () => import('./components/verify-rc/verify-rc.component').then(m => m.VerifyRcComponent)
  },

  {
    path: 'dashboard',
    loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'report-card-approvals',
        loadComponent: () => import('./components/report-card-approvals/report-card-approvals.component').then(m => m.ReportCardApprovalsComponent),
        canActivate: [roleGuard, featureGuard], data: { featureKey: 'REPORT_CARDS', roles: ['ADMIN', 'TEACHER', 'PRINCIPAL'] }
      },
      {
        path: 'my-signature',
        loadComponent: () => import('./components/signature-settings/signature-settings.component').then(m => m.SignatureSettingsComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'PRINCIPAL'] }
      },
      // ── Academic Coordinator (a TEACHER account with an active appointment) ──
      {
        path: 'coordinator-dashboard',
        loadComponent: () => import('./components/coordinator-dashboard/coordinator-dashboard.component').then(m => m.CoordinatorDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['COORDINATOR'] }
      },
      {
        // Report card review: one feature for the Principal (school-wide) and an Academic Coordinator
        // (their scope). It is oversight only and independent of the approval workflow.
        path: 'report-card-review',
        loadComponent: () => import('./components/coordinator-report-cards/coordinator-report-cards.component').then(m => m.CoordinatorReportCardsComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'REPORT_CARD_REVIEW', roles: ['PRINCIPAL', 'COORDINATOR'], featureKey: 'REPORT_CARDS' }
      },
      { path: 'coordinator-report-cards', redirectTo: 'report-card-review', pathMatch: 'full' },
      {
        path: 'coordinator-timetable',
        loadComponent: () => import('./components/timetable/timetable.component').then(m => m.TimetableComponent),
        canActivate: [roleGuard], data: { roles: ['COORDINATOR'], coordinatorMode: true }
      },
      {
        path: 'coordinator-attendance',
        loadComponent: () => import('./components/teacher-attendance/teacher-attendance.component').then(m => m.TeacherAttendanceComponent),
        canActivate: [roleGuard], data: { roles: ['COORDINATOR'], coordinatorMode: true }
      },
      {
        path: 'coordinator-management',
        loadComponent: () => import('./components/coordinator-management/coordinator-management.component').then(m => m.CoordinatorManagementComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'COORDINATOR_MANAGE', roles: ['ADMIN', 'PRINCIPAL'] }
      },
      {
        path: 'principal-dashboard',
        loadComponent: () => import('./components/principal-dashboard/principal-dashboard.component').then(m => m.PrincipalDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['PRINCIPAL'] }
      },
      {
        path: 'principal-profile',
        loadComponent: () => import('./components/principal-my-profile/principal-my-profile.component').then(m => m.PrincipalMyProfileComponent),
        canActivate: [roleGuard], data: { roles: ['PRINCIPAL'] }
      },
      {
        path: 'principal-management',
        loadComponent: () => import('./components/principal-management/principal-management.component').then(m => m.PrincipalManagementComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },
      { path: 'wisdom/manage', loadComponent: () => import('./components/wisdom/wisdom-admin.component').then(m => m.WisdomAdminComponent), canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN','SUB_ADMIN'], featureKey: 'THOUGHT_OF_THE_DAY' } },
      {
        path: 'notifications',
        loadComponent: () => import('./components/notification-center/notification-center.component').then(m => m.NotificationCenterComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'OWN_INBOX', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'SUPER_ADMIN', 'PRINCIPAL'] }
      },
      // ── Student routes ────────────────────────────────────────────────
      {
        path: 'fees',
        loadComponent: () => import('./components/fees/fees.component').then(m => m.PaymentTrackerComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'fees/:studentId',
        loadComponent: () => import('./components/fees/fees.component').then(m => m.PaymentTrackerComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'PARENT'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'payment-history',
        loadComponent: () => import('./components/payment-history/payment-history.component').then(m => m.PaymentHistoryComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN'], featureKey: 'ONLINE_PAYMENTS' }
      },
      {
        path: 'payment-history/:studentId',
        loadComponent: () => import('./components/payment-history/payment-history.component').then(m => m.PaymentHistoryComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'PARENT'], featureKey: 'ONLINE_PAYMENTS' }
      },
      {
        path: 'payment-history-details/:paymentId',
        loadComponent: () => import('./components/payment-details/payment-details.component').then(m => m.PaymentDetailsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN', 'PARENT'], featureKey: 'ONLINE_PAYMENTS' }
      },
      {
        path: 'apply-leave',
        loadComponent: () => import('./components/apply-leave/apply-leave.component').then(m => m.ApplyLeaveComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'PARENT'] }
      },
      {
        path: 'attendance-summary',
        loadComponent: () => import('./components/attendance-summary/attendance-summary.component').then(m => m.AttendanceSummaryComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'ATTENDANCE_READ', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },

      // ── Teacher routes ────────────────────────────────────────────────
      {
        path: 'teacher-attendance',
        loadComponent: () => import('./components/teacher-attendance/teacher-attendance.component').then(m => m.TeacherAttendanceComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'apply-teacher-leave',
        loadComponent: () => import('./components/apply-teacher-leave/apply-teacher-leave.component').then(m => m.ApplyTeacherLeaveComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },
      {
        path: 'teacher-leave-requests',
        loadComponent: () => import('./components/teacher-leave-requests/teacher-leave-requests.component').then(m => m.TeacherLeaveRequestsComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TEACHER_LEAVE_DECIDE', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'] }
      },

      // ── Admin global search ───────────────────────────────────────────
      {
        path: 'student-search',
        loadComponent: () => import('./components/student-search/student-search.component').then(m => m.StudentSearchComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'STUDENT_READ', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'] }
      },

      // ── Shared list / detail routes (Teacher + Admin) ─────────────────
      {
        path: 'student-list',
        loadComponent: () => import('./components/student-list/student-list.component').then(m => m.StudentListComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'STUDENT_READ', roles: ['TEACHER', 'ADMIN', 'PRINCIPAL'] }
      },
      {
        path: 'student-details/:studentId',
        loadComponent: () => import('./components/student-details/student-details.component').then(m => m.StudentDetailsComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'STUDENT_READ', roles: ['TEACHER', 'ADMIN', 'STUDENT', 'PRINCIPAL'] }
      },
      {
        path: 'view-leaves',
        loadComponent: () => import('./components/view-leaves/view-leaves.component').then(m => m.ViewLeavesComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'STUDENT_LEAVE_DECIDE', roles: ['TEACHER', 'ADMIN', 'PRINCIPAL'] }
      },
      {
        path: 'view-leaves/:studentId',
        loadComponent: () => import('./components/view-leaves/view-leaves.component').then(m => m.ViewLeavesComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'event-new',
        loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'COMMUNICATION_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'SCHOOL_COMMUNICATION' }
      },
      {
        path: 'event-edit/:id',
        loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'COMMUNICATION_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'SCHOOL_COMMUNICATION' }
      },

      // ── Super Admin ───────────────────────────────────────────────────
      {
        path: 'super-admin-dashboard',
        loadComponent: () => import('./components/super-admin-dashboard/super-admin-dashboard.component').then(m => m.SuperAdminDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },
      {
        path: 'payment-pricing',
        loadComponent: () => import('./components/payment-pricing/payment-pricing.component').then(m => m.PaymentPricingComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },
      {
        path: 'payment-gateways',
        loadComponent: () => import('./components/super-admin-payment-gateways/super-admin-payment-gateways.component').then(m => m.SuperAdminPaymentGatewaysComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },

      // ── School settings ───────────────────────────────────────────────
      {
        path: 'school-settings',
        loadComponent: () => import('./components/school-settings/school-settings.component').then(m => m.SchoolSettingsComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },
      {
        path: 'knowledge-base',
        loadComponent: () => import('./components/knowledge-base/knowledge-base.component').then(m => m.KnowledgeBaseComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'AI_COPILOT' }
      },
      {
        path: 'class-management',
        loadComponent: () => import('./components/class-management/class-management.component').then(m => m.ClassManagementComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'ACADEMIC_CONFIGURATION_EDIT', roles: ['ADMIN', 'SUB_ADMIN', 'PRINCIPAL'] }
      },
      {
        path: 'holiday-calendar',
        loadComponent: () => import('./components/holiday-calendar/holiday-calendar.component').then(m => m.HolidayCalendarComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'COMMUNICATION_READ', roles: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'teacher-checkin',
        loadComponent: () => import('./components/teacher-checkin/teacher-checkin.component').then(m => m.TeacherCheckinComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },
      {
        path: 'staff-attendance',
        loadComponent: () => import('./components/staff-attendance/staff-attendance.component').then(m => m.StaffAttendanceComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TEACHER_ATTENDANCE_CORRECT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'] }
      },

      // ── Exams & Assessment ────────────────────────────────────────────
      {
        path: 'assessment-groups',
        loadComponent: () => import('./components/assessment-group-config/assessment-group-config.component').then(m => m.AssessmentGroupConfigComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'ACADEMIC_CONFIGURATION_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'EXAMS_RESULTS' }
      },
      // Published Report Cards: the Report Card V2 frozen documents (the Phase 0 bulk page is no longer routed).
      {
        path: 'bulk-report-cards',
        loadComponent: () => import('./components/report-card-v2/published/rc2-published.component').then(m => m.Rc2PublishedComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARDS' }
      },
      // ── Current report-card workflow: setup, design, remarks, approval and issued documents ──
      {
        path: 'report-cards-v2/setup',
        loadComponent: () => import('./components/report-card-v2/setup/rc2-setup.component').then(m => m.Rc2SetupComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'REPORT_CARD_CONFIGURATION_EDIT', roles: ['ADMIN', 'PRINCIPAL'], featureKey: 'REPORT_CARDS' }
      },
      {
        path: 'report-cards-v2/design',
        loadComponent: () => import('./components/report-card-v2/design/rc2-design.component').then(m => m.Rc2DesignComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'REPORT_CARD_CONFIGURATION_EDIT', roles: ['ADMIN', 'PRINCIPAL'], featureKey: 'REPORT_CARDS' }
      },
      {
        path: 'report-cards-v2/remarks',
        loadComponent: () => import('./components/report-card-v2/remarks/rc2-remarks.component').then(m => m.Rc2RemarksComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'REPORT_CARD_REMARKS_EDIT', roles: ['ADMIN', 'TEACHER', 'PRINCIPAL'], featureKey: 'REPORT_CARDS' }
      },
      {
        path: 'report-cards-v2/generate',
        loadComponent: () => import('./components/report-card-v2/generate/rc2-generate.component').then(m => m.Rc2GenerateComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'TEACHER'], featureKey: 'REPORT_CARDS' }
      },
      // Published (frozen) report cards for students and parents; one document also opens for an admin.
      {
        path: 'report-card-documents',
        loadComponent: () => import('./components/report-card-v2/documents/rc2-my-report-cards.component').then(m => m.Rc2MyReportCardsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT'], featureKey: 'REPORT_CARDS' }
      },
      {
        path: 'report-card-documents/:id',
        loadComponent: () => import('./components/report-card-v2/documents/rc2-document-view.component').then(m => m.Rc2DocumentViewComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'ISSUED_REPORT_CARD_READ', roles: ['STUDENT', 'PARENT', 'ADMIN', 'PRINCIPAL'], featureKey: 'REPORT_CARDS' }
      },

      // ── Admin-only routes ─────────────────────────────────────────────
      {
        path: 'payment-history-admin',
        loadComponent: () => import('./components/payment-history-admin/payment-history-admin.component').then(m => m.PaymentHistoryAdminComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'ONLINE_PAYMENTS' }
      },
      {
        path: 'fee-reminders',
        loadComponent: () => import('./components/fee-reminders/fee-reminders.component').then(m => m.FeeRemindersComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_REMINDERS' }
      },
      {
        path: 'teacher-list',
        loadComponent: () => import('./components/teacher-list/teacher-list.component').then(m => m.TeacherListComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TEACHER_READ', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'] }
      },
      {
        path: 'teacher-details/:teacherId',
        loadComponent: () => import('./components/teacher-details/teacher-details.component').then(m => m.TeacherDetailsComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TEACHER_READ', roles: ['ADMIN', 'TEACHER', 'PRINCIPAL'] }
      },
      {
        path: 'register',
        loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },
      {
        path: 'student-bulk-import',
        loadComponent: () => import('./components/bulk-import/bulk-import.component').then(m => m.BulkImportComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'BULK_IMPORT' }
      },
      {
        path: 'student-promotion',
        loadComponent: () => import('./components/student-promotion/student-promotion.component').then(m => m.StudentPromotionComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'SCHOOL_ADMINISTRATION' }
      },
      {
        path: 'teacher-bulk-import',
        loadComponent: () => import('./components/teacher-bulk-import/teacher-bulk-import.component').then(m => m.TeacherBulkImportComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'BULK_IMPORT' }
      },

      // ── Admin + Super Admin routes ─────────────────────────────────────
      {
        path: 'admin-list',
        loadComponent: () => import('./components/admin-list/admin-list.component').then(m => m.AdminListComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUPER_ADMIN'] }
      },
      {
        path: 'admin-details/:adminId',
        loadComponent: () => import('./components/admin-details/admin-details.component').then(m => m.AdminDetailsComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUPER_ADMIN'] }
      },
      {
        path: 'register-admin',
        loadComponent: () => import('./components/register-admin/register-admin.component').then(m => m.RegisterAdminComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUPER_ADMIN'] }
      },

      // ── Help & Support — every normal role reports to Edunexify platform support
      //    directly, never to their own school admin. SUPER_ADMIN receives these tickets via
      //    the support-queue route only. ────────────────────────────────
      {
        path: 'report-problem',
        loadComponent: () => import('./components/report-support-ticket/report-support-ticket.component').then(m => m.ReportSupportTicketComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'OWN_SUPPORT', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'account-deletion-request',
        loadComponent: () => import('./components/account-deletion-request/account-deletion-request.component').then(m => m.AccountDeletionRequestComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
      },
      {
        path: 'my-support-requests',
        loadComponent: () => import('./components/my-support-requests/my-support-requests.component').then(m => m.MySupportRequestsComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'OWN_SUPPORT', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'support-queue',
        loadComponent: () => import('./components/super-admin-support-queue/super-admin-support-queue.component').then(m => m.SuperAdminSupportQueueComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },
      {
        path: 'deletion-requests',
        loadComponent: () => import('./components/super-admin-deletion-requests/super-admin-deletion-requests.component').then(m => m.SuperAdminDeletionRequestsComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },
      {
        path: 'notification-deliveries',
        loadComponent: () => import('./components/notification-delivery-log/notification-delivery-log.component').then(m => m.NotificationDeliveryLogComponent),
        canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] }
      },
      {
        path: 'audit-logs',
        loadComponent: () => import('./components/audit-logs/audit-logs.component').then(m => m.AuditLogsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'AUDIT_LOGS' }
      },
      {
        path: 'fee-structure',
        loadComponent: () => import('./components/fee-structure/fee-structure.component').then(m => m.FeeStructureComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN', 'PARENT'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'bus-fees',
        loadComponent: () => import('./components/bus-fees/bus-fees.component').then(m => m.BusFeesComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'STUDENT', 'PARENT'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'fee-assignment',
        loadComponent: () => import('./components/fee-assignment/fee-assignment.component').then(m => m.FeeAssignmentComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_MANAGEMENT' }
      },

      // ── New Fee System (invoice-based) ────────────────────────────────
      {
        path: 'fee-head-management',
        loadComponent: () => import('./components/fee-head-management/fee-head-management.component').then(m => m.FeeHeadManagementComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'fee-rule-config',
        loadComponent: () => import('./components/fee-rule-config/fee-rule-config.component').then(m => m.FeeRuleConfigComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_MANAGEMENT' }
      },
      {
        path: 'fee-recalculation',
        loadComponent: () => import('./components/fee-recalculation/fee-recalculation.component').then(m => m.FeeRecalculationComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_MANAGEMENT' }
      },

      // ── Exam / Results ────────────────────────────────────────────────
      {
        path: 'subject-config',
        loadComponent: () => import('./components/subject-config/subject-config.component').then(m => m.SubjectConfigComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'ACADEMIC_CONFIGURATION_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'SCHOOL_ADMINISTRATION' }
      },
      {
        path: 'exam-config',
        loadComponent: () => import('./components/exam-config/exam-config.component').then(m => m.ExamConfigComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'ACADEMIC_CONFIGURATION_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'EXAMS_RESULTS' }
      },
      {
        path: 'student-stream',
        loadComponent: () => import('./components/student-stream/student-stream.component').then(m => m.StudentStreamComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'STUDENT_ACADEMIC_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'EXAMS_RESULTS' }
      },
      {
        path: 'elective-assignment',
        loadComponent: () => import('./components/elective-assignment/elective-assignment.component').then(m => m.ElectiveAssignmentComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'STUDENT_ACADEMIC_EDIT', roles: ['ADMIN', 'PRINCIPAL', 'COORDINATOR'], featureKey: 'EXAMS_RESULTS' }
      },
      {
        path: 'mark-entry',
        loadComponent: () => import('./components/mark-entry/mark-entry.component').then(m => m.MarkEntryComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'MARKS_CORRECT', roles: ['TEACHER', 'ADMIN', 'PRINCIPAL'], featureKey: 'EXAMS_RESULTS' }
      },
      {
        path: 'my-results',
        loadComponent: () => import('./components/student-results/student-results.component').then(m => m.StudentResultsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT'], featureKey: 'EXAMS_RESULTS' }
      },
      {
        path: 'class-results',
        loadComponent: () => import('./components/class-results/class-results.component').then(m => m.ClassResultsComponent),
        canActivate: [roleGuard, principalCapabilityGuard, featureGuard], data: { principalOperation: 'RESULTS_READ', roles: ['TEACHER', 'ADMIN', 'PRINCIPAL'], featureKey: 'EXAMS_RESULTS' }
      },

      // ── Parent portal ────────────────────────────────────────────────
      {
        path: 'parent-portal',
        loadComponent: () => import('./components/parent-portal/parent-portal.component').then(m => m.ParentPortalComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'PARENT'], featureKey: 'PARENT_PORTAL' }
      },
      {
        path: 'parent-portal/:parentId',
        loadComponent: () => import('./components/parent-detail/parent-detail.component').then(m => m.ParentDetailComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'PARENT_PORTAL' }
      },
      {
        path: 'parent-bulk-import',
        loadComponent: () => import('./components/parent-bulk-import/parent-bulk-import.component').then(m => m.ParentBulkImportComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'PARENT_PORTAL' }
      },
      {
        path: 'parent-dashboard',
        loadComponent: () => import('./components/parent-portal/parent-portal.component').then(m => m.ParentPortalComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['PARENT'], featureKey: 'PARENT_PORTAL' }
      },

      // ── Student Dashboard ────────────────────────────────────────────
      {
        path: 'student-dashboard',
        loadComponent: () => import('./components/student-dashboard/student-dashboard.component').then(m => m.StudentDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT'] }
      },

      // ── Teacher Dashboard ────────────────────────────────────────────
      {
        path: 'teacher-dashboard',
        loadComponent: () => import('./components/teacher-dashboard/teacher-dashboard.component').then(m => m.TeacherDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },

      // ── Homework & Classwork ──────────────────────────────────────────
      {
        path: 'homework-classwork',
        loadComponent: () => import('./components/teacher-homework/teacher-homework.component').then(m => m.TeacherHomeworkComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },
      {
        path: 'homework',
        loadComponent: () => import('./components/student-homework/student-homework.component').then(m => m.StudentHomeworkComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'PARENT'] }
      },

      // ── Class Updates ─────────────────────────────────────────────────
      {
        path: 'teacher-class-updates',
        loadComponent: () => import('./components/teacher-class-updates/teacher-class-updates.component').then(m => m.TeacherClassUpdatesComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },
      {
        path: 'class-updates',
        loadComponent: () => import('./components/student-class-updates/student-class-updates.component').then(m => m.StudentClassUpdatesComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'PARENT'] }
      },

      // ── Assessments (SUB_ADMIN intentionally excluded) ──────────────
      {
        path: 'manage-assessments',
        loadComponent: () => import('./components/assessment-manage/assessment-manage.component').then(m => m.AssessmentManageComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'ASSESSMENT_CALENDAR_EDIT', roles: ['TEACHER', 'ADMIN', 'PRINCIPAL'] }
      },
      {
        path: 'assessments',
        loadComponent: () => import('./components/student-assessments/student-assessments.component').then(m => m.StudentAssessmentsComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'PARENT'] }
      },

      // ── Admin Dashboard ───────────────────────────────────────────────
      {
        path: 'admin-dashboard',
        loadComponent: () => import('./components/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUB_ADMIN'] }
      },
      {
        path: 'staff-adoption',
        loadComponent: () => import('./components/staff-adoption/staff-adoption.component').then(m => m.StaffAdoptionComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },

      // ── Analytics Dashboard ───────────────────────────────────────────
      {
        path: 'analytics',
        loadComponent: () => import('./components/analytics/analytics.component').then(m => m.AnalyticsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'ANALYTICS' }
      },

      // ── Timetable ─────────────────────────────────────────────────────
      {
        path: 'teacher-substitutions',
        loadComponent: () => import('./components/teacher-substitution/teacher-substitution.component').then(m => m.TeacherSubstitutionComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TIMETABLE_READ', roles: ['ADMIN', 'SUB_ADMIN', 'PRINCIPAL', 'COORDINATOR'] }
      },
      {
        path: 'timetable',
        loadComponent: () => import('./components/timetable/timetable.component').then(m => m.TimetableComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'TIMETABLE_READ', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'timetable-bulk-import',
        loadComponent: () => import('./components/timetable-bulk-import/timetable-bulk-import.component').then(m => m.TimetableBulkImportComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'BULK_IMPORT' }
      },

      // ── Open to all authenticated users ──────────────────────────────
      {
        path: 'notice',
        loadComponent: () => import('./components/notice/notice.component').then(m => m.NoticeComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'COMMUNICATION_READ', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'event-calendar',
        loadComponent: () => import('./components/event-calendar/event-calendar.component').then(m => m.EventCalendarComponent),
        canActivate: [roleGuard, principalCapabilityGuard], data: { principalOperation: 'COMMUNICATION_READ', roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT', 'PRINCIPAL'] }
      },
      {
        path: 'payment',
        loadComponent: () => import('./components/payment/payment.component').then(m => m.PaymentComponent),
        canActivate: [roleGuard, featureGuard],
        data: { roles: ['STUDENT', 'ADMIN'], featureKey: 'ONLINE_PAYMENTS' }
      },
    ],
  },

  { path: '**', redirectTo: '/home', pathMatch: 'full' },
];

export const AppRoutingModule = {
  provideRouter: () => provideRouter(routes),
};
