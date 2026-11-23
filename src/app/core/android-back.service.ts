import { Injectable } from '@angular/core';

/** What a component can close on Android hardware Back, in the order Back tries them. */
export type BackLayer = 'popup' | 'panel';

/**
 * Lets an open popup (a menu) or panel (the mobile sidebar drawer) close itself on Android hardware
 * Back through its own close API, before Back navigates. AppComponent's single Back listener asks
 * here; a component registers while it is on screen. Android only — the website keeps the browser's
 * own Back.
 */
@Injectable({ providedIn: 'root' })
export class AndroidBackService {
  private readonly handlers: { layer: BackLayer; close: () => boolean }[] = [];

  /** `close` returns true when it closed something (that Back press is then used up). */
  register(layer: BackLayer, close: () => boolean): () => void {
    const entry = { layer, close };
    this.handlers.push(entry);
    return () => {
      const i = this.handlers.indexOf(entry);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  /** Closes the most recently registered open item of this layer; false when nothing was open. */
  closeTopmost(layer: BackLayer): boolean {
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i].layer === layer && this.handlers[i].close()) return true;
    }
    return false;
  }
}
