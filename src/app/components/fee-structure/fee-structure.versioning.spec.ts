import { Subject, of } from 'rxjs';
import { FeeStructureComponent } from './fee-structure.component';
describe('FeeStructure explicit versioning and save lease', () => {
 const session = {id:1,label:'2099-2100',startDate:'2099-10-01',endDate:'2100-09-30',current:true};
 let c:FeeStructureComponent,api:any,toast:any;
 beforeEach(()=>{api=jasmine.createSpyObj('Rules',['getRulesBySession','saveRulesForClass']);api.getRulesBySession.and.returnValue(of([{id:1,academicSessionId:1,className:'A',feeHeadId:1,amount:10000,effectiveFrom:session.startDate}]));api.saveRulesForClass.and.returnValue(new Subject());toast=jasmine.createSpyObj('Toast',['confirm','error','success','info','warning']);toast.confirm.and.returnValue(Promise.resolve(true));c=new FeeStructureComponent({} as any,api,{} as any,{} as any,{} as any,{} as any,{getUser:()=>({schoolSlug:'a'}),getUserId:()=> 'admin',getUserRole:()=> 'ADMIN'} as any,{markForCheck:()=>{}} as any,{} as any,toast);c.currentSession=session;c.classes=['A'];c.feeHeads=[{id:1}] as any;c.loadRules();});
 afterEach(()=>c.ngOnDestroy());
 it('uses the same explicit forward date for changes to zero',async()=>{c.feeGrid['A'][1]=0;c.save();expect(api.saveRulesForClass).not.toHaveBeenCalled();c.effectiveDate='2099-10-20';c.save();await Promise.resolve();const payload=api.saveRulesForClass.calls.mostRecent().args[2];expect(payload[0].amount).toBe(0);expect(payload[0].effectiveFrom).toBe('2099-10-20');});
 it('rechecks its session after awaited confirmation',async()=>{let resolve!:(v:boolean)=>void;toast.confirm.and.returnValue(new Promise<boolean>(r=>resolve=r));c.save();c.currentSession={...session,id:2};resolve(true);await Promise.resolve();expect(c.saving).toBeFalse(); expect(api.saveRulesForClass).not.toHaveBeenCalled();
 });
 it('blocks session switching while saving',()=>{c.save();c.changeSession({...session,id:2});expect(c.currentSession?.id).toBe(1);});
});
