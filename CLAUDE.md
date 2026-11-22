# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Edunexify** — a multi-tenant SaaS school management platform. Each school is fully isolated by `schoolId` (injected via `SecurityUtil.getSchoolId()` on every backend query). One backend deployment serves multiple schools.

Frontend: Angular 19 (standalone) + Capacitor Android app
Backend: Spring Boot at `/Applications/IAS/ias-management(backend)`
Prod API: `https://edunexify.co.in/api`
App ID: `in.edunexify.app`

---

## Commands

```bash
# Frontend
npm start                                          # Dev server (ng serve)
npm run build:android                              # Android build (ng build --configuration=android)
ng build                                           # Production build
ng build --watch --configuration development       # Dev build with watch
ng test                                            # Karma/Jasmine unit tests
node dist/ias/server/server.mjs                    # Serve SSR production build

# Capacitor (always run from project root, NOT from android/)
npx cap sync android                               # Sync web assets to Android
npx cap open android                               # Open Android Studio

# Android build (from android/ dir)
./gradlew --stop                                   # Kill stale daemons (run before builds if hanging)
./gradlew assembleRelease                          # Build unsigned APK
./gradlew bundleRelease                            # Build AAB for Play Store
```

---

## Architecture

### Frontend

**Angular 19 standalone components** — no NgModules. Every component declares its own `imports: []`. Bootstrapped via `bootstrapApplication()` in `main.ts`.

**Capacitor** wraps the app as a native Android app (`android/` directory). Always build Angular first (`npm run build:android`), then `npx cap sync android` from the **project root** before opening Android Studio.

### Routing

Single protected parent route `/dashboard` guarded by `authGuard`. All feature routes are lazy-loaded children. Public routes: `/home`, `/reset-password`. Route access is further restricted by `roleGuard` using `data: { roles: [...] }`.

**Role-to-route map:**
- `STUDENT` — fees, payment-history, apply-leave, attendance-summary, student-dashboard, my-results, report-card, timetable, notice, event-calendar, student-details (own)
- `TEACHER` — teacher-attendance, student-list, view-leaves, mark-entry, class-results, report-card, teacher-dashboard, timetable, notice, event-calendar, event-new/edit
- `ADMIN` — everything TEACHER has + register, student-bulk-import, teacher-bulk-import, teacher-list, fee-structure (edit), bus-fees (edit), fee-reminders, payment-history-admin, student-promotion, exam-config, subject-config, student-stream, audit-logs, analytics, admin-dashboard, school-settings, class-management
- `SUB_ADMIN` — admin-dashboard, class-management, attendance-summary, timetable
- `SUPER_ADMIN` — super-admin-dashboard, school-settings, admin-list, register-admin, audit-logs, analytics, student-promotion (platform-level only; no school-specific data access)

### Authentication

Custom JWT auth. Tokens stored as **HTTP-only cookies** (sent/received via `withCredentials: true`). No tokens in `localStorage`. Rotation is handled server-side — the browser automatically stores the new cookies on each refresh response.

- `auth.service.ts` — login, logout, refresh, password reset; all calls use `withCredentials: true`
- `auth.guard.ts` — checks in-memory `AuthStateService.isLoggedIn()`; redirects to `/home` if not logged in
- `auth.interceptor.ts` — retries once after 401 via refresh endpoint; restricts `withCredentials` to own API only (`environment.apiUrl`) — never sent to third-party URLs (e.g. Razorpay CDN); excludes `/login`, `/refresh-token`, `/request-password-reset`, `/reset-password`
- `auth-state.service.ts` — holds in-memory `UserInfo { userId, role, name, className }`; loaded via `/auth/me` on app init

**Roles:** `STUDENT`, `TEACHER`, `ADMIN`, `SUB_ADMIN`, `SUPER_ADMIN`

### API Communication

Base URL from `src/environments/environment.ts` (typed via `Environment` interface in `environment.model.ts`):
- Dev + Prod both point to: `https://edunexify.co.in/api`
- Android build uses: `ng build --configuration=android`

Paginated responses: `{ content: T[], totalElements, totalPages, number, size, first, last, empty }`. Build paginated requests with `HttpParams`.

Some endpoints return plain text — use `responseType: 'text'`.

### State Management

No NgRx. Services are `providedIn: 'root'` singletons. `school.service.ts` caches class list with `shareReplay(1)` — resets on error so next subscriber retries.

**Standard cleanup pattern (required in all components with subscriptions):**
```typescript
private destroy$ = new Subject<void>();

ngOnInit() {
  this.service.getData().pipe(takeUntil(this.destroy$)).subscribe(...);
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

Use `switchMap` + a `Subject` to cancel stale in-flight requests on rapid user actions (see `student-list.component.ts` for reference pattern).

### UI

Angular Material + ngx-bootstrap. **All** toast banners and confirmation dialogs go through `ToastService` — **never use SweetAlert2 (`Swal`) directly anywhere in the codebase**.

- `ToastService` (`src/app/services/toast.service.ts`) — `BehaviorSubject<Toast[]>` for toast banners + `MatDialog` for confirm/alert dialogs
  - `toast.success/error/warning/info(title, message?)` — queues a toast banner
  - `toast.confirm(data: ConfirmDialogData): Promise<boolean>` — opens `ConfirmDialogComponent`
  - `toast.selectMonth(data): Promise<number|null>` — opens `SelectMonthDialogComponent` (used in teacher-attendance)
- `ToastContainerComponent` (`src/app/components/toast/toast-container.component.ts`) — renders the toast stack; mounted in `app.component.html`
- `ConfirmDialogComponent` (`src/app/components/confirm-dialog/`) — MatDialog modal for confirmations/alerts
- `SelectMonthDialogComponent` (`src/app/components/select-month-dialog/`) — MatDialog month picker

`MatDialog` is also used for `WelcomeDialogComponent` (shown once on first dashboard load via `localStorage` flag).

### Forms

Reactive forms (`ReactiveFormsModule`, `FormBuilder`) for complex forms. Template-driven (`FormsModule`) for simpler ones.

---

## Features

### Fee Management
- `fees.component.ts` — per-student fee tracker; session-based; STUDENT sees own fees, ADMIN navigates via `:studentId` param; uses `StudentFee` and `FeeStructure` typed interfaces
- `fee-structure.component.ts` — admin edits class-wise fee structure per academic year; `canEdit()` checks `ADMIN` role only; always uses PUT (`updateFeeStructures`) — the backend handles both new and existing sessions correctly; on save error the editing state is restored so the user can retry without losing work
- `bus-fees.component.ts` — admin edits distance-based bus fee slabs per academic year; same session pattern as fee-structure; on save error editing state is restored
- `payment.component.ts` — Razorpay integration; order created server-side; public key fetched from backend; signature verified server-side; Razorpay script lazy-loaded
- `payment-history.component.ts` / `payment-history-admin.component.ts` — paginated payment history
- `fee-reminders.component.ts` — admin sends push notification reminders to fee defaulters

### Attendance
- `teacher-attendance.component.ts` — teacher/admin marks daily attendance per class; pre-fills from approved leaves if no saved attendance; uses `switchMap` pipeline (no nested subscribes); date uses `formatDate()` (timezone-safe)
- `attendance-summary.component.ts` — monthly attendance view

### Leave Management
- `apply-leave.component.ts` — student applies for leave
- `view-leaves.component.ts` — teacher/admin views and approves/rejects leaves; paginated

### Marks & Results
- `subject-config.component.ts` — admin configures subjects per class/stream
- `exam-config.component.ts` — admin configures exams
- `student-stream.component.ts` — admin assigns stream (Science/Commerce/Arts) to class 11–12 students
- `mark-entry.component.ts` — teacher/admin enters marks per exam per subject
- `student-results.component.ts` — student views own results
- `class-results.component.ts` — teacher/admin views all results for a class
- `report-card.component.ts` — printable report card

### People Management
- `register.component.ts` — admin registers student or teacher (tab toggle, no own form logic)
- `register-student.component.ts` / `register-teacher.component.ts` — actual registration forms
- `bulk-import.component.ts` / `teacher-bulk-import.component.ts` — CSV bulk import
- `student-promotion.component.ts` — promotes students to next class at year end; PASS_OUT action sets status to `GRADUATED` (not INACTIVE)
- `student-list.component.ts` — lists active/upcoming/alumni/left students per class; uses `Subject` + `switchMap` + `forkJoin` to batch load and cancel stale requests
- `teacher-list.component.ts` — lists teachers
- `student-details.component.ts` / `teacher-details.component.ts` / `admin-details.component.ts` — profile pages; student-details includes exit modal (Mark as Left) and re-admission flow

### Notifications & Communication
- `notice.component.ts` — school-wide notices
- `event-calendar.component.ts` / `event-form.component.ts` — school events calendar
- `push-notification.service.ts` — Capacitor `PushNotifications`; calls `removeAllListeners()` at top of `init()` to prevent accumulation on re-login; registers device token with backend

### School Configuration
- `school-settings.component.ts` — school profile
- `class-management.component.ts` — manage class list
- `timetable.component.ts` — weekly timetable per class

### Admin & Super Admin
- `admin-dashboard.component.ts` — admin home with stats
- `super-admin-dashboard.component.ts` — platform-level dashboard (no school data)
- `analytics.component.ts` — charts/stats
- `audit-logs.component.ts` — paginated audit log viewer

---

### Contextual help — keep it in step with the app (required)

The **?** button in page headers opens help written in `src/app/help/help-content.ts` (shared with the other frontend; listed in `parity/shared-files.json`). `HelpService` shows a role only its own lines, and only links it could open now (route roles, workspace, plan feature, Principal permission).

**Any change to a feature's workflow, permissions or role rules (including Coordinator scope and Principal permissions), navigation or routes, prerequisites, or user-facing error messages must, in the same change, review and update that feature's help content** — steps, "Before you start", "If something isn't working" (quote the real message), audiences (`for`) and links. Never describe an action a role cannot perform; check the backend `@PreAuthorize` and service rules, not just the UI. Then run `npm run parity:update`, copy the shared files and manifest to the other repo, and keep `help-permissions.spec.ts` (permission-sensitive wording) and the other help specs passing. Adding a header button to a new page means adding its route path to the topic's `pages`.

## Backend

### Multi-tenancy
Every repository query filters by `schoolId`. `SecurityUtil.getSchoolId()` extracts it from the JWT on every request. Never query without `schoolId`.

### Security
- JWT (RSA) — `JwtAuthFilter` validates on every request
- `@PreAuthorize` on every write endpoint — uses `Role` constants from `config/Role.java`
- CORS origins configurable via `frontend.url` and `cors.additional-origins` properties (not hardcoded)
- API rate limiting in place
- Privilege escalation logged via `log.warn()` in `AuthController`
- `SUPER_ADMIN` has no access to school-specific data endpoints (fee-structure, bus-fees, student data, etc.)

### Caching (Redis)
- `fee-structures` cache — key: `schoolId:academicYear` or `schoolId:academicYear-className`
- `bus-fees` cache — key: `schoolId:academicYear` or `schoolId:academicYear-distance`
- All write operations use `@CacheEvict(allEntries = true)` on affected cache

### Scheduled Jobs
- `StudentStatusScheduler.java` — auto-updates student status
- `StudentClassProgressionScheduler.java` — handles year-end class progression
- `AttendanceEmailScheduler.java` — sends attendance email reports

### Audit Logging
`AuditService` logs all writes with: username, role, action, entity, entityId, oldValue (JSON), newValue (JSON), IP address. Archived via `AuditRetentionService`. Viewable in `audit-logs` route.

### Key Services
- `MarkService` — uses batch repository queries to avoid N+1; `batchLoadStudentSubjectSets()` resolves all student subjects in ~3 DB calls regardless of student count
- `StudentFeesGenerationService` — generates fee records per session
- `PromotionService` / `StudentPromotionService` — year-end student class promotion
- `FcmService` — Firebase push notifications
- `EmailService` — email delivery
- `RazorpayService` — order creation + signature verification
- `FileStorageService` — handles photo uploads (student/teacher/admin/event images); served as static files

### Android Build
- Gradle memory: `org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m` (in `android/gradle.properties`)
- AGP version: `8.10.1` (in `android/build.gradle`)
- If build hangs at `:app:packageRelease` — run `./gradlew --stop`, clear `android/.gradle` and `android/app/build`, then retry
- Signed APK via Android Studio "Generate Signed Bundle/APK" UI (signing config is NOT in build.gradle — handled by the IDE wizard)
- Output: `android/app/build/outputs/apk/release/` (APK) or `android/app/build/outputs/bundle/release/` (AAB)

---

## Student Exit Workflow (June 2026)

### Student Statuses
`StudentStatus` enum: `ACTIVE`, `INACTIVE` (legacy→migrated to WITHDRAWN), `UPCOMING`, `GRADUATED`, `TRANSFERRED`, `WITHDRAWN`
- `isExitStatus()` helper returns true for GRADUATED, TRANSFERRED, WITHDRAWN, INACTIVE
- Flyway `V6__student_exit_statuses.sql` adds exit columns + migrates INACTIVE→WITHDRAWN
- `Student` entity has exit fields: `reasonForLeaving`, `conductAtLeaving`, `exitRemarks`

### Exit Flow
- Admin clicks "Mark as Left" on student-details → exit modal with type/reason/conduct/date/remarks
- Pending dues check (`GET /api/students/{id}/pending-dues`) warns before exit
- `POST /api/students/{id}/exit` sets exit status + fields
- `POST /api/students/{id}/readmit` clears exit fields, sets ACTIVE
- `GET /api/students/alumni/class/{className}` — GRADUATED students
- `GET /api/students/left/class/{className}` — TRANSFERRED + WITHDRAWN students

### Scheduler Safety
- `StudentStatusScheduler` no longer auto-sets INACTIVE; removed `updateStatusInactive()` call
- `updateStatusUpcoming` and `updateStatusActive` queries exclude exit statuses via `NOT IN` clause
- `calculateStatus()` in `StudentService` preserves exit statuses (returns current status unchanged if `isExitStatus()`)

### Promotion Integration
- `StudentPromotionService` PASS_OUT action → `GRADUATED` (was INACTIVE), sets `reasonForLeaving = "Completed final year"`

### Frontend (both repos)
- `Student` interface has `reasonForLeaving?`, `conductAtLeaving?`, `exitRemarks?`
- `StudentExitRequest` and `PendingDuesInfo` interfaces in `student.ts`
- `student.service.ts` has `exitStudent()`, `readmitStudent()`, `checkPendingDues()`, `getAlumniByClass()`, `getLeftStudentsByClass()`
- Student list shows 4 sections: Active, New Admissions, Alumni (gold), Left (gray)
- Student details: exit modal, exit info display, re-admit button for exited students

### Teacher Check-in
- `teacher-checkin.component.ts` — uses `navigator.geolocation` (browser) or Capacitor Geolocation (native); requires browser location permission on web

---

## Recent Fixes Applied (May 2026)

### Super Admin
- `super-admin-dashboard`: Onboard form now collects all required admin fields (`adminName`, `adminPhone`, `adminDob`, `adminGender`) with full validation before submission
- `register-admin`: SUPER_ADMIN sees a school dropdown (filtered to active schools) to assign the new admin; `Admin` interface has optional `schoolId?` field
- Backend `AdminController` already handles `schoolId` from request body when caller is SUPER_ADMIN (falls back to JWT school for ADMIN)

### Admin
- `admin-details`: Save now applies the server-returned object to local state (prevents stale data); `closePasswordModal` calls `cdr.markForCheck()` for OnPush
- `analytics`: Removed redundant `getStats()` + admin name fetch; summary stat cards now computed from `classStats` and `feeTrend` data already loaded
- `fee-structure`: Switched from conditional POST/PUT to always-PUT; save error restores editing state so user can retry
- `bus-fees`: Save error restores editing state so user can retry
- `student-details` / `teacher-details`: `closePasswordModal` calls `cdr.markForCheck()`
- `admin-list`: `deleteAdmin` subscription now uses `pipe(takeUntil(ngUnsubscribe))` to prevent memory leak

### Global
- Removed all direct `Swal` usage from `super-admin-dashboard`, `view-leaves`, `class-management` — all dialogs/toasts now go through `ToastService`
- `app.routes.ts`: SUPER_ADMIN removed from school-specific routes (attendance-summary, school-settings, student-promotion, audit-logs, fee-structure, bus-fees, analytics, timetable, notice)
