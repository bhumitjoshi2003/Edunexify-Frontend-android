import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SUPPORT_EMAIL } from '../../utils/legal-links';

/**
 * Public /account-deletion page (no sign-in) — the URL given to Google Play. It only explains how
 * to ask; nothing here can delete or look up an account. Signed-in users use the in-app request
 * (Profile menu → Request account deletion); anyone else emails support, and identity is verified
 * before anything is done (docs/operations/account-deletion.md in the backend).
 */
@Component({
  selector: 'app-account-deletion-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="lg-page">
      <main class="lg-card">
        <a class="lg-header" routerLink="/home">
          <img src="EdunexifyLogo.png" alt="" class="lg-logo" />
          <span class="lg-brand">Edunexify</span>
        </a>
        <h1>Delete your Edunexify account</h1>
        <p>
          Edunexify is a school management platform used by schools, their staff, students and parents,
          on the web at edunexify.co.in and in the Edunexify Android app. Accounts are created by your school.
          You can ask for your account to be deleted at any time. Each request is reviewed manually.
        </p>

        <h2>If you can sign in</h2>
        <ol>
          <li>Sign in to the Edunexify Android app or website.</li>
          <li>Open the profile menu (your name, top right).</li>
          <li>Choose <strong>Request account deletion</strong>, read the information, confirm and submit.</li>
        </ol>
        <p>You will get a reference number and can follow the status of your request on the same screen.</p>

        <h2>If you cannot sign in</h2>
        <p>
          Email <a [href]="mailtoLink">{{ supportEmail }}</a> with the subject <em>Account deletion request</em>, and include:
        </p>
        <ul>
          <li>your full name and your school's name;</li>
          <li>whether you are a student, parent, teacher or school staff member;</li>
          <li>your Edunexify user ID, if you know it.</li>
        </ul>
        <p>
          Please do not send your password. We reply to every request in the same way, without confirming
          whether an account exists.
        </p>

        <h2>What happens next</h2>
        <ul>
          <li>We verify that the request comes from the account holder — for example through the email address
            registered on the account or with your school — before anything is changed.</li>
          <li>Nothing is deleted automatically, and submitting a request does not delete the account. If the
            request is verified and approved, with your school where needed, your sign-in is deactivated, your
            active sessions are ended and your devices are removed from push notifications.</li>
          <li>We then assess, with your school, which of your personal data can be deleted or anonymised and
            which must be kept. Some school records may need to be kept for legitimate educational, financial or
            legal reasons — for example fee and payment records, marks and report cards, and attendance
            history.</li>
          <li>Copies in our backups remain until those backups are deleted.</li>
          <li>We let you know when your request has been completed, or why it could not be.</li>
        </ul>

        <footer class="lg-footer">
          <a routerLink="/privacy-policy">Privacy policy</a>
          <a routerLink="/home">Edunexify home</a>
        </footer>
      </main>
    </div>
  `,
  styleUrl: './legal-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountDeletionPageComponent {
  readonly supportEmail = SUPPORT_EMAIL;
  readonly mailtoLink = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Account deletion request')}`;
}
