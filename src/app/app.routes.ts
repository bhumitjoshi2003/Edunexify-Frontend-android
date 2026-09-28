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
      { path: 'wisdom/manage', loadComponent: () => import('./components/wisdom/wisdom-admin.component').then(m => m.WisdomAdminComponent), canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN','SUB_ADMIN'], featureKey: 'WISDOM' } },
      {
        path: 'notifications',
        loadComponent: () => import('./components/notification-center/notification-center.component').then(m => m.NotificationCenterComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
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
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN'], featureKey: 'PAYMENT_COLLECTION' }
      },
      {
        path: 'payment-history/:studentId',
        loadComponent: () => import('./components/payment-history/payment-history.component').then(m => m.PaymentHistoryComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'PARENT'], featureKey: 'PAYMENT_COLLECTION' }
      },
      {
        path: 'payment-history-details/:paymentId',
        loadComponent: () => import('./components/payment-details/payment-details.component').then(m => m.PaymentDetailsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'ADMIN', 'PARENT'], featureKey: 'PAYMENT_COLLECTION' }
      },
      {
        path: 'apply-leave',
        loadComponent: () => import('./components/apply-leave/apply-leave.component').then(m => m.ApplyLeaveComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'PARENT'] }
      },
      {
        path: 'attendance-summary',
        loadComponent: () => import('./components/attendance-summary/attendance-summary.component').then(m => m.AttendanceSummaryComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
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
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },

      // ── Admin global search ───────────────────────────────────────────
      {
        path: 'student-search',
        loadComponent: () => import('./components/student-search/student-search.component').then(m => m.StudentSearchComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },

      // ── Shared list / detail routes (Teacher + Admin) ─────────────────
      {
        path: 'student-list',
        loadComponent: () => import('./components/student-list/student-list.component').then(m => m.StudentListComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'student-details/:studentId',
        loadComponent: () => import('./components/student-details/student-details.component').then(m => m.StudentDetailsComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN', 'STUDENT'] }
      },
      {
        path: 'view-leaves',
        loadComponent: () => import('./components/view-leaves/view-leaves.component').then(m => m.ViewLeavesComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'view-leaves/:studentId',
        loadComponent: () => import('./components/view-leaves/view-leaves.component').then(m => m.ViewLeavesComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'event-new',
        loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },
      {
        path: 'event-edit/:id',
        loadComponent: () => import('./components/event-form/event-form.component').then(m => m.EventFormComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },

      // ── Super Admin ───────────────────────────────────────────────────
      {
        path: 'super-admin-dashboard',
        loadComponent: () => import('./components/super-admin-dashboard/super-admin-dashboard.component').then(m => m.SuperAdminDashboardComponent),
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
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUB_ADMIN'] }
      },
      {
        path: 'holiday-calendar',
        loadComponent: () => import('./components/holiday-calendar/holiday-calendar.component').then(m => m.HolidayCalendarComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] }
      },
      {
        path: 'teacher-checkin',
        loadComponent: () => import('./components/teacher-checkin/teacher-checkin.component').then(m => m.TeacherCheckinComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER'] }
      },
      {
        path: 'staff-attendance',
        loadComponent: () => import('./components/staff-attendance/staff-attendance.component').then(m => m.StaffAttendanceComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },

      // ── Exams & Assessment ────────────────────────────────────────────
      {
        path: 'assessment-groups',
        loadComponent: () => import('./components/assessment-group-config/assessment-group-config.component').then(m => m.AssessmentGroupConfigComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'report-card-templates',
        loadComponent: () => import('./components/report-card-template-config/report-card-template-config.component').then(m => m.ReportCardTemplateConfigComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-card-remarks',
        loadComponent: () => import('./components/remarks-entry/remarks-entry.component').then(m => m.RemarksEntryComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'TEACHER'], featureKey: 'REPORT_CARD' }
      },
      // Published Report Cards: the Report Card V2 frozen documents (the Phase 0 bulk page is no longer routed).
      {
        path: 'bulk-report-cards',
        loadComponent: () => import('./components/report-card-v2/published/rc2-published.component').then(m => m.Rc2PublishedComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'class-overview',
        loadComponent: () => import('./components/class-overview/class-overview.component').then(m => m.ClassOverviewComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'TEACHER'], featureKey: 'REPORT_CARD' }
      },
      // ── Report Card V2 (setup, design, remarks, Generate & Preview, published documents; Phase 0 stays live) ──
      {
        path: 'report-cards-v2/setup',
        loadComponent: () => import('./components/report-card-v2/setup/rc2-setup.component').then(m => m.Rc2SetupComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-cards-v2/design',
        loadComponent: () => import('./components/report-card-v2/design/rc2-design.component').then(m => m.Rc2DesignComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-cards-v2/remarks',
        loadComponent: () => import('./components/report-card-v2/remarks/rc2-remarks.component').then(m => m.Rc2RemarksComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'TEACHER'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-cards-v2/generate',
        loadComponent: () => import('./components/report-card-v2/generate/rc2-generate.component').then(m => m.Rc2GenerateComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN', 'TEACHER'], featureKey: 'REPORT_CARD' }
      },
      // Published (frozen) report cards for students and parents; one document also opens for an admin.
      {
        path: 'report-card-documents',
        loadComponent: () => import('./components/report-card-v2/documents/rc2-my-report-cards.component').then(m => m.Rc2MyReportCardsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-card-documents/:id',
        loadComponent: () => import('./components/report-card-v2/documents/rc2-document-view.component').then(m => m.Rc2DocumentViewComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT', 'ADMIN'], featureKey: 'REPORT_CARD' }
      },

      // ── Admin-only routes ─────────────────────────────────────────────
      {
        path: 'payment-history-admin',
        loadComponent: () => import('./components/payment-history-admin/payment-history-admin.component').then(m => m.PaymentHistoryAdminComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'PAYMENT_COLLECTION' }
      },
      {
        path: 'fee-reminders',
        loadComponent: () => import('./components/fee-reminders/fee-reminders.component').then(m => m.FeeRemindersComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'FEE_REMINDERS' }
      },
      {
        path: 'teacher-list',
        loadComponent: () => import('./components/teacher-list/teacher-list.component').then(m => m.TeacherListComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN'] }
      },
      {
        path: 'teacher-details/:teacherId',
        loadComponent: () => import('./components/teacher-details/teacher-details.component').then(m => m.TeacherDetailsComponent),
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'TEACHER'] }
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
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'STUDENT_PROMOTION' }
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
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
      },
      {
        path: 'my-support-requests',
        loadComponent: () => import('./components/my-support-requests/my-support-requests.component').then(m => m.MySupportRequestsComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
      },
      {
        path: 'support-queue',
        loadComponent: () => import('./components/super-admin-support-queue/super-admin-support-queue.component').then(m => m.SuperAdminSupportQueueComponent),
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
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'exam-config',
        loadComponent: () => import('./components/exam-config/exam-config.component').then(m => m.ExamConfigComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'student-stream',
        loadComponent: () => import('./components/student-stream/student-stream.component').then(m => m.StudentStreamComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'elective-assignment',
        loadComponent: () => import('./components/elective-assignment/elective-assignment.component').then(m => m.ElectiveAssignmentComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'mark-entry',
        loadComponent: () => import('./components/mark-entry/mark-entry.component').then(m => m.MarkEntryComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['TEACHER', 'ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'my-results',
        loadComponent: () => import('./components/student-results/student-results.component').then(m => m.StudentResultsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'class-results',
        loadComponent: () => import('./components/class-results/class-results.component').then(m => m.ClassResultsComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['TEACHER', 'ADMIN'], featureKey: 'EXAM_MARKS' }
      },
      {
        path: 'report-card',
        loadComponent: () => import('./components/report-card/report-card.component').then(m => m.ReportCardComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['STUDENT', 'PARENT', 'TEACHER', 'ADMIN'], featureKey: 'REPORT_CARD' }
      },
      {
        path: 'report-card-gallery',
        loadComponent: () => import('./components/report-card-demo/report-card-demo.component').then(m => m.ReportCardDemoComponent),
        canActivate: [roleGuard, featureGuard], data: { roles: ['ADMIN'], featureKey: 'REPORT_CARD' }
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
        canActivate: [roleGuard], data: { roles: ['STUDENT'] }
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
        canActivate: [roleGuard], data: { roles: ['STUDENT'] }
      },

      // ── Assessments (SUB_ADMIN intentionally excluded) ──────────────
      {
        path: 'manage-assessments',
        loadComponent: () => import('./components/assessment-manage/assessment-manage.component').then(m => m.AssessmentManageComponent),
        canActivate: [roleGuard], data: { roles: ['TEACHER', 'ADMIN'] }
      },
      {
        path: 'assessments',
        loadComponent: () => import('./components/student-assessments/student-assessments.component').then(m => m.StudentAssessmentsComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT'] }
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
        canActivate: [roleGuard], data: { roles: ['ADMIN', 'SUB_ADMIN'] }
      },
      {
        path: 'timetable',
        loadComponent: () => import('./components/timetable/timetable.component').then(m => m.TimetableComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
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
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
      },
      {
        path: 'event-calendar',
        loadComponent: () => import('./components/event-calendar/event-calendar.component').then(m => m.EventCalendarComponent),
        canActivate: [roleGuard], data: { roles: ['STUDENT', 'TEACHER', 'ADMIN', 'SUB_ADMIN', 'PARENT'] }
      },
      {
        path: 'payment',
        loadComponent: () => import('./components/payment/payment.component').then(m => m.PaymentComponent),
        canActivate: [roleGuard, featureGuard],
        data: { roles: ['STUDENT', 'ADMIN'], featureKey: 'PAYMENT_COLLECTION' }
      },
    ],
  },

  { path: '**', redirectTo: '/home', pathMatch: 'full' },
];

export const AppRoutingModule = {
  provideRouter: () => provideRouter(routes),
};
