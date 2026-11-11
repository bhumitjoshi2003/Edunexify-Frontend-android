import { correctorLabel, decisionActorLabel, manualAttendanceLabel } from './attribution.util';

/** Shared by the web and Android clients — keep the two copies identical. */
describe('attribution labels', () => {
  it('names a Coordinator correction instead of calling it an Admin mark', () => {
    expect(manualAttendanceLabel({ markedByAdmin: true, method: 'MANUAL_CORRECTION', markedByName: 'Sunita Rao', markedByRole: 'COORDINATOR' }))
      .toBe('Corrected by Sunita Rao (Coordinator)');
    expect(manualAttendanceLabel({ markedByAdmin: true, method: 'MANUAL_CORRECTION', markedByName: 'Laxmi Sharma', markedByRole: 'PRINCIPAL' }))
      .toBe('Corrected by Laxmi Sharma (Principal)');
  });

  it('keeps Admin entries and pre-attribution records as Admin', () => {
    expect(manualAttendanceLabel({ markedByAdmin: true, method: 'MANUAL_ADMIN', markedByName: 'Asha Admin', markedByRole: 'ADMIN' }))
      .toBe('Marked by Asha Admin (Admin)');
    expect(manualAttendanceLabel({ markedByAdmin: true, method: 'MANUAL_ADMIN' })).toBe('Marked by Admin');
  });

  it('says nothing for a teacher\'s own check-in', () => {
    expect(manualAttendanceLabel({ markedByAdmin: false, method: 'GPS' })).toBe('');
    expect(manualAttendanceLabel(null)).toBe('');
  });

  it('labels correction history and leave decisions by the recorded authority', () => {
    expect(correctorLabel({ correctedBy: 'emp_1', correctedByName: 'Sunita Rao', correctedByRole: 'COORDINATOR' })).toBe('Sunita Rao (Coordinator)');
    expect(correctorLabel({ correctedBy: 'emp_1', correctedByRole: 'PRINCIPAL' })).toBe('emp_1 (Principal)');
    expect(decisionActorLabel({ decidedBy: 'emp_1', decidedByName: 'Sunita Rao', decidedByRole: 'COORDINATOR' })).toBe('Sunita Rao (Coordinator)');
    expect(decisionActorLabel({ decidedBy: 'emp_8', decidedByName: 'Vikram Singh', decidedByRole: 'TEACHER' })).toBe('Vikram Singh (Class teacher)');
    expect(decisionActorLabel({ decidedBy: 'emp_8' })).toBe('emp_8');
  });
});
