import { TeacherGettingStartedComponent } from './teacher-getting-started.component';
import { TeacherOnboardingState } from '../../services/teacher-onboarding.service';
import { ATTENDANCE_LOCATION_DISCLOSURE } from '../../utils/location-disclosure';

describe('TeacherGettingStartedComponent', () => {
  const initial: TeacherOnboardingState = { profileVisited: false, todaysClassesVisited: false, attendanceVisited: false, leaveVisited: false, minimized: false, completedAt: null };
  let auth: any;
  let onboarding: any;
  let router: any;
  let cdr: any;
  let toast: any;
  let component: TeacherGettingStartedComponent;

  beforeEach(() => {
    auth = { getUser: () => ({ userId: 'T1', role: 'TEACHER' }) };
    onboarding = jasmine.createSpyObj('TeacherOnboardingService', ['load', 'save', 'markVisited', 'permissions', 'requestLocation', 'enableNotifications']);
    onboarding.load.and.resolveTo({ ...initial });
    onboarding.save.and.resolveTo();
    onboarding.markVisited.and.callFake(async (_id: string, state: TeacherOnboardingState, field: keyof TeacherOnboardingState) => ({ ...state, [field]: true }));
    onboarding.permissions.and.resolveTo({ location: 'prompt', notifications: 'prompt' });
    onboarding.requestLocation.and.resolveTo('granted');
    onboarding.enableNotifications.and.resolveTo('granted');
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    toast = jasmine.createSpyObj('ToastService', ['confirm']);
    toast.confirm.and.resolveTo(true);
    component = new TeacherGettingStartedComponent(auth, onboarding, router, cdr, toast);
  });

  it('shows the six-item checklist only to a teacher and reports progress', async () => {
    await component.ngOnInit();
    expect(component.visible).toBeTrue();
    expect(component.items.length).toBe(6);
    expect(component.completedCount).toBe(0);
    expect(component.progressPercent).toBe(0);

    auth.getUser = () => ({ userId: 'A1', role: 'ADMIN' });
    const admin = new TeacherGettingStartedComponent(auth, onboarding, router, cdr, toast);
    await admin.ngOnInit();
    expect(admin.visible).toBeFalse();
  });

  it('marks CTA completion and navigates to verified routes', async () => {
    await component.ngOnInit();
    await component.run(component.items.find(item => item.id === 'profile')!);
    expect(onboarding.markVisited).toHaveBeenCalledWith('T1', jasmine.any(Object), 'profileVisited');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard/teacher-details/T1');
  });

  it('derives permissions, persists minimize/reopen, and hides unavailable items', async () => {
    onboarding.permissions.and.resolveTo({ location: 'unavailable', notifications: 'unavailable' });
    await component.ngOnInit();
    expect(component.items.map(item => item.id)).not.toContain('location');
    expect(component.items.map(item => item.id)).not.toContain('notifications');
    await component.setMinimized(true);
    expect(component.state?.minimized).toBeTrue();
    await component.setMinimized(false);
    expect(component.state?.minimized).toBeFalse();
  });

  it('shows completion once and hides it on a later load', async () => {
    onboarding.load.and.resolveTo({ ...initial, profileVisited: true, todaysClassesVisited: true, attendanceVisited: true, leaveVisited: true });
    onboarding.permissions.and.resolveTo({ location: 'granted', notifications: 'granted' });
    await component.ngOnInit();
    expect(component.showCompletion).toBeTrue();
    expect(component.visible).toBeTrue();

    onboarding.load.and.resolveTo({ ...component.state!, completedAt: new Date().toISOString() });
    const later = new TeacherGettingStartedComponent(auth, onboarding, router, cdr, toast);
    await later.ngOnInit();
    expect(later.visible).toBeFalse();
  });

  it('disappears safely if onboarding state cannot be loaded', async () => {
    onboarding.load.and.rejectWith(new Error('storage failed'));
    await component.ngOnInit();
    expect(component.visible).toBeFalse();
  });
  it('shows the location disclosure before Android is asked for permission', async () => {
    let requestedWhileDialogOpen = false;
    toast.confirm.and.callFake(async () => {
      requestedWhileDialogOpen = onboarding.requestLocation.calls.count() > 0;
      return true;
    });
    await component.ngOnInit();
    await component.run(component.items.find(item => item.id === 'location')!);

    expect(toast.confirm).toHaveBeenCalledWith(jasmine.objectContaining({ message: ATTENDANCE_LOCATION_DISCLOSURE }));
    expect(requestedWhileDialogOpen).toBeFalse();
    expect(onboarding.requestLocation).toHaveBeenCalledTimes(1);
    expect(component.location).toBe('granted');
  });

  it('does not ask for location when the disclosure is declined', async () => {
    toast.confirm.and.resolveTo(false);
    await component.ngOnInit();
    await component.run(component.items.find(item => item.id === 'location')!);

    expect(onboarding.requestLocation).not.toHaveBeenCalled();
    expect(component.location).toBe('prompt');
  });
});
