import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FeeRemindersComponent } from './fee-reminders.component';
import { FeeReminderService } from '../../services/fee-reminder.service';
import { LoggerService } from '../../services/logger.service';
import { ToastService } from '../../services/toast.service';
import { SchoolService } from '../../services/school.service';
import { AcademicSessionService } from '../../services/academic-session.service';
import { OverdueStudent } from '../../interfaces/fee-reminder';

/** Shared by the web and Android clients — keep the two copies identical. An unknown amount
 * (totalDue null) is never shown or summed as ₹0. */
describe('FeeRemindersComponent — amounts', () => {
  let fixture: ComponentFixture<FeeRemindersComponent>;
  let overdue: OverdueStudent[];

  const student = (id: string, totalDue: number | null): OverdueStudent =>
    ({ studentId: id, studentName: id, className: '5', unpaidMonths: ['April'], totalDue, daysOverdue: 30 });

  async function render(students: OverdueStudent[]): Promise<HTMLElement> {
    overdue = students;
    await TestBed.configureTestingModule({
      imports: [FeeRemindersComponent],
      providers: [
        { provide: FeeReminderService, useValue: { getOverdueStudents: () => of([...overdue]) } },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn', 'info']) },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'warning', 'info', 'confirm']) },
        { provide: SchoolService, useValue: { getClasses: () => of([]) } },
        { provide: AcademicSessionService, useValue: { getAllSessions: () => of([{ id: 1, label: '2026-2027', current: true }]) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FeeRemindersComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const text = (root: HTMLElement, id: string) =>
    Array.from(root.querySelectorAll(`[data-testid="${id}"]`)).map((e) => e.textContent!.replace(/\s+/g, ' ').trim());

  it('a null totalDue reads "Amount unavailable"; the known subtotal and the unknown count are separate', async () => {
    const root = await render([student('A', 135000), student('B', null), student('C', 100.5)]);
    expect(text(root, 'reminder-amount')).toEqual(['₹1,35,000', 'Amount unavailable', '₹100.50']);
    expect(text(root, 'reminder-total')).toEqual(['₹1,35,100.50']);
    expect(text(root, 'reminder-total-label')[0]).toBe('Known subtotal · amount unavailable for 1 student');
    expect(fixture.componentInstance.amountUnknownCount).toBe(1);
  });

  it('when every amount is unknown, the total is "Amount unavailable", never ₹0', async () => {
    const root = await render([student('A', null), student('B', null)]);
    expect(text(root, 'reminder-total')).toEqual(['Amount unavailable']);
    expect(root.textContent).not.toContain('₹0');
    expect(text(root, 'reminder-total-label')[0]).toBe('Total Due · amount unavailable for 2 students');
  });

  it('all known: a plain total, including a genuine ₹0', async () => {
    const root = await render([student('A', 0), student('B', 500)]);
    expect(text(root, 'reminder-amount')).toEqual(['₹0', '₹500']);
    expect(text(root, 'reminder-total')).toEqual(['₹500']);
    expect(text(root, 'reminder-total-label')[0]).toBe('Total Due');
  });
});
