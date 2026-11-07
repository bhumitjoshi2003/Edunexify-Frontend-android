import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PrincipalManagementComponent } from './principal-management.component';
import { ToastService } from '../../services/toast.service';
import { environment } from '../../../environments/environment';

describe('Admin Principal lifecycle management',()=>{
  let fixture:ComponentFixture<PrincipalManagementComponent>,component:PrincipalManagementComponent,http:HttpTestingController,toast:jasmine.SpyObj<ToastService>;
  const endpoint=`${environment.apiUrl}/principals`;
  const current={userId:'principal-old',name:'Current Principal',email:'current@example.test',active:true};
  beforeEach(async()=>{
    toast=jasmine.createSpyObj('ToastService',['confirm','success','warning']);toast.confirm.and.resolveTo(true);
    await TestBed.configureTestingModule({imports:[PrincipalManagementComponent],providers:[provideHttpClient(),provideHttpClientTesting(),{provide:ToastService,useValue:toast}]}).compileComponents();
    fixture=TestBed.createComponent(PrincipalManagementComponent);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);fixture.detectChanges();
  });
  afterEach(()=>{http.verify();fixture.destroy();});
  function loaded():void{http.expectOne(endpoint).flush([current]);http.expectOne(`${endpoint}/current/history`).flush([]);}
  it('binds an explicitly confirmed replacement to the current identity',async()=>{
    loaded();component.open('replace');component.name='Successor';component.email='next@example.test';component.reason='Term completed';await component.submit();
    const request=http.expectOne(`${endpoint}/current/replacement`);
    expect(request.request.body).toEqual({expectedUserId:'principal-old',confirmed:true,name:'Successor',email:'next@example.test',reason:'Term completed'});
    request.flush({...current,userId:'principal-next',name:'Successor',email:'next@example.test'});http.expectOne(`${endpoint}/current/history`).flush([]);
    expect(component.profile?.userId).toBe('principal-next');expect(component.mode).toBeNull();
  });
  it('cancellation never changes account state',async()=>{
    loaded();toast.confirm.and.resolveTo(false);component.open('activation');component.reason='Temporary leave';await component.submit();
    http.expectNone(r=>r.method!=='GET');expect(component.profile?.active).toBeTrue();expect(component.saving).toBeFalse();
  });
  it('does not present invitation as an empty state when profile loading fails',()=>{
    http.expectOne(endpoint).flush({}, {status:503,statusText:'Unavailable'});fixture.detectChanges();
    expect(component.loadFailed).toBeTrue();expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('preserves form inputs and shows stale-appointment errors for a retry',async()=>{
    loaded();component.open('edit');component.name='Updated';await component.submit();
    http.expectOne(`${endpoint}/current`).flush({message:'Appointment changed. Reload.'},{status:409,statusText:'Conflict'});
    expect(component.error).toContain('Appointment changed');expect(component.name).toBe('Updated');expect(component.saving).toBeFalse();
  });
});
