import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { LoggerService } from '../../services/logger.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, ValidatorFn, AbstractControl, FormArray } from '@angular/forms';
import { EventService } from '../../services/event.service';
import { CalendarEvent } from '../../interfaces/event-calendar.component';
import { Router, ActivatedRoute } from '@angular/router';

import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { Subject, takeUntil } from 'rxjs';
import { SchoolService } from '../../services/school.service';
import { ToastService } from '../../services/toast.service';
import { schoolDateKey } from '../../utils/school-date.util';

export const dateRangeValidator: ValidatorFn = (control: AbstractControl): { [key: string]: boolean } | null => {
  const startDate = control.get('startDate')?.value;
  const endDate = control.get('endDate')?.value;

  if (startDate) {
    // Convert dates to YYYY-MM-DD for accurate comparison if they are strings
    const startDateStr = typeof startDate === 'string' ? startDate : new Date(startDate).toISOString().split('T')[0];
    const endDateStr = !endDate ? startDateStr : typeof endDate === 'string' ? endDate : new Date(endDate).toISOString().split('T')[0];

    const today = schoolDateKey(new Date());
    if (startDateStr < today) {
      return { 'pastDateInvalid': true };
    }

    if (endDateStr < startDateStr) { // Compare as strings for YYYY-MM-DD
      return { 'dateRangeInvalid': true };
    }
  }
  return null;
};

@Component({
  selector: 'app-event-form',
  templateUrl: './event-form.component.html',
  styleUrls: ['./event-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class EventFormComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  submitting = false;
  private creationPayload = '';
  private creationRequestId = '';

  eventForm: FormGroup;
  isEditMode: boolean = false;
  eventId: number | null = null;

  readonly staticAudiences = ['ALL', 'TEACHERS', 'STUDENTS'];
  categories: string[] = ['Academic', 'Sports', 'Cultural', 'Social', 'Holiday', 'Meeting', 'Other'];
  targetAudiences: string[] = [...this.staticAudiences];

  // Image related properties
  selectedFile: File | null = null;
  imagePreviewUrl: string | ArrayBuffer | null = null;
  // No need for currentEventImageUrl if imageUrl in form handles all states

  @ViewChild('fileInput') fileInput!: ElementRef; // <-- ADDED: Reference to the HTML file input

  constructor(
    private fb: FormBuilder,
    private eventService: EventService,
    private router: Router,
    private route: ActivatedRoute,
    private logger: LoggerService,
    private cdr: ChangeDetectorRef,
    private schoolService: SchoolService,
    private toast: ToastService
  ) {
    this.eventForm = this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      startDate: ['', Validators.required],
      endDate: [''],
      startTime: [''],
      endTime: [''],
      location: [''],
      category: ['', Validators.required],
      targetAudience: [[], Validators.required],
      videoLinks: this.fb.array([]),
      imageUrl: [null] // This will hold the URL string (existing or new) or null for removal
    }, { validators: dateRangeValidator });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnInit(): void {
    this.schoolService.getClasses().pipe(takeUntil(this.destroy$)).subscribe({
      next: classes => {
        this.targetAudiences = [...this.staticAudiences, ...classes];
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Failed to load classes:', err);
        this.toast.error('Error', 'Failed to load class list.');
      }
    });
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.eventId = +id;
        this.isEditMode = true;
        this.loadEventData(this.eventId);
      }
    });
  }

  // Helper to get full image URL for display
  getFullImageUrl(relativePath: string | null | undefined): string {
    if (!relativePath) {
      return '';
    }
    // Object-storage images arrive as an already-absolute, short-lived presigned URL (see
    // EventService.resolveImageUrl on the backend) — it must be used as-is. Only a legacy
    // /uploads/events/images/... relative path needs the apiUrl prefix. Mirrors
    // TeacherDetailsComponent/StudentDetailsComponent's identical getPhotoUrl guard. The old
    // /files/event-images/... branch referenced a controller that no longer exists (the retired
    // legacy uploadEventImage/downloadEventImage endpoints) — real serving for legacy values has
    // always been the permitAll /api/uploads/events/images/** static path instead.
    if (relativePath.startsWith('http')) {
      return relativePath;
    }
    return `${environment.apiUrl}${relativePath}`;
  }


  loadEventData(id: number): void {
    this.eventService.getEventById(id).subscribe({
      next: (event: CalendarEvent) => {
        // Clear existing video links before adding new ones
        while (this.videoLinks.length !== 0) {
          this.videoLinks.removeAt(0);
        }
        // Add video links from fetched event
        event.videoLinks?.forEach(link => this.videoLinks.push(this.fb.control(link)));

        // Patch form values
        this.eventForm.patchValue({
          title: event.title,
          description: event.description,
          startDate: event.startDate,
          endDate: event.endDate,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location,
          category: event.category,
          targetAudience: Array.isArray(event.targetAudience) ? event.targetAudience : (event.targetAudience ? [event.targetAudience] : []),
          imageUrl: event.imageUrl // Patch existing imageUrl directly into the form control
        });

        // Reset component state related to new file selection
        this.selectedFile = null;
        this.imagePreviewUrl = null;
        // Also clear the native file input visually to avoid confusion
        if (this.fileInput) {
          this.fileInput.nativeElement.value = '';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.logger.error('Error loading event for edit:', err);
        this.toast.error('Error', 'Failed to load event details.');
      }
    });
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
      const file = fileInput.files[0];

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        this.toast.error('File Too Large', 'Event image must be less than 5MB. Please choose a smaller file.');
        (event.target as HTMLInputElement).value = '';
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        this.toast.error('Invalid File', 'Only JPG, PNG, WebP, or GIF images are supported.');
        (event.target as HTMLInputElement).value = '';
        return;
      }

      this.selectedFile = file;

      // Generate preview for the newly selected image
      const reader = new FileReader();
      reader.onload = e => { this.imagePreviewUrl = reader.result; this.cdr.markForCheck(); };
      reader.readAsDataURL(this.selectedFile);

      // CRITICAL: When a new file is selected, nullify the imageUrl in the form control.
      // This signifies that the *existing* image (if any) is to be replaced by the new file,
      // or if the new file is later removed, the imageUrl should be null.
      this.eventForm.get('imageUrl')?.setValue(null);

    } else {
      // Case where the user opens the file dialog but cancels, or clears the input
      this.selectedFile = null;
      this.imagePreviewUrl = null;

      // If in edit mode and there was an existing image URL from original load,
      // and no new file was chosen, revert the form's imageUrl to the original.
      // This is crucial if the user selects a file and then cancels, they should
      // revert to the previously saved image, not have it removed.
      // The `imageUrl` form control's value reflects what will be sent to the backend.
      // It will be correctly set by `loadEventData` initially.
      // So, if no new file is chosen, its value should remain as it was loaded or as it was previously set.
      // We explicitly set it to null only if the 'removeImage' button is clicked.
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

  onSubmit(): void {
    if (this.submitting) return;
    if (this.eventForm.valid) {
      // Get a copy of current form values
      this.submitting = true;
      this.cdr.markForCheck();
      const rawFormValue = this.eventForm.value;

      // Process targetAudience to ensure it's always an array of strings
      let processedTargetAudience: string[] = [];
      const formTargetAudience = rawFormValue.targetAudience;

      if (Array.isArray(formTargetAudience)) {
        processedTargetAudience = formTargetAudience.map(s => String(s).trim()).filter(s => s);
      } else if (typeof formTargetAudience === 'string' && formTargetAudience.length > 0) {
        processedTargetAudience = formTargetAudience.split(',').map(s => s.trim()).filter(s => s);
      }

      // Prepare event data for backend
      const eventData: CalendarEvent = {
        ...rawFormValue,
        targetAudience: processedTargetAudience
      };

      // Convert dates to ISO string format (YYYY-MM-DD) for backend
      if (eventData.startDate) {
        eventData.startDate = new Date(eventData.startDate).toISOString().split('T')[0];
      }
      if (eventData.endDate) {
        eventData.endDate = new Date(eventData.endDate).toISOString().split('T')[0];
      }

      // --- MODIFIED: Image handling logic before saving/updating event ---
      if (this.selectedFile) {
        // Case 1: A new file has been selected — direct-to-object-storage upload first (bytes
        // never pass through our own backend), then create/update the event with the returned
        // object key.
        const targetEventId = this.isEditMode ? this.eventId : null;
        this.eventService.uploadEventImageDirect(this.selectedFile, targetEventId).pipe(takeUntil(this.destroy$)).subscribe({
          next: (uploadResponse) => {
            eventData.imageUrl = uploadResponse.objectKey;
            this.selectedFile = null;
            this.eventForm.patchValue({ imageUrl: uploadResponse.objectKey });
            this.proceedToSaveEvent(eventData);
          },
          error: (uploadError) => {
            this.logger.error('Error uploading image:', uploadError);
            this.submitting = false; this.cdr.markForCheck();
            this.toast.error('Upload Failed', 'Failed to upload image. Event not saved.');
          }
        });
      } else {
        // Case 2: No new file selected.
        // The `imageUrl` in `eventData` already holds the correct value:
        // - The original `imageUrl` (if in edit mode and not explicitly removed)
        // - `null` (if `removeImage()` was called, or if creating a new event without image)
        // No need to check this.currentEventImageUrl explicitly here, as the form control
        // itself reflects the intended state for imageUrl.
        eventData.imageUrl = this.eventForm.get('imageUrl')?.value; // Take the value directly from the form control
        this.proceedToSaveEvent(eventData);
      }

    } else {
      this.eventForm.markAllAsTouched(); // Mark all controls as touched to display errors
    }
  }

  // Helper method to proceed with event save/update
  private proceedToSaveEvent(eventData: CalendarEvent): void {
    // Assuming your service methods handle authorization headers internally or expect them.
    // Make sure your service methods (updateEvent, createEvent) have the correct signatures.
    if (this.isEditMode && this.eventId !== null) {
      this.eventService.updateEvent(this.eventId, eventData).pipe(takeUntil(this.destroy$)).subscribe({ // Assuming service takes eventData directly
        next: () => {
          this.submitting = false; this.cdr.markForCheck();
          this.router.navigate(['/dashboard/event-calendar']);
        },
        error: (err) => {
          this.logger.error('Error updating event:', err);
          this.submitting = false; this.cdr.markForCheck();
          this.toast.error('Update Failed', 'Failed to update event. Please try again.');
        }
      });
    } else {
      const payload = JSON.stringify(eventData);
      if (payload !== this.creationPayload) {
        this.creationPayload = payload;
        this.creationRequestId = crypto.randomUUID();
      }
      this.eventService.createEvent(eventData, this.creationRequestId).pipe(takeUntil(this.destroy$)).subscribe({ // Assuming service takes eventData directly
        next: () => {
          this.submitting = false; this.cdr.markForCheck();
          this.router.navigate(['/dashboard/event-calendar']);
        },
        error: (err) => {
          this.logger.error('Error creating event:', err);
          this.submitting = false; this.cdr.markForCheck();
          this.toast.error('Create Failed', 'Failed to create event. Please try again.');
        }
      });
    }
  }

  isAudienceSelected(audience: string): boolean {
    const current: string[] = this.eventForm.get('targetAudience')?.value || [];
    return current.includes(audience);
  }

  onAudienceToggle(audience: string): void {
    const current: string[] = this.eventForm.get('targetAudience')?.value || [];
    const updated = current.includes(audience)
      ? current.filter((a: string) => a !== audience)
      : [...current, audience];
    this.eventForm.get('targetAudience')?.setValue(updated);
  }

  hasError(controlName: string, errorType: string): boolean | null {
    const control = this.eventForm.get(controlName);
    return control && control.hasError(errorType) && (control.touched || control.dirty); // Check dirty too
  }

  onCancel(): void {
    this.router.navigate(['/dashboard/event-calendar']);
  }
}