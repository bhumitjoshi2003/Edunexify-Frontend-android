# design-assets

| File | Purpose |
|---|---|
| `NewEdunexify-logo.png` | **Master logo — source of truth. Do not edit.** 1024×1024 RGBA. Note: its alpha channel is 255 everywhere and a grey/white "transparency" checkerboard is baked into the pixels, so it is *not* usable as a transparent asset as-is. |
| `NewEdunexify-logo-transparent.png` | Genuinely transparent derivative of the master (the logo keyed out of the checkerboard; shapes, colours and proportions unchanged). Generated — do not edit by hand. Tuned for light backgrounds. |

Android launcher / splash / favicon rasters are generated from the master:

```bash
npm run assets:android      # python3 scripts/generate-android-brand-assets.py  (needs Pillow + numpy)
```

Replacing the master with a truly transparent export is supported: the script detects real alpha and uses it directly.
