import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';

interface PrincipalProfile { userId:string;name:string;email:string;active:boolean }
interface Appointment { id:number;userId:string;name:string;email:string;appointedAt:string;endedAt:string|null;reason:string|null }
type Mode = 'create'|'edit'|'replace'|'activation';

@Component({
  selector:'app-principal-management',standalone:true,imports:[CommonModule,FormsModule],changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <main class="page">
      <header><h1>Principal account</h1><p>Manage your school's current Principal and keep the appointment history.</p></header>
      <p *ngIf="loading" role="status">Loading Principal details…</p>
      <p *ngIf="error" role="alert" class="error">{{error}}</p>
      <button type="button" *ngIf="loadFailed" (click)="load()" [disabled]="loading">Retry loading</button>
      <article *ngIf="profile as p">
        <h2>{{p.name}}</h2><p><strong>Login ID:</strong> {{p.userId}}</p><p><strong>Email:</strong> {{p.email}}</p>
        <p><strong>Status:</strong> {{p.active?'Active':'Inactive'}}</p>
        <div class="actions">
          <button type="button" (click)="open('edit')" [disabled]="saving">Edit profile</button>
          <button type="button" (click)="resend()" [disabled]="saving || !p.active">Resend setup link</button>
          <button type="button" (click)="open('activation')" [disabled]="saving">{{p.active?'Deactivate':'Reactivate'}}</button>
          <button type="button" (click)="open('replace')" [disabled]="saving">Appoint a replacement</button>
        </div>
      </article>
      <form *ngIf="!loading && !loadFailed && mode" #form="ngForm" (ngSubmit)="submit()" class="panel">
        <h2>{{mode==='create'?'Invite a Principal':mode==='replace'?'Appoint a new Principal':mode==='edit'?'Edit Principal profile':profile?.active?'Deactivate Principal':'Reactivate Principal'}}</h2>
        <ng-container *ngIf="mode!=='activation'">
          <label for="principal-name">Full name</label><input id="principal-name" name="name" [(ngModel)]="name" required maxlength="120" autocomplete="name" [disabled]="saving"/>
          <label for="principal-email">Official email</label><input id="principal-email" name="email" [(ngModel)]="email" type="email" email required maxlength="255" autocomplete="email" [disabled]="saving"/>
        </ng-container>
        <ng-container *ngIf="mode==='replace'||mode==='activation'">
          <label for="principal-reason">Reason for this change</label><textarea id="principal-reason" name="reason" [(ngModel)]="reason" required maxlength="500" rows="3" [disabled]="saving"></textarea>
        </ng-container>
        <p *ngIf="mode==='replace'">The current Principal will be deactivated and signed out everywhere. Earlier approvals, signatures and issued documents keep their original identity. The new Principal receives a separate setup link.</p>
        <p *ngIf="mode==='create'">A one-time password setup link will be emailed. No password is shared with administrators.</p>
        <p *ngIf="mode==='edit'">Changing the email invalidates old recovery links and signs the Principal out everywhere.</p>
        <div class="actions"><button type="button" *ngIf="profile" (click)="mode=null" [disabled]="saving">Cancel</button><button type="submit" class="primary" [disabled]="saving || form.invalid || (mode!=='activation'&&!name.trim()) || ((mode==='replace'||mode==='activation')&&!reason.trim())">{{saving?'Saving…':'Continue'}}</button></div>
      </form>
      <section class="panel" *ngIf="history.length"><h2>Appointment history</h2>
        <ul><li *ngFor="let item of history"><strong>{{item.name}}</strong> · {{item.email}}<p>{{item.appointedAt|date:'medium'}} — {{item.endedAt?(item.endedAt|date:'medium'):'Current appointment'}}</p><p *ngIf="item.reason">{{item.reason}}</p></li></ul>
      </section>
    </main>`,
  styles:[`.page{max-width:950px;margin:auto;padding:20px;color:#22334b}header{background:#17375e;color:#fff;padding:24px;border-radius:16px}header h1{margin:0 0 8px}article,.panel{margin-top:20px;border:1px solid #dae4ef;border-radius:14px;padding:24px;background:white}form{display:flex;flex-direction:column;gap:12px}input,textarea{font:inherit;border:1px solid #a4b5ca;border-radius:8px;padding:12px;box-sizing:border-box;max-width:100%}.actions{display:flex;gap:10px;flex-wrap:wrap}button{min-height:44px;padding:10px 15px;border:1px solid #a4b5ca;border-radius:8px;background:white;color:#244163;cursor:pointer}.primary{background:#17375e;color:white}button:disabled{opacity:.5;cursor:default}.error{color:#b42318}p{line-height:1.5;overflow-wrap:anywhere}li{margin:16px 0}li p{margin:4px 0}@media(max-width:600px){.page{padding:12px}header,article,.panel{padding:16px}}`]
})
export class PrincipalManagementComponent implements OnInit,OnDestroy {
  profile:PrincipalProfile|null=null;history:Appointment[]=[];mode:Mode|null=null;
  name='';email='';reason='';loading=false;saving=false;error='';loadFailed=false;
  private destroy$=new Subject<void>();private destroyed=false;
  private endpoint=`${environment.apiUrl}/principals`;
  constructor(private http:HttpClient,private cdr:ChangeDetectorRef,private toast:ToastService){}
  ngOnInit():void{this.load();}
  ngOnDestroy():void{this.destroyed=true;this.destroy$.next();this.destroy$.complete();}
  load():void{
    if(this.loading||this.saving)return;
    this.loading=true;this.error='';this.loadFailed=false;
    this.http.get<PrincipalProfile[]>(this.endpoint).pipe(takeUntil(this.destroy$)).subscribe({
      next:data=>{this.profile=data[0]??null;this.mode=this.profile?null:'create';this.loading=false;this.loadHistory();this.cdr.markForCheck();},
      error:()=>{this.loading=false;this.loadFailed=true;this.error='Unable to load Principal details. Retry before making changes.';this.cdr.markForCheck();}
    });
  }
  private loadHistory():void{
    this.http.get<Appointment[]>(`${this.endpoint}/current/history`).pipe(takeUntil(this.destroy$)).subscribe({
      next:history=>{this.history=history;this.cdr.markForCheck();},
      error:()=>{this.history=[];this.toast.warning('History unavailable','The Principal profile loaded. Retry the page to load appointment history.');}
    });
  }
  open(mode:Mode):void{
    if(this.saving)return;this.mode=mode;this.reason='';this.error='';this.name=mode==='edit'?this.profile?.name??'':'';this.email=mode==='edit'?this.profile?.email??'':'';
  }
  async submit():Promise<void>{
    if(this.saving||!this.mode||this.loading||this.loadFailed)return;
    const mode=this.mode,expected=this.profile?.userId;
    if(mode!=='activation'&&(!this.name.trim()||!this.email.trim()||!/^\S+@\S+\.\S+$/.test(this.email.trim())))return;
    if((mode==='replace'||mode==='activation')&&!this.reason.trim())return;
    this.saving=true;this.error='';
    const confirmed=await this.toast.confirm({title:mode==='replace'?'Replace the current Principal?':mode==='activation'?(this.profile?.active?'Deactivate this Principal?':'Reactivate this Principal?'):'Save Principal account?',
      message:mode==='replace'?'The current Principal loses access immediately. A new identity and setup link will be created.':mode==='activation'?'This changes the current Principal’s access. Deactivation signs them out everywhere.':'Confirm the name and official email. Email changes sign the Principal out everywhere.',confirmText:'Confirm',cancelText:'Cancel'});
    if(this.destroyed)return;
    if(!confirmed||expected!==this.profile?.userId){this.saving=false;this.cdr.markForCheck();return;}
    const common={expectedUserId:expected,confirmed:true};
    const request=mode==='create'?this.http.post<PrincipalProfile>(this.endpoint,{name:this.name.trim(),email:this.email.trim()}):mode==='edit'?this.http.put<PrincipalProfile>(`${this.endpoint}/current`,{...common,name:this.name.trim(),email:this.email.trim()}):mode==='replace'?this.http.post<PrincipalProfile>(`${this.endpoint}/current/replacement`,{...common,name:this.name.trim(),email:this.email.trim(),reason:this.reason.trim()}):this.http.post<PrincipalProfile>(`${this.endpoint}/current/activation`,{...common,active:!this.profile!.active,reason:this.reason.trim()});
    request.pipe(takeUntil(this.destroy$)).subscribe({
      next:profile=>{this.profile=profile;this.mode=null;this.saving=false;this.loadHistory();this.toast.success('Principal account updated');this.cdr.markForCheck();},
      error:err=>{this.saving=false;this.error=err?.error?.message||'Could not save the Principal account. Check the details and retry.';this.cdr.markForCheck();}
    });
  }
  async resend():Promise<void>{
    if(this.saving||!this.profile?.active)return;const expected=this.profile.userId;this.saving=true;
    const confirmed=await this.toast.confirm({title:'Send a new setup link?',message:`A new one-time setup link will be sent to ${this.profile.email}. Earlier setup links will stop working.`,confirmText:'Send link',cancelText:'Cancel'});
    if(this.destroyed)return;if(!confirmed||expected!==this.profile?.userId){this.saving=false;this.cdr.markForCheck();return;}
    this.http.post<void>(`${this.endpoint}/current/setup-link`,{expectedUserId:expected}).pipe(takeUntil(this.destroy$)).subscribe({
      next:()=>{this.saving=false;this.toast.success('Setup link requested','The Principal can also use Forgot password if delivery is delayed.');this.cdr.markForCheck();},
      error:err=>{this.saving=false;this.error=err?.error?.message||'Could not request the setup link. Please retry.';this.cdr.markForCheck();}
    });
  }
}
