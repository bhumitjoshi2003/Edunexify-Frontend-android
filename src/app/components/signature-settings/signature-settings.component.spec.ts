import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { SignatureSettingsComponent } from './signature-settings.component';
import { environment } from '../../../environments/environment';

describe('Private signature settings',()=>{
  let fixture:ComponentFixture<SignatureSettingsComponent>;
  let component:SignatureSettingsComponent;
  let http:HttpTestingController;
  let dialog:jasmine.SpyObj<MatDialog>;
  let closed:Subject<string | undefined>;
  beforeEach(async()=>{
    closed=new Subject();dialog=jasmine.createSpyObj('MatDialog',['open']);
    dialog.open.and.returnValue({afterClosed:()=>closed,close:()=>closed.complete()} as any);
    await TestBed.configureTestingModule({imports:[SignatureSettingsComponent],providers:[provideHttpClient(),provideHttpClientTesting(),{provide:MatDialog,useValue:dialog}]}).compileComponents();
    fixture=TestBed.createComponent(SignatureSettingsComponent);component=fixture.componentInstance;http=TestBed.inject(HttpTestingController);fixture.detectChanges();
  });
  afterEach(()=>{http.verify();fixture.destroy();});
  function loaded():void{http.expectOne(`${environment.apiUrl}/signatures/me`).flush({saved:false,imageBase64:null,updatedAt:null});}
  it('keeps drawing and saving as separate explicit actions',()=>{
    loaded();component.draw();closed.next('new-png');closed.complete();
    expect(component.draft).toBe('new-png');http.expectNone(r=>r.method==='PUT');
    component.save();const request=http.expectOne(`${environment.apiUrl}/signatures/me`);
    expect(request.request.method).toBe('PUT');expect(request.request.body).toEqual({imageBase64:'new-png'});
    request.flush({saved:true,imageBase64:'normalized',updatedAt:'2026-11-07T12:00:00'});
    expect(component.profile?.imageBase64).toBe('normalized');expect(component.draft).toBeNull();
    http.expectNone(r=>r.url.includes('approval'));
  });
  it('retains the draft after a failed save and prevents duplicate submissions',()=>{
    loaded();component.draft='draft';component.save();component.save();
    const request=http.expectOne(`${environment.apiUrl}/signatures/me`);request.flush({}, {status:503,statusText:'Unavailable'});
    expect(component.draft).toBe('draft');expect(component.saving).toBeFalse();expect(component.error).toContain('retry');
  });
  it('does not open the editor until a failed profile read has been retried',()=>{
    http.expectOne(`${environment.apiUrl}/signatures/me`).flush({}, {status:503,statusText:'Unavailable'});
    component.draw();expect(dialog.open).not.toHaveBeenCalled();component.load();loaded();component.draw();expect(dialog.open).toHaveBeenCalledTimes(1);
  });
  it('cancels a pending read when the page is destroyed',()=>{
    const request=http.expectOne(`${environment.apiUrl}/signatures/me`);fixture.destroy();expect(request.cancelled).toBeTrue();
  });
});
