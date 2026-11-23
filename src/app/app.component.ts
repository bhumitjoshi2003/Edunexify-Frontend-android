import { Component, OnInit, OnDestroy } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './components/toast/toast-container.component';
import { OfflineIndicatorComponent } from './components/offline-indicator/offline-indicator.component';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { AppUpdateService } from './services/app-update.service';
import { AdoptionMetadataService } from './services/adoption-metadata.service';
import { AuthStateService } from './auth/auth-state.service';
import { AppResumeService } from './core/app-resume.service';
import { AndroidBackService } from './core/android-back.service';
import { StartupRecoveryComponent } from './components/startup-recovery/startup-recovery.component';

@Component({
  selector: 'app-root',
  imports: [AsyncPipe, RouterOutlet, ToastContainerComponent, OfflineIndicatorComponent, StartupRecoveryComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'ias';

  /** CHECKING / SERVICE_UNAVAILABLE / OFFLINE render the startup screen instead of the router
   *  outlet (same gate as the website's app shell), so a backend that never answers becomes a
   *  visible, retryable state rather than a blank screen. */
  constructor(private router: Router, private dialogs: MatDialog, private appUpdateService: AppUpdateService, private adoptionMetadata: AdoptionMetadataService,
              public authState: AuthStateService, private appResume: AppResumeService,
              private overlays: OverlayContainer, private androidBack: AndroidBackService) {
    // Same resume decisions as the website (core/app-resume.service.ts): the WebView's own
    // visibility/online events plus the native app-state adapter below.
    appResume.start();
  }

  async ngOnInit() {
    this.appUpdateService.checkOnStartup();
    this.adoptionMetadata.reportAndroidVersionOnce();
    if (Capacitor.isNativePlatform()) {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Default });
      await StatusBar.setBackgroundColor({ color: '#1a237e' });
      await SplashScreen.hide({ fadeOutDuration: 300 });

      // Native lifecycle adapter: background/foreground feed the shared resume service, which
      // coalesces them with the WebView's own visibility events.
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) this.appResume.foregrounded();
        else this.appResume.backgrounded();
      });

      App.addListener('backButton', ({ canGoBack }) => this.onHardwareBack(canGoBack));

      // Handle deep links — e.g. password-reset email clicking in Android
      App.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.pathname === '/reset-password') {
            const token = parsed.searchParams.get('token');
            if (token) {
              this.router.navigate(['/reset-password'], { queryParams: { token } });
            }
          }
        } catch {
          // malformed URL — ignore
        }
      });
    }
  }

  /**
   * Android hardware Back. Closes only the topmost thing per press: a dismissible dialog, then a
   * popup (the profile menu, or a select/date picker), then the mobile sidebar drawer. Otherwise
   * it goes back in the WebView's history, and leaves the app only when there is none (the role
   * home is the first entry: automatic redirects replace their history entry).
   */
  onHardwareBack(canGoBack: boolean): void {
    const dialog = this.dialogs.openDialogs.at(-1);
    if (dialog) {
      if (!dialog.disableClose) dialog.close();
      return;
    }
    if (this.androidBack.closeTopmost('popup')) return;
    if (this.closeTopmostPopupOverlay()) return;
    if (this.androidBack.closeTopmost('panel')) return;
    if (canGoBack) this.goBack();
    else this.exitApp();
  }

  /** Another open CDK popup (select, date picker, autocomplete): close it the way an outside tap does. */
  private closeTopmostPopupOverlay(): boolean {
    const backdrops = this.overlays.getContainerElement().querySelectorAll<HTMLElement>('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
    const top = backdrops[backdrops.length - 1];
    if (!top) return false;
    top.click();
    return true;
  }

  protected goBack(): void { window.history.back(); }

  protected exitApp(): void { void App.exitApp(); }

  ngOnDestroy() {
    if (Capacitor.isNativePlatform()) {
      App.removeAllListeners();
    }
  }
}
