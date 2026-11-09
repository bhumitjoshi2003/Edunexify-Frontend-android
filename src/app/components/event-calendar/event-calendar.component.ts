import { firstValueFrom } from 'rxjs';
import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { isPlatformBrowser } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { EventService } from '../../services/event.service';
import { AuthService } from '../../auth/auth.service';
import { StudentService } from '../../services/student.service';
import { TeacherService } from '../../services/teacher.service';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { CommonModule } from '@angular/common';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule, FormsModule, FormArray } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { environment } from '../../../environments/environment';
import { CalendarEvent } from '../../interfaces/event-calendar.component';
import { AttendanceService } from '../../services/attendance.service';
import { SchoolHolidayService } from '../../services/school-holiday.service';
import { SchoolHoliday } from '../../interfaces/school-holiday';
import { forkJoin, Subject, takeUntil, debounceTime, fromEvent } from 'rxjs';
import { ToastService } from '../../services/toast.service';

interface DayCell {
  date: Date | null;
  events: CalendarEvent[];
  expanded?: boolean;
}

@Component({
  selector: 'app-event-calendar',
  templateUrl: './event-calendar.component.html',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule
  ],
  styleUrls: ['./event-calendar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventCalendarComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  @ViewChild('calendarContainer') calendarContainerRef!: ElementRef;
  // IMPORTANT: This ViewChild is for the file input in the *edit sidebar*, matching #fileInput in HTML
  @ViewChild('fileInput') fileInput!: ElementRef; // <-- ADDED ViewChild for the file input

  currentDate = new Date();
  daysInMonth: DayCell[] = [];
  allEvents: CalendarEvent[] = [];
  eventMap = new Map<string, CalendarEvent[]>();

  attendanceMap: { [date: string]: string } = {};
  holidayMap: { [date: string]: string } = {};
  studentId: string = '';

  currentUserRole = '';
  /** Admin and Principal manage events; the backend repeats the check per request. */
  get canEditEvents(): boolean { return this.currentUserRole === 'ADMIN' || this.currentUserRole === 'PRINCIPAL'; }
  currentUserClass: string | null = null;

  selectedEvent: CalendarEvent | null = null;
  deletingEvent = false;
  savingEvent = false;
  private destroyed = false;
  showSidebar = false;
  isEditing = false;
  eventForm!: FormGroup; // Defined here, initialized in constructor or initEventForm

  categories: string[] = ['Academic', 'Sports', 'Cultural', 'Social', 'Holiday', 'Meeting', 'Other'];

  categoryColors = new Map<string, string>();

  isMobileView: boolean = false;

  // Image related properties
  selectedFile: File | null = null;
  imagePreviewUrl: string | ArrayBuffer | null = null;
  // private currentEventImageUrl: string | null = null; // Removed - imageUrl in form is now the source of truth

  constructor(
    private eventService: EventService,
    private authService: AuthService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private studentService: StudentService,
    private teacherService: TeacherService,
    private attendanceService: AttendanceService,
    private holidayService: SchoolHolidayService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private logger: LoggerService,
    private toast: ToastService
  ) {
    // Initialize eventForm here with all controls, including imageUrl
    this.eventForm = this.fb.group({
      id: [null], // Will be set when patching
      title: ['', Validators.required],
      description: [''],
      startDate: ['', Validators.required],
      endDate: [''],
      startTime: [''],
      endTime: [''],
      location: [''],
      category: ['', Validators.required],
      targetAudience: [''], // Will be processed to array before sending
      videoLinks: this.fb.array([]),
      imageUrl: [null] // Initialize imageUrl control
    });
  }

  ngOnInit(): void {
    fromEvent(window, 'resize').pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => this.checkMobileView());
    this.currentUserRole = this.authService.getUserRole();
    this.initCategoryColors();
    this.checkMobileView();
    this.generateCalendarDays();

    const userId = this.authService.getUserId();
    this.studentId = userId || '';
    const loadEventsAfterDetails = () => {
      this.loadEvents();
    };

    if (this.currentUserRole === 'STUDENT') {
      if (userId) {
        this.studentService.getStudent(userId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (studentDetails) => {
            this.currentUserClass = studentDetails.className;
            loadEventsAfterDetails();
          },
          error: (err) => {
            this.logger.error('Error fetching student details:', err);
            this.currentUserClass = null;
            loadEventsAfterDetails();
          }
        });
      } else {
        this.logger.error('Student role detected, but no student ID found from AuthService.');
        this.currentUserClass = null;
        loadEventsAfterDetails();
      }
    } else if (this.currentUserRole === 'TEACHER') {
      if (userId) {
        this.teacherService.getTeacher(userId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (teacherDetails) => {
            this.currentUserClass = teacherDetails.classTeacher ?? null;
            loadEventsAfterDetails();
          },
          error: (err) => {
            this.logger.error('Error fetching teacher details:', err);
            this.currentUserClass = null;
            loadEventsAfterDetails();
          }
        });
      } else {
        this.logger.error('Teacher role detected, but no teacher ID found from AuthService.');
        this.currentUserClass = null;
        loadEventsAfterDetails();
      }
    } else {
      loadEventsAfterDetails();
    }
  }

  openExternalLink(url: string): void {
    if (Capacitor.isNativePlatform()) {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank');
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkMobileView(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobileView = window.innerWidth <= 768;
    }
  }

  private initCategoryColors(): void {
    const defaultColor = '#16a34a';
    const colors = [
      '#16a34a', // Academic — green
      '#f59e0b', // Sports — amber
      '#eab308', // Cultural — yellow
      '#22c55e', // Social — bright green
      '#f97316', // Holiday — orange
      '#ef4444', // Meeting — red
      '#14b8a6'  // Other — teal
    ];
    this.categories.forEach((cat, index) => {
      this.categoryColors.set(cat, colors[index % colors.length]);
    });
    this.categoryColors.set('Default', defaultColor);
  }

  getFormattedDate(dateStr: string | undefined | null, fmt: string): string {
    if (!dateStr) return '';
    return this.formatDate(new Date(dateStr), fmt);
  }

  formatDate(date: Date, fmt: string): string {
    return format(date, fmt);
  }

  formatTimeDisplay(timeStr: string | undefined | null): string {
    if (!timeStr) {
      return '';
    }
    try {
      const date = new Date(`2000-01-01T${timeStr}`);
      return format(date, 'h:mm a');
    } catch (e) {
      this.logger.error('Error formatting time string:', timeStr, e);
      return timeStr;
    }
  }

  // Helper to get full image URL
  getFullImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) {
      return '';
    }
    // Object-storage images arrive as an already-absolute, short-lived presigned URL (see
    // EventService.resolveImageUrl on the backend) — it must be used as-is. Only a legacy
    // /uploads/events/images/... relative path needs the apiUrl prefix. Mirrors
    // TeacherDetailsComponent/StudentDetailsComponent's identical getPhotoUrl guard.
    if (relativePath.startsWith('http')) {
      return relativePath;
    }
    return `${environment.apiUrl}${relativePath}`;
  }

  goToPreviousMonth(): void {
    this.currentDate = subMonths(this.currentDate, 1);
    this.refreshCalendar();
  }

  goToNextMonth(): void {
    this.currentDate = addMonths(this.currentDate, 1);
    this.refreshCalendar();
  }

  private refreshCalendar(): void {
    this.generateCalendarDays();
    this.loadEvents();
    this.closeSidebar(); // Ensure sidebar closes on month change
  }

  private generateCalendarDays(): void {
    const start = startOfMonth(this.currentDate);
    const end = endOfMonth(this.currentDate);
    const days = eachDayOfInterval({ start, end });
    this.daysInMonth = [];
    const offset = (getDay(start) === 0 ? 6 : getDay(start) - 1);
    for (let i = 0; i < offset; i++) this.daysInMonth.push({ date: null, events: [] });
    days.forEach(d => this.daysInMonth.push({ date: d, events: [], expanded: false }));
  }

  private loadEvents(): void {
    const y = this.currentDate.getFullYear();
    const m = this.currentDate.getMonth() + 1;
    this.eventService.getEventsForMonthAndYear(y, m).pipe(takeUntil(this.destroy$)).subscribe({
      next: evs => {
        this.allEvents = evs; this.populateEvents();
        if (this.currentUserRole === 'STUDENT') {
          this.loadAttendance();
        } else {
          this.attendanceMap = {};
          this.loadHolidaysOnly();
        }

      },
      error: (err) => this.logger.error(err)
    });
  }

  private populateEvents(): void {
    this.eventMap.clear();

    // The API has already enforced visibility (including authorized parent-child audiences).
    const filtered = this.allEvents;

    filtered.forEach(ev => {
      const start = new Date(ev.startDate);
      const end = ev.endDate ? new Date(ev.endDate) : start;
      eachDayOfInterval({ start, end }).forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const arr = this.eventMap.get(key) || [];
        arr.push(ev);
        this.eventMap.set(key, arr);
      });
    });

    this.daysInMonth.forEach(cell => {
      cell.events = cell.date ? (this.eventMap.get(format(cell.date, 'yyyy-MM-dd')) ?? []) : [];
    });
    this.cdr.markForCheck();
  }

  isToday(date: Date | null): boolean {
    return date ? isSameDay(date, new Date()) : false;
  }

  getEventColor(category: string): string {
    return this.categoryColors.get(category) || this.categoryColors.get('Default')!;
  }

  get monthEvents(): CalendarEvent[] {
    return [...this.allEvents].sort((a, b) => {
      const aTime = new Date(`${a.startDate}T${a.startTime || '00:00:00'}`).getTime();
      const bTime = new Date(`${b.startDate}T${b.startTime || '00:00:00'}`).getTime();
      return aTime - bTime;
    });
  }

  eventDateLabel(ev: CalendarEvent): string {
    const start = new Date(ev.startDate);
    const end = ev.endDate ? new Date(ev.endDate) : start;
    const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
    if (sameDay) return format(start, 'd MMM').toUpperCase();
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, 'd')}–${format(end, 'd MMM')}`.toUpperCase();
    }
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM')}`.toUpperCase();
  }

  eventMeta(ev: CalendarEvent): string {
    const parts = [ev.category || 'School event'];
    if (ev.location) parts.push(ev.location);
    if (ev.startTime) parts.push(this.formatTimeDisplay(ev.startTime));
    return parts.join(' · ');
  }

  visibleEventDots(dayCell: DayCell): CalendarEvent[] {
    return dayCell.events.slice(0, 3);
  }

  openDayPopover(evt: MouseEvent, date: Date): void {
    evt.stopPropagation();
  }

  toggleMobileDayEvents(dayCell: DayCell): void {
    if (dayCell.date && dayCell.events.length > 0) {
      dayCell.expanded = !dayCell.expanded;
      this.daysInMonth.forEach(d => {
        if (d.date && d !== dayCell && d.expanded) {
          d.expanded = false;
        }
      });
    }
  }

  showEventDetails(ev: CalendarEvent, e: MouseEvent): void {
    e.stopPropagation();
    this.selectedEvent = ev;
    this.showSidebar = true;
    this.isEditing = false; // Always start in view mode

    this.initEventForm(ev); // Initialize form with selected event data
    this.resetImageState(); // <-- Call reset image state
    // Ensure native file input is clear upon opening sidebar
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
    this.cdr.detectChanges(); // Force change detection if needed for immediate display
  }

  toggleEditMode(e: MouseEvent): void {
    e.stopPropagation();
    this.isEditing = !this.isEditing;

    if (this.isEditing && this.selectedEvent) {
      this.initEventForm(this.selectedEvent); // Re-initialize form to ensure correct state
      this.resetImageState(); // <-- Call reset image state when entering edit mode
      // Ensure native file input is clear when entering edit mode
      if (this.fileInput) {
        this.fileInput.nativeElement.value = '';
      }
    } else {
      // Exiting edit mode, if you want to revert form state, you can reset or re-init here
      // For now, we'll just rely on closing sidebar to reset
      this.eventForm.reset(); // Clear form when exiting edit mode
      // This also resets the image controls within the form
    }
    this.cdr.detectChanges(); // Force change detection
  }

  closeSidebar(): void {
    this.selectedEvent = null;
    this.showSidebar = false;
    this.isEditing = false;
    if (this.eventForm) {
      this.eventForm.reset();
    }
    this.resetImageState(); // <-- Call reset image state on sidebar close
    // Ensure native file input is clear upon sidebar close
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
    this.cdr.detectChanges(); // Force change detection
  }

  // ADDED: Centralized method to reset image-related component properties
  private resetImageState(): void {
    this.selectedFile = null;
    this.imagePreviewUrl = null;
    // The imageUrl in the form control itself will be managed by initEventForm or removeImage
  }

  private initEventForm(event: CalendarEvent): void {
    const targetAudienceString = Array.isArray(event.targetAudience)
      ? event.targetAudience.join(', ')
      : '';

    // Clear previous FormArray controls before adding new ones
    while (this.videoLinks.length !== 0) {
      this.videoLinks.removeAt(0);
    }
    event.videoLinks?.forEach(link => this.videoLinks.push(this.fb.control(link)));

    this.eventForm.patchValue({
      id: event.id,
      title: event.title,
      description: event.description,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      category: event.category,
      targetAudience: targetAudienceString,
      // imageUrl from the event is patched directly into the form control
      imageUrl: event.imageUrl // This sets the initial image URL for the form
    });

    this.cdr.detectChanges();
  }

  get videoLinks(): FormArray {
    return this.eventForm.get('videoLinks') as FormArray;
  }

  addVideoLink(): void {
    this.videoLinks.push(this.fb.control(''));
  }

  removeVideoLink(index: number): void {
    this.videoLinks.removeAt(index);
  }

  // --- MODIFIED: Image file selection handler ---
  onFileSelected(event: Event): void {
    const fileInput = event.target as HTMLInputElement;
    if (fileInput.files && fileInput.files.length > 0) {
      this.selectedFile = fileInput.files[0];

      // Generate preview
      const reader = new FileReader();
      reader.onload = e => this.imagePreviewUrl = reader.result;
      reader.readAsDataURL(this.selectedFile);

      // CRITICAL: When a new file is selected, nullify the imageUrl in the form control.
      // This signifies that the *existing* image (if any) is to be replaced by the new file.
      this.eventForm.get('imageUrl')?.setValue(null);

    } else {
      // Case where the user opens the file dialog but cancels, or clears the input manually
      this.selectedFile = null;
      this.imagePreviewUrl = null;
      // Do NOT set imageUrl to null here. The form control should retain its value
      // from `patchValue` if it had one, or `null` if removeImage was called.
      // The current state of eventForm.imageUrl is the source of truth.
      if (this.selectedEvent && this.selectedEvent.imageUrl && !this.eventForm.get('imageUrl')?.value) {
        // If there was an original image and the form's imageUrl became null (e.g., via user selecting, then cancelling),
        // revert to the original imageUrl.
        // This handles the scenario where a user might select a file, then cancel the file dialog,
        // and you want the previously saved image to reappear.
        this.eventForm.get('imageUrl')?.setValue(this.selectedEvent.imageUrl);
      }
    }
  }

  // --- MODIFIED: Remove image handler ---
  removeImage(): void {
    // 1. Clear component state for new file selection/preview
    this.selectedFile = null;
    this.imagePreviewUrl = null;

    // 2. CRITICAL: Explicitly set the imageUrl in the Reactive Form to null.
    // This value will be sent to the backend to remove the image association.
    this.eventForm.get('imageUrl')?.setValue(null);

    // 3. Reset the native HTML file input element.
    // This clears the visually selected file name from the input field.
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  saveEventChanges(): void {
    if (this.savingEvent || this.deletingEvent || this.destroyed) return;
    if (this.eventForm.valid && this.selectedEvent && this.selectedEvent.id) {
      this.savingEvent = true;
      this.cdr.markForCheck();
      const eventIdToUpdate: number = this.selectedEvent.id;
      const formValue = this.eventForm.value;

      // Process targetAudience
      let processedTargetAudience: string[] = [];
      const formTargetAudience = formValue.targetAudience;

      if (typeof formTargetAudience === 'string') {
        processedTargetAudience = formTargetAudience
          .split(',')
          .map((audience: string) => audience.trim())
          .filter((audience: string) => audience !== '');
      } else if (Array.isArray(formTargetAudience)) {
        processedTargetAudience = formTargetAudience
          .map((audience: any) => String(audience).trim())
          .filter((audience: string) => audience !== '');
      }

      // Create the updated event object
      const updatedEvent: CalendarEvent = {
        ...this.selectedEvent, // Start with original event to retain all properties including ID
        ...formValue, // Overlay form values
        id: eventIdToUpdate, // Ensure ID is correct
        targetAudience: processedTargetAudience, // Assign processed audience
      };

      // Convert dates to ISO string format (YYYY-MM-DD) for backend
      if (updatedEvent.startDate) {
        updatedEvent.startDate = new Date(updatedEvent.startDate).toISOString().split('T')[0];
      }
      if (updatedEvent.endDate) {
        updatedEvent.endDate = new Date(updatedEvent.endDate).toISOString().split('T')[0];
      }

      // --- MODIFIED: Streamlined Image handling logic ---
      if (this.selectedFile) {
        // Case 1: A new file has been selected — direct-to-object-storage upload first (bytes
        // never pass through our own backend), then update the event with the returned key.
        this.eventService.uploadEventImageDirect(this.selectedFile, eventIdToUpdate).pipe(takeUntil(this.destroy$)).subscribe({
          next: (response) => {
            updatedEvent.imageUrl = response.objectKey;
            this.selectedFile = null;
            this.eventForm.patchValue({ imageUrl: response.objectKey });
            this.proceedToUpdateEvent(eventIdToUpdate, updatedEvent);
          },
          error: (err) => {
            this.logger.error('Error uploading image:', err);
            this.savingEvent = false; this.cdr.markForCheck();
            this.toast.error('Upload failed', 'Event not saved. Please try again.');
          }
        });
      } else {
        // Case 2: No new file selected. The imageUrl in `updatedEvent` should reflect the form's state.
        // It will be null if removeImage() was called, or the original URL if it was kept.
        updatedEvent.imageUrl = this.eventForm.get('imageUrl')?.value;
        this.proceedToUpdateEvent(eventIdToUpdate, updatedEvent);
      }

    } else {
      this.logger.error('Form is invalid or no event selected. Cannot save changes.');
      this.eventForm.markAllAsTouched(); // Mark all controls as touched to display validation errors
    }
  }

  private proceedToUpdateEvent(eventId: number, event: CalendarEvent): void {
    this.eventService.updateEvent(eventId, event).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingEvent = false; this.cdr.markForCheck();
        this.refreshCalendar(); // Refresh calendar to show updated event
        this.closeSidebar(); // Close sidebar after successful update
      },
      error: (err) => {
        this.logger.error('Error updating event:', err);
        this.savingEvent = false; this.cdr.markForCheck();
        this.toast.error('Save failed', 'Please try again.');
      }
    });
  }

  private loadAttendance(): void {
    if (!this.studentId) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth() + 1;

    const monthStart = format(startOfMonth(this.currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(this.currentDate), 'yyyy-MM-dd');

    // The student's own explicit PRESENT/ABSENT rows for the month (Attendance V2).
    const daily$ = this.attendanceService.getStudentDailyDetail(this.studentId, month, year);
    const holidays$ = this.holidayService.getHolidaysByRange(monthStart, monthEnd);

    forkJoin([daily$, holidays$]).pipe(takeUntil(this.destroy$)).subscribe({
      next: ([daily, holidays]) => {

        const absentSet = new Set(daily.absentDays);
        const workingSet = new Set(daily.schoolDays);

        const holidaySet = new Map<string, string>();
        holidays.forEach(h => {
          const d = new Date(h.startDate);
          const end = new Date(h.endDate);
          while (d <= end) {
            holidaySet.set(d.toISOString().slice(0, 10), h.name);
            d.setDate(d.getDate() + 1);
          }
        });

        this.attendanceMap = {};
        this.holidayMap = {};

        const today = new Date();

        this.daysInMonth.forEach(cell => {
          if (!cell.date) return;

          const dateStr = format(cell.date, 'yyyy-MM-dd');
          const cellDate = new Date(dateStr);

          if (cellDate > today) {
            // Future date — only show H for holidays, no P/A
            if (holidaySet.has(dateStr)) {
              this.attendanceMap[dateStr] = 'H';
              this.holidayMap[dateStr] = holidaySet.get(dateStr)!;
            }
            return;
          }

          if (workingSet.has(dateStr)) {
            // Attendance was recorded for the student — P/A always wins over holiday
            if (absentSet.has(dateStr)) {
              this.attendanceMap[dateStr] = 'A';
            } else {
              this.attendanceMap[dateStr] = 'P';
            }
          } else if (holidaySet.has(dateStr)) {
            // No attendance taken and it's a holiday — show H
            this.attendanceMap[dateStr] = 'H';
            this.holidayMap[dateStr] = holidaySet.get(dateStr)!;
          }
          // else: no attendance recorded and not a holiday — leave blank

        });
        this.cdr.markForCheck();

      },
      error: (err) => {
        this.logger.error('Error loading attendance:', err);
        this.cdr.markForCheck();
      }
    });
  }

  private loadHolidaysOnly(): void {
    const monthStart = format(startOfMonth(this.currentDate), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(this.currentDate), 'yyyy-MM-dd');
    this.holidayService.getHolidaysByRange(monthStart, monthEnd)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (holidays) => {
          this.holidayMap = {};
          this.attendanceMap = {};
          holidays.forEach(h => {
            const d = new Date(h.startDate);
            const end = new Date(h.endDate);
            while (d <= end) {
              const dateStr = d.toISOString().slice(0, 10);
              this.attendanceMap[dateStr] = 'H';
              this.holidayMap[dateStr] = h.name;
              d.setDate(d.getDate() + 1);
            }
          });
          this.cdr.markForCheck();
        },
        error: (err) => this.logger.error('Error loading holidays:', err)
      });
  }

  getDateKey(date: Date | null): string {
    if (!date) return '';
    return format(date, 'yyyy-MM-dd');
  }

  trackByDayCell(index: number, cell: DayCell): any {
    return cell.date ? cell.date.getTime() : index;
  }

  trackByEvent(index: number, ev: CalendarEvent): any {
    return ev.id ?? index;
  }

  getCellStatusClass(date: Date | null): string {
    if (!date) return '';
    const key = this.getDateKey(date);
    const status = this.attendanceMap[key];
    if (status === 'P') return 'cell-present';
    if (status === 'A') return 'cell-absent';
    if (status === 'H') return 'cell-holiday';
    return '';
  }

  async deleteCurrentEvent(): Promise<void> {
    const target = this.selectedEvent;
    if (!target?.id || this.deletingEvent || this.destroyed) return;
    const id = target.id;
    const title = target.title;
    this.deletingEvent = true; // Includes the deferred confirmation, not just the HTTP call.
    // The sidebar and its backdrop stack above the dialog overlay and would swallow every click
    // and tap on the confirmation: hide them (keeping the selection) while it is open.
    this.showSidebar = false;
    this.cdr.markForCheck();
    let deleted = false;
    try {
      const confirmed = await this.toast.confirm({
        title: 'Delete Event?', message: `Delete "${title}"? This cannot be undone.`,
        confirmText: 'Delete', cancelText: 'Cancel', danger: true,
      });
      if (!confirmed || this.destroyed || this.selectedEvent !== target) return;
      await firstValueFrom(this.eventService.deleteEvent(id).pipe(takeUntil(this.destroy$)));
      if (this.destroyed) return;
      deleted = true;
      this.toast.success('Deleted', 'Event has been removed.');
      if (this.selectedEvent === target) this.closeSidebar();
      this.loadEvents();
    } catch {
      if (!this.destroyed) this.toast.error('Error', 'Failed to delete event.');
    } finally {
      this.deletingEvent = false;
      // Cancelled or failed: bring the same event's details back, unless it was closed meanwhile.
      if (!deleted && this.selectedEvent === target) this.showSidebar = true;
      if (!this.destroyed) this.cdr.markForCheck();
    }
  }

  isMissingAttendance(date: Date | null): boolean {
    if (!date || this.currentUserRole !== 'STUDENT') return false;
    const key = this.getDateKey(date);
    if (this.attendanceMap[key]) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date > today) return false;
    if (date.getDay() === 0) return false;
    return true;
  }
}