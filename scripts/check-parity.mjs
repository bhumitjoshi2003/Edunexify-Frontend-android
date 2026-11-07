#!/usr/bin/env node
/**
 * Web/Android parity guard. Shared by both repos — keep the two copies identical.
 *
 * parity/shared-files.json lists the business files that are intentionally byte-identical in the
 * web (EduPay-Leave-frontend) and Android (EduPay-Leave-android) clients, with their SHA-256.
 *
 *   node scripts/check-parity.mjs            verify this repo (and the sibling repo, if checked out)
 *   node scripts/check-parity.mjs --update   re-record hashes from THIS repo after an intended
 *                                            change; then copy the same change (and this manifest)
 *                                            to the other repo and run the check there.
 *
 * It fails when a listed file drifted, is missing, or the two repos' manifests differ. Files that
 * are deliberately different per platform are listed under "platformSpecific" with a reason and
 * are never compared. Works in a single-repo CI checkout (hashes are in the manifest); compares
 * against the sibling repo too when it sits next to this one.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'parity', 'shared-files.json');
const REPOS = ['EduPay-Leave-frontend', 'EduPay-Leave-android'];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const principalOnly = process.argv.includes('--principal');
const shared = principalOnly
  ? Object.fromEntries((manifest.principalShared ?? []).map(path => [path, manifest.shared[path]]))
  : manifest.shared;
if (principalOnly && !Object.keys(shared).length) {
  console.error('parity: no Principal contracts registered'); process.exit(1);
}
const platformSpecific = (manifest.platformSpecific ?? []).map((entry) => entry.path);

const overlap = Object.keys(shared).filter((path) => platformSpecific.includes(path));
if (overlap.length) {
  console.error(`parity: listed as both shared and platform-specific: ${overlap.join(', ')}`);
  process.exit(1);
}

if (process.argv.includes('--update')) {
  for (const path of Object.keys(shared)) {
    const file = join(root, path);
    if (!existsSync(file)) { console.error(`parity: missing ${path}`); process.exit(1); }
    shared[path] = sha256(file);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`parity: recorded ${Object.keys(shared).length} hashes. Copy the change and parity/shared-files.json to the other repo, then run the check there.`);
  process.exit(0);
}

const problems = [];
const checkRepo = (repoRoot, label) => {
  for (const [path, expected] of Object.entries(shared)) {
    const file = join(repoRoot, path);
    if (!existsSync(file)) problems.push(`${label}: missing ${path}`);
    else if (sha256(file) !== expected) problems.push(`${label}: ${path} differs from the shared version`);
  }
};

checkRepo(root, basename(root));

const self = basename(root);
const peerName = REPOS.find((name) => name !== self);
const peerRoot = peerName ? resolve(root, '..', peerName) : null;
if (peerRoot && existsSync(join(peerRoot, 'parity', 'shared-files.json'))) {
  if (readFileSync(join(peerRoot, 'parity', 'shared-files.json'), 'utf8') !== readFileSync(manifestPath, 'utf8')) {
    problems.push(`${peerName}: parity/shared-files.json differs from ${self}'s — copy the updated manifest across`);
  }
  checkRepo(peerRoot, peerName);
} else {
  console.log(`parity: sibling repo ${peerName ?? '(unknown)'} not found next to this one — checked ${self} against the manifest only.`);
}

if (problems.length) {
  console.error('parity: shared business files drifted between web and Android:\n  - ' + problems.join('\n  - '));
  console.error('If the change is intended, apply it to both repos and run `npm run parity:update` (see parity/README.md).');
  process.exit(1);
}
console.log(`parity: ${Object.keys(shared).length} shared files match (${platformSpecific.length} documented platform-specific exceptions).`);
