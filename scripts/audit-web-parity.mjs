#!/usr/bin/env node
/**
 * Feature/route parity guard. Run `node scripts/audit-web-parity.mjs` in CI or
 * `node scripts/audit-web-parity.mjs ../Edunexify-Frontend-web` during a two-repo audit.
 * Android-only native screens and mobile styling are deliberately not compared byte-for-byte.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = join(root, 'src/app');
const read = (path) => readFileSync(path, 'utf8');
const featureSource = read(join(app, 'auth/feature-keys.ts'));
const features = new Set([...featureSource.matchAll(/^\s+([A-Z_]+): '[A-Z_]+',/gm)].map((m) => m[1]));
const routeSource = read(join(app, 'app.routes.ts'));
const navSource = read(join(app, 'components/dashboard/dashboard.component.html'));
const routePaths = (source) => new Set([...source.matchAll(/\bpath:\s*'([^']+)'/g)].map((m) => m[1]));
const navPaths = (source) => new Set([...source.matchAll(/\brouterLink="(\/dashboard\/[^\"]+)"/g)].map((m) => m[1]));
const errors = [];
// Desktop-only operational flows deliberately stay on the website. Do not
// accidentally reintroduce these routes through automatic parity syncing.
const webOnlyRoutes = new Set(['school-setup', 'fee-generation-target']);
const webOnlyNav = new Set(['/dashboard/school-setup', '/dashboard/fee-generation-target']);

function visit(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) visit(path);
    else if (/\.(ts|html)$/.test(item.name) && !item.name.endsWith('.spec.ts')) {
      const text = read(path);
      // Template calls, canActivate data and TypeScript hasFeature(...) should all use real keys.
      for (const match of text.matchAll(/(?:featureKey:\s*|hasFeature\(\s*|hasAnyFeature\(\s*|hasAllFeatures\(\s*)'([A-Z_]+)'/g)) {
        if (!features.has(match[1])) errors.push(`Unknown feature ${match[1]}: ${path.slice(root.length + 1)}`);
      }
    }
  }
}
visit(app);

// Catch regressions even in Android-only CI, where the web checkout is unavailable.
for (const path of [
  'privacy-policy', 'account-deletion', 'dashboard',
  'payment-pricing', 'payment-gateways', 'deletion-requests', 'notification-deliveries',
]) {
  if (!routePaths(routeSource).has(path)) errors.push(`Missing required route: ${path}`);
}
for (const path of webOnlyRoutes) {
  if (routePaths(routeSource).has(path)) errors.push(`Website-only route exposed on Android: ${path}`);
}
for (const link of webOnlyNav) {
  if (navPaths(navSource).has(link)) errors.push(`Website-only navigation exposed on Android: ${link}`);
}

const webArg = process.argv[2];
if (webArg) {
  const webApp = join(resolve(webArg), 'src/app');
  if (!existsSync(join(webApp, 'app.routes.ts'))) errors.push(`Web checkout not found: ${webApp}`);
  else {
    const webRoutes = routePaths(read(join(webApp, 'app.routes.ts')));
    const androidRoutes = routePaths(routeSource);
    for (const path of webRoutes) if (!webOnlyRoutes.has(path) && !androidRoutes.has(path)) errors.push(`Missing web route on Android: ${path}`);
    const webNav = navPaths(read(join(webApp, 'components/dashboard/dashboard.component.html')));
    const androidNav = navPaths(navSource);
    for (const link of webNav) if (!webOnlyNav.has(link) && !androidNav.has(link)) errors.push(`Missing web sidebar link on Android: ${link}`);
    console.log(`Compared ${webRoutes.size} web routes and ${webNav.size} sidebar links.`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`PARITY ERROR: ${error}`);
  process.exitCode = 1;
} else console.log(`Android parity guard passed (${features.size} feature keys; ${routePaths(routeSource).size} routes).`);
