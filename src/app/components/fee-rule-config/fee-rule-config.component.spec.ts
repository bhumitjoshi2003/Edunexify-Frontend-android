import { Subject, of } from 'rxjs';
import { FeeRuleConfigComponent } from './fee-rule-config.component';
describe('FeeRuleConfig context authority', () => {
 const one = { id: 1, label: '2099-2100', startDate: '2099-10-01', endDate: '2100-09-30', current: true };
 const two = { id: 2, label: '2100-2101', startDate: '2100-10-01', endDate: '2101-09-30', current: false };
 let c: FeeRuleConfigComponent, api: any, toast: any, school: string;
 const row = (cls: string, amount: number, id = 1) => ({ id: 10, className: cls, academicSessionId: id, feeHeadId: 1, amount, effectiveFrom: id === 1 ? one.startDate : two.startDate });
 beforeEach(() => {
  school = 'school-a'; api = jasmine.createSpyObj('Rules', ['getRulesBySessionAndClass','saveRulesForClass']);
  api.getRulesBySessionAndClass.and.returnValue(of([])); api.saveRulesForClass.and.returnValue(new Subject());
  toast = jasmine.createSpyObj('Toast', ['error','success']);
  c = new FeeRuleConfigComponent({ getUser: () => ({ schoolSlug: school }), getUserId: () => 'admin' } as any, {} as any, api, {} as any, {} as any, toast, {} as any, { markForCheck: () => {} } as any);
  c.sessions = [one,two]; c.feeHeads = [{ id: 1, name: 'A very long fee head name', code: 'ONE' }] as any; c.selectedSessionId = 1; c.selectedClass = 'A';
 });
 afterEach(() => c.ngOnDestroy());
 it('A then B reversed responses keep B and save B values to B', () => {
  const a = new Subject<any[]>(), b = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValues(a,b);
  c.loadRules(); c.selectedClass = 'B'; c.onFilterChange(); expect(c.rules).toEqual([]); expect(c.canSave()).toBeFalse();
  b.next([row('B',200)]); a.next([row('A',100)]); expect(c.rules[0].amount).toBe(200); c.saveRules();
  expect(api.saveRulesForClass.calls.mostRecent().args.slice(0,2)).toEqual([1,'B']); expect(api.saveRulesForClass.calls.mostRecent().args[2][0].amount).toBe(200);
 });
 it('session switches invalidate pending rules', () => {
  const a = new Subject<any[]>(), b = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValues(a,b); c.loadRules(); c.selectedSessionId = 2; c.onFilterChange(); b.next([row('A',300,2)]); a.next([row('A',100)]); expect(c.rules[0].academicSessionId).toBe(2); c.saveRules(); expect(api.saveRulesForClass.calls.mostRecent().args[0]).toBe(2);
 });
 it('an error from the stale request cannot alter the new editor', () => {
  const a = new Subject<any[]>(), b = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValues(a,b); c.loadRules(); c.selectedClass = 'B'; c.onFilterChange(); b.next([row('B',200)]); a.error(new Error('late')); expect(c.rulesError).toBe(''); expect(c.canSave()).toBeTrue();
 });
 it('rapid A to B to A accepts only the final A request', () => {
  const a = new Subject<any[]>(), b = new Subject<any[]>(), final = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValues(a,b,final); c.loadRules(); c.selectedClass = 'B'; c.onFilterChange(); c.selectedClass = 'A'; c.onFilterChange(); final.next([row('A',300)]); a.next([row('A',100)]); b.next([row('B',200)]); expect(c.rules[0].amount).toBe(300);
 });
 it('selector changes are blocked during a pending save', () => {
  api.getRulesBySessionAndClass.and.returnValue(of([row('A',100)])); c.loadRules(); c.saveRules(); c.selectedClass = 'B'; c.onFilterChange(); expect(c.selectedClass).toBe('A'); expect(api.saveRulesForClass.calls.count()).toBe(1); c.saveRules(); expect(api.saveRulesForClass.calls.count()).toBe(1);
 });
 it('destroyed components accept neither results nor writes', () => {
  const pending = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValue(pending); c.loadRules(); c.ngOnDestroy(); pending.next([row('A',100)]); c.saveRules(); expect(c.rules).toEqual([]); expect(api.saveRulesForClass).not.toHaveBeenCalled();
 });
 it('a school change invalidates the lease', () => {
  api.getRulesBySessionAndClass.and.returnValue(of([row('A',100)])); c.loadRules(); school = 'school-b'; c.saveRules(); expect(api.saveRulesForClass).not.toHaveBeenCalled();
 });
 it('changed amounts require an explicit forward-effective date', () => {
  api.getRulesBySessionAndClass.and.returnValue(of([row('A',100)])); c.loadRules(); c.rules[0].amount = 200; c.saveRules(); expect(api.saveRulesForClass).not.toHaveBeenCalled(); c.effectiveDate = '2099-10-20'; c.saveRules(); expect(api.saveRulesForClass.calls.mostRecent().args[2][0].effectiveFrom).toBe('2099-10-20');
 });
 it('current load errors stay distinct from an empty configuration', () => {
  const pending = new Subject<any[]>(); api.getRulesBySessionAndClass.and.returnValue(pending); c.loadRules(); pending.error(new Error('failed')); expect(c.rulesError).not.toBe(''); expect(c.canSave()).toBeFalse();
 });
});
