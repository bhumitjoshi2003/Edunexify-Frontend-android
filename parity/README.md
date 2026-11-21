# Web / Android parity guard

Shared by `EduPay-Leave-frontend` (web) and `EduPay-Leave-android` — keep the two copies identical.

Some business logic is deliberately **byte-identical** in both clients (auth/session state, password
policy, payment DTOs and helpers, fee money/state, notification state and contracts, session DTOs,
school dates, student status, attendance helpers, the F36–F38 workflows). `shared-files.json` lists
those files with their SHA-256, plus the files that are **deliberately different** per platform
(`platformSpecific`, each with a reason).

## Commands

```bash
npm run parity:check     # also runs automatically before `npm test`
npm run parity:update    # after an intended change to a shared file (records hashes from this repo)
```

`parity:check` fails if a shared file drifted, is missing, or (when the sibling repo is checked out
next to this one, e.g. `/Applications/IAS/`) the two repos disagree. In a single-repo CI checkout it
compares against the recorded hashes.

## Changing a shared file

1. Make the same change in both repos (copy the file).
2. In one repo run `npm run parity:update`.
3. Copy `parity/shared-files.json` to the other repo.
4. Run `npm run parity:check` in either repo — it checks both.

## Adding or removing a file

- Becoming shared: make it identical in both repos, add its path to `shared`, run `parity:update`.
- Becoming platform-specific on purpose: move it from `shared` to `platformSpecific` with a reason.
  A file may not be in both lists.

Templates, styles, native adapters and platform shells are not compared unless listed.
