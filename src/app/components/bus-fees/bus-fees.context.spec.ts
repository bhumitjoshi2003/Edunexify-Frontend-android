import { Subject, of } from 'rxjs';
import { BusFeesComponent } from './bus-fees.component';
describe('BusFees whole-session context authority', () => {
 const one = { id: 1, label: '2099-2100', startDate: '2099-10-01', endDate: '2100-09-30', current: true };
 const two = { ...one, id: 2, label: '2100-2101', current: false };
 let c: BusFeesComponent, api: any, toast: any;
 const row = (amount: number, year = one.label) => ({ academicYear: year, minDistance: 0, maxDistance: null, fees: amount });
 beforeEach(() => {
  api = jasmine.createSpyObj('Bus', ['getBusFees','updateBusFees','getApplicableBusFee']);api.getBusFees.and.returnValue(of([]));api.updateBusFees.and.returnValue(new Subject());api.getApplicableBusFee.and.returnValue(of(null));
  toast = jasmine.createSpyObj('Toast', ['error','success','info','confirm']);toast.confirm.and.returnValue(Promise.resolve(true));
  c = new BusFeesComponent(api, {} as any, { getUser: () => ({ schoolSlug: 'school-a' }), getUserId: () => 'admin', getUserRole: () => 'ADMIN' } as any, {} as any, {} as any, { navigate: () => Promise.resolve(true) } as any, { markForCheck: () => {} } as any, toast); c.sessions = [one,two];c.currentSession = one;
 });
 afterEach(() => c.ngOnDestroy());
 it('reversed sessions keep B and save only B data to B', async () => {
  const a = new Subject<any[]>(), b = new Subject<any[]>(); api.getBusFees.and.returnValues(a,b); c.fetchBusFees(); c.changeSession(two); expect(c.busFeeStructures).toEqual([]); expect(c.canSave()).toBeFalse(); b.next([row(200,two.label)]); a.next([row(100)]); expect(c.busFeeStructures[0].fees).toBe(200); c.save(); await Promise.resolve(); expect(api.updateBusFees.calls.mostRecent().args[0]).toBe(two.label); expect(api.updateBusFees.calls.mostRecent().args[1][0].fees).toBe(200);
 });
 it('stale errors cannot replace a successful new session', () => { const a = new Subject<any[]>(), b = new Subject<any[]>();api.getBusFees.and.returnValues(a,b);c.fetchBusFees();c.changeSession(two);b.next([row(200,two.label)]);a.error(new Error('late'));expect(c.loadError).toBe('');expect(c.canSave()).toBeTrue(); });
 it('rapid A to B to A accepts the final load only', () => { const a = new Subject<any[]>(),b = new Subject<any[]>(),last = new Subject<any[]>();api.getBusFees.and.returnValues(a,b,last);c.fetchBusFees();c.changeSession(two);c.changeSession(one);last.next([row(300)]);a.next([row(100)]);b.next([row(200,two.label)]);expect(c.busFeeStructures[0].fees).toBe(300); });
 it('session changes are blocked from confirmation through pending save', async () => {api.getBusFees.and.returnValue(of([row(100)]));c.fetchBusFees();c.save();c.changeSession(two);expect(c.currentSession?.id).toBe(1);await Promise.resolve();c.changeSession(two);expect(c.currentSession?.id).toBe(1);expect(api.updateBusFees.calls.count()).toBe(1);});
 it('a context change while confirmation is awaited prevents mutation', async () => {api.getBusFees.and.returnValue(of([row(100)]));c.fetchBusFees();let resolve!: (v:boolean)=>void;toast.confirm.and.returnValue(new Promise<boolean>(r=>resolve=r));c.save();c.currentSession=two;resolve(true);await Promise.resolve();expect(api.updateBusFees).not.toHaveBeenCalled();});
 it('destruction cancels loads and awaited saves', async () => {api.getBusFees.and.returnValue(of([row(100)]));c.fetchBusFees();let resolve!: (v:boolean)=>void;toast.confirm.and.returnValue(new Promise<boolean>(r=>resolve=r));c.save();c.ngOnDestroy();resolve(true);await Promise.resolve();expect(api.updateBusFees).not.toHaveBeenCalled();});
 it('current error is not an empty editable configuration', () => {const pending=new Subject<any[]>();api.getBusFees.and.returnValue(pending);c.fetchBusFees();pending.error(new Error('failed'));expect(c.loadError).not.toBe('');expect(c.canSave()).toBeFalse();});
 it('an open-ended range followed by another slab cannot be saved', () => {api.getBusFees.and.returnValue(of([row(100)]));c.fetchBusFees();c.busFeeStructures.push({...row(200),minDistance:6});c.save();expect(toast.confirm).not.toHaveBeenCalled();expect(api.updateBusFees).not.toHaveBeenCalled();});
 it('applicable fee still uses backend resolution and cancels old child responses', () => {const first=new Subject<any>(),second=new Subject<any>();api.getApplicableBusFee.and.returnValues(first,second);c.subjectStudentId='S1';c.fetchBusFees();c.onChildTabSelected({studentId:'S2',canViewFees:true} as any);second.next({studentId:'S2',busFee:200});first.next({studentId:'S1',busFee:100});expect(c.applicableBusFee?.studentId).toBe('S2');});
});
