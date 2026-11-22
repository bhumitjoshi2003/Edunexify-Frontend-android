import { routes } from '../app.routes';
import { HELP_TOPICS, helpTopicForPage, HelpAudience } from './help-content';

/**
 * The help content stays in step with the app: every page and link it names is a real page on this
 * platform (or a known website-only page), and every topic says something to everyone.
 * Shared by the web and Android clients — keep the two copies identical.
 */
describe('Help content registry', () => {
  /** Website-only pages, by product decision. Help may link them; Android simply hides the link. */
  const WEBSITE_ONLY = ['school-setup', 'fee-generation-target'];
  const dashboard = routes.find(r => r.path === 'dashboard')!;
  const pagePaths = new Set((dashboard.children ?? []).map(r => r.path));
  const topics = Object.values(HELP_TOPICS);
  const audiences: HelpAudience[] = ['ADMIN', 'SUB_ADMIN', 'PRINCIPAL', 'COORDINATOR', 'TEACHER', 'PARENT', 'STUDENT'];

  it('keys every topic by its own id', () => {
    for (const [key, topic] of Object.entries(HELP_TOPICS)) expect(topic.id).toBe(key as any);
  });

  it('names only real pages (route paths under /dashboard) for help buttons and links', () => {
    for (const topic of topics) {
      for (const page of topic.pages) expect(pagePaths.has(page)).withContext(`${topic.id} page ${page}`).toBeTrue();
      for (const link of topic.links) {
        expect(pagePaths.has(link.path) || WEBSITE_ONLY.includes(link.path)).withContext(`${topic.id} link ${link.path}`).toBeTrue();
      }
    }
  });

  it('gives each page at most one topic', () => {
    const seen = new Map<string, string>();
    for (const topic of topics) for (const page of topic.pages) {
      expect(seen.has(page)).withContext(`${page} in ${seen.get(page)} and ${topic.id}`).toBeFalse();
      seen.set(page, topic.id);
      expect(helpTopicForPage(page)).toBe(topic.id);
    }
    expect(helpTopicForPage('not-a-page')).toBeNull();
  });

  it('describes every topic for every audience', () => {
    for (const topic of topics) for (const audience of audiences) {
      const about = topic.about.filter(line => !line.for || line.for.includes(audience));
      expect(about.length).withContext(`${topic.id} for ${audience}`).toBeGreaterThan(0);
    }
  });

  it('keeps lines short and plain (no empty steps)', () => {
    for (const topic of topics) {
      for (const w of topic.workflows) {
        expect(w.steps.length).withContext(`${topic.id}: ${w.title}`).toBeGreaterThan(0);
        for (const step of w.steps) expect(step.trim().length).toBeGreaterThan(0);
      }
      for (const line of [...topic.about, ...topic.prerequisites]) expect(line.text.length).toBeLessThan(260);
    }
  });
});
