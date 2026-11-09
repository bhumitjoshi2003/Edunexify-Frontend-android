import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { PrivacyPolicyPageComponent } from './privacy-policy-page.component';
import { AccountDeletionPageComponent } from './account-deletion-page.component';
import { SUPPORT_EMAIL } from '../../utils/legal-links';

describe('Public legal pages', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PrivacyPolicyPageComponent, AccountDeletionPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('are top-level routes with no guard, so they open without signing in', () => {
    for (const path of ['privacy-policy', 'account-deletion']) {
      const route = routes.find(r => r.path === path);
      expect(route).withContext(path).toBeDefined();
      expect(route!.canActivate).withContext(path).toBeUndefined();
    }
  });

  it('privacy policy renders the single policy file', () => {
    const fixture = TestBed.createComponent(PrivacyPolicyPageComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(PrivacyPolicyPageComponent.POLICY_PATH)
      .flush('<h2>Privacy policy</h2><p>Policy body</p>');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.lg-policy').textContent).toContain('Policy body');
  });

  it('privacy policy says so, with a contact, when the file cannot be loaded', () => {
    const fixture = TestBed.createComponent(PrivacyPolicyPageComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(PrivacyPolicyPageComponent.POLICY_PATH)
      .flush('missing', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="policy-error"]').textContent).toContain(SUPPORT_EMAIL);
  });

  it('the published policy file survives sanitisation and states the verified practices', async () => {
    // The real public/legal/privacy-policy.html, as the test server serves it at the same path.
    const response = await fetch(PrivacyPolicyPageComponent.POLICY_PATH);
    expect(response.ok).toBeTrue();
    const html = await response.text();
    const fixture = TestBed.createComponent(PrivacyPolicyPageComponent);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne(PrivacyPolicyPageComponent.POLICY_PATH).flush(html);
    fixture.detectChanges();

    const policy = fixture.nativeElement.querySelector('.lg-policy') as HTMLElement;
    const text = policy.textContent!.replace(/\s+/g, ' ');
    expect(policy.querySelector('h1')!.textContent).toBe('Privacy Policy');
    expect(text).not.toContain('has not been published yet');
    expect(text).toContain('does not access location in the background');
    expect(text).toContain('Check-out: the coordinates are used only for the check and are not stored');
    expect(text).toContain('It is not switched on yet');
    expect(text).toContain('Nothing is deleted automatically');
    expect(text).toContain('cannot promise that all of your personal data will be deleted');
    expect(text).toContain('cannot guarantee that none is ever included');
    expect(text).toContain('Effective date:');
    expect(text).toContain('legitimate educational, financial or legal reasons');
    expect(policy.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)).not.toBeNull();
    expect(policy.querySelector('a[href="/account-deletion"]')).not.toBeNull();
  });

  it('account deletion page names Edunexify, explains both ways to ask, and calls no API', () => {
    const fixture = TestBed.createComponent(AccountDeletionPageComponent);
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Delete your Edunexify account');
    expect(text).toContain('Request account deletion');
    expect(text).toContain(SUPPORT_EMAIL);
    expect(text).toContain('without confirming whether an account exists');
    expect(text).toContain('legitimate educational, financial or legal reasons');
    const mailto = fixture.nativeElement.querySelector(`a[href^="mailto:${SUPPORT_EMAIL}"]`) as HTMLAnchorElement;
    expect(mailto.href).toContain('subject=Account%20deletion%20request');
    TestBed.inject(HttpTestingController).verify();
  });
});
