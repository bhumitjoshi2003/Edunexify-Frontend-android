import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthStateService } from '../auth/auth-state.service';
import { clearIntendedRoute } from '../auth/redirect-url.util';
import { AuthService } from '../auth/auth.service';
import { SchoolService } from './school.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationStateService } from './notification-state.service';
import { nativeSession } from '../core/native-session';

/** Native adapter for the shared account-security page. */
@Injectable({providedIn:'root'})
export class SignOutService {
  constructor(private auth:AuthService,private school:SchoolService,private push:PushNotificationService,
    private notifications:NotificationStateService,private router:Router,private authState:AuthStateService) {}
  async signOut():Promise<void> {
    await this.push.clearToken().catch(()=>undefined);
    try { await firstValueFrom(this.auth.logout()); } catch { /* Leave the protected view even when offline. */ }
    await this.finish();
  }
  async signOutEverywhere():Promise<void> {
    // Release this device's push association while its session is still authorized.
    await this.push.clearToken().catch(()=>undefined);
    try { await firstValueFrom(this.auth.logoutAll()); }
    catch(error) { await this.push.init().catch(()=>undefined);throw error; }
    await this.finish();
  }
  private async finish():Promise<void> {
    this.authState.clearUser();clearIntendedRoute();this.school.invalidateClasses();this.notifications.clear();
    await nativeSession.flushCookies();await this.router.navigate(['/home']);
  }
}
