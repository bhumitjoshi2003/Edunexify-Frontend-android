import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { environment } from '../../environments/environment';
import { LoggerService } from './logger.service';
import { AuthStateService } from '../auth/auth-state.service';
import { NotificationStateService } from './notification-state.service';
import { NotificationNavigationService, NotificationAction } from './notification-navigation.service';
import { NotificationService } from './notification.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly tokenKey = 'fcm_token';
  private readonly pendingActionKey = 'edunexify.pending-notification-action';

  constructor(private http: HttpClient, private logger: LoggerService, private auth: AuthStateService,
    private state: NotificationStateService, private navigation: NotificationNavigationService,
    private notifications: NotificationService, private toast: ToastService) {}

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    // Clear any listeners left over from a previous session before adding new ones.
    // Without this, each re-login stacks another set of handlers → duplicate notifications.
    await PushNotifications.removeAllListeners();

    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') return;

    await this.registerAndListen();
  }

  async permissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unavailable'> {
    if (!Capacitor.isNativePlatform()) return 'unavailable';
    try {
      const permission = await PushNotifications.checkPermissions();
      return permission.receive === 'prompt-with-rationale' ? 'prompt' : permission.receive;
    } catch (error) {
      this.logger.error('Unable to check push notification permission', error);
      return 'unavailable';
    }
  }

  async requestPermissionAndRegister(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') return false;
      await PushNotifications.removeAllListeners();
      await this.registerAndListen();
      return true;
    } catch (error) {
      this.logger.error('Unable to enable push notifications', error);
      return false;
    }
  }

  private async registerAndListen(): Promise<void> {
    // Attach listeners before asking the native plugin to register. The registration
    // callback can arrive immediately on a warm app start, so registering first risks
    // missing the token event entirely.
    await PushNotifications.addListener('registration', (token) => {
      const fcmToken = token.value;

      // Always register the current installation token for the CURRENT authenticated
      // account. The same phone/app installation usually keeps the same FCM token when
      // switching between accounts, so comparing only against localStorage can leave the
      // token assigned to the previous user on the backend. The backend endpoint is
      // idempotent and safely reassigns an existing token to the authenticated user.
      this.registerToken(fcmToken);
      localStorage.setItem(this.tokenKey, fcmToken);
    });

    // Token error
    await PushNotifications.addListener('registrationError', (err) => {
      this.logger.error('FCM registration error:', err);
    });

    // Notification received while app is open — no action needed, Notice Board updates on next visit
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      this.logger.log('Push received (foreground):', notification.title);
      this.state.refreshUnread();
      this.toast.info(notification.title || 'New notification', notification.body || 'Open Notifications to view the update.');
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', event => {
      void this.handleAction(event.notification.data ?? {});
    });

    await PushNotifications.register();
    await this.continuePendingAction();
  }

  async continuePendingAction(): Promise<void> {
    if (!this.auth.isLoggedIn()) return;
    const raw = localStorage.getItem(this.pendingActionKey);
    if (!raw) return;
    localStorage.removeItem(this.pendingActionKey);
    try { await this.handleAction(JSON.parse(raw)); } catch { /* malformed/expired action */ }
  }

  private async handleAction(data: Record<string, unknown>): Promise<void> {
    const action: NotificationAction = {
      actionRoute: this.string(data['actionRoute']), sourceEntityType: this.string(data['sourceEntityType']),
      sourceEntityId: this.string(data['sourceEntityId']), actionMetadata: this.string(data['actionMetadata'])
    };
    if (!this.auth.isLoggedIn()) {
      localStorage.setItem(this.pendingActionKey, JSON.stringify(action));
      return;
    }
    const notificationId = Number(data['notificationId']);
    if (Number.isSafeInteger(notificationId) && notificationId > 0) {
      this.notifications.markNotificationAsRead(notificationId).subscribe({ next: () => this.state.refreshUnread(), error: () => this.state.refreshUnread() });
    }
    if (!(await this.navigation.navigate(action)) && !action.actionRoute) {
      await this.navigation.navigate({ actionRoute: '/dashboard/notifications' });
    }
  }

  private string(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }

  private registerToken(token: string): void {
    this.http.post(`${environment.apiUrl}/users/device-token`, { token }, { responseType: 'text' })
      .subscribe({
        next: () => this.logger.log('FCM token registered'),
        error: (e) => this.logger.error('FCM token registration failed:', e),
      });
  }

  async clearToken(): Promise<void> {
    const token = localStorage.getItem(this.tokenKey);
    if (!token) return;

    try {
      await firstValueFrom(
        this.http.delete(`${environment.apiUrl}/users/device-token`, {
          body: { token },
          responseType: 'text',
          withCredentials: true
        })
      );
      this.logger.log('FCM token cleared');
    } catch (e) {
      // Log but don't block logout
      this.logger.error('[PushNotification] Failed to clear device token:', e);
    } finally {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.pendingActionKey);
    }

    if (Capacitor.isNativePlatform()) {
      try {
        await PushNotifications.removeAllListeners();
      } catch (e) {
        this.logger.error('[PushNotification] removeAllListeners failed:', e);
      }
    }
  }
}
