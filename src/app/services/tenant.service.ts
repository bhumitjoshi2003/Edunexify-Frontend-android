import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { STARTUP_HTTP_TIMEOUT_MS } from '../core/startup.constants';
import { clearIntendedRoute, setIntendedRouteSchoolResolver } from '../auth/redirect-url.util';

export interface PublicSchoolInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  themeColor: string | null;
  city: string | null;
  boardType: string | null;
}

const SLUG_KEY = 'schoolSlug';
const BASE_DOMAIN = 'edunexify.co.in';

@Injectable({ providedIn: 'root' })
export class TenantService {

  private _school: PublicSchoolInfo | null = null;
  private _slug: string | null = null;

  constructor(private http: HttpClient) {
    // A saved post-login destination belongs to the school it was saved under (the stored school).
    setIntendedRouteSchoolResolver(() => this._slug);
  }

  get isBranded(): boolean { return this._school !== null; }
  get school(): PublicSchoolInfo | null { return this._school; }
  get slug(): string | null { return this._slug; }
  get hasStoredSlug(): boolean { return !!localStorage.getItem(SLUG_KEY); }

  /**
   * Called once during APP_INITIALIZER. Reads the stored school slug
   * and fetches branding silently — a failed fetch just means no branding.
   */
  init(): Promise<void> {
    const slug = localStorage.getItem(SLUG_KEY);
    if (!slug) return Promise.resolve();
    this._slug = slug;
    return firstValueFrom(
      this.http.get<PublicSchoolInfo>(`${environment.apiUrl}/public/school/${slug}`).pipe(timeout(STARTUP_HTTP_TIMEOUT_MS))
    )
      .then(info => { this._school = info ?? null; })
      .catch(() => { this._school = null; });
  }

  /**
   * Parses user input into a clean slug.
   * Accepts: "indraacademy", "indraacademy.edunexify.co.in",
   *          "https://indraacademy.edunexify.co.in"
   */
  parseSlug(input: string): string | null {
    const cleaned = input.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0];

    if (cleaned.endsWith(`.${BASE_DOMAIN}`)) {
      const sub = cleaned.slice(0, cleaned.length - BASE_DOMAIN.length - 1);
      return (sub && !sub.includes('.')) ? sub : null;
    }

    if (/^[a-z0-9-]+$/.test(cleaned)) return cleaned;
    return null;
  }

  /** Fetch school info for a slug without storing it (used during entry). */
  lookupSchool(slug: string): Promise<PublicSchoolInfo | null> {
    return firstValueFrom(
      this.http.get<PublicSchoolInfo>(`${environment.apiUrl}/public/school/${slug}`).pipe(timeout(STARTUP_HTTP_TIMEOUT_MS))
    )
      .then(info => info ?? null)
      .catch(() => null);
  }

  /** Startup adapter shared with the website (core/startup.service.ts): a valid session whose
   *  school isn't stored (e.g. app storage was cleared) recovers it from the session's slug. */
  async loadSchoolBySlug(slug: string): Promise<void> {
    const info = await this.lookupSchool(slug);
    if (info) this.setSchool(slug, info);
  }

  /** Store slug + branding after a successful lookup. */
  setSchool(slug: string, info: PublicSchoolInfo): void {
    localStorage.setItem(SLUG_KEY, slug);
    this._slug = slug;
    this._school = info;
  }

  /** Clear stored school (for switching schools). */
  clearSchool(): void {
    // A page saved under the previous school never applies to the next one.
    clearIntendedRoute();
    localStorage.removeItem(SLUG_KEY);
    this._slug = null;
    this._school = null;
  }

  /** Returns a full URL for a school logo path (relative or absolute). */
  getLogoUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${environment.apiUrl}${path}`;
  }
}
