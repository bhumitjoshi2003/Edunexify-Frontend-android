import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Device storage for optional onboarding state (getting-started guides). Android: Capacitor
 * Preferences (kept across app restarts and updates), with an in-memory fallback if the plugin is
 * unavailable, so a guide still works for the current visit. The website copy uses localStorage —
 * the API is the same.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingStoreService {
  private readonly memory = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    try {
      const { value } = await Preferences.get({ key });
      return value ?? this.memory.get(key) ?? null;
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    this.memory.set(key, value);
    try { await Preferences.set({ key, value }); } catch { /* plugin unavailable: the in-memory copy still works */ }
  }
}
