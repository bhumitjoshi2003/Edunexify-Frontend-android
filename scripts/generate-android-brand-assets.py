#!/usr/bin/env python3
"""
Generates every Android brand raster from the single master logo.

    python3 scripts/generate-android-brand-assets.py        (needs: Pillow, numpy)

Source of truth:  design-assets/NewEdunexify-logo.png   (never modified)

Why this script exists
----------------------
* The master is RGBA but NOT actually transparent: its alpha channel is 255 everywhere and a
  grey/white "transparency" checkerboard is baked into the RGB pixels. Using it directly would put
  that checkerboard into the launcher icon and splash. The script therefore keys the logo out of
  the checkerboard (see extract_logo) and writes a genuinely transparent derivative,
  design-assets/NewEdunexify-logo-transparent.png. If a truly transparent master is supplied later
  (alpha varies) it is used as is.
* Android needs density-specific rasters laid out for specific masks/zoom — one PNG stretched into
  every folder is what made the old icon blurry. The logo is never upscaled beyond its native pixels.

What it writes (res = android/app/src/main/res)
-----------------------------------------------
* mipmap-*/ic_launcher_foreground.png   adaptive-icon foreground, 108dp canvas, transparent; the
                                        logo's minimal enclosing circle is 62dp, inside the 66dp
                                        circle that no launcher mask ever crops.
* mipmap-*/ic_launcher.png, _round.png  legacy (API < 26) icons: logo on a white tile / circle.
* drawable-*/splash_icon.png            Android 12+ splash icon, 288dp canvas, transparent; the logo
                                        sits inside the 192dp circle the system shows.
* public/favicon.ico                    web favicon bundled in the app.
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "design-assets" / "NewEdunexify-logo.png"
TRANSPARENT_MASTER = ROOT / "design-assets" / "NewEdunexify-logo-transparent.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
FAVICON = ROOT / "public" / "favicon.ico"

DENSITY_SCALE = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
LEGACY_SIZES = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}

ADAPTIVE_CANVAS_DP = 108
ADAPTIVE_LOGO_DIAMETER_DP = 62      # safe zone is a 66dp circle; keep a 2dp margin
SPLASH_CANVAS_DP = 288
SPLASH_VISIBLE_DIAMETER_DP = 192    # system masks the icon to this circle (no icon background)
SPLASH_MAX_LOGO_DIAMETER_DP = 176   # 8dp margin inside the visible circle
LEGACY_SQUARE_FILL = 0.74           # logo's enclosing diameter as a fraction of the icon edge
LEGACY_ROUND_FILL = 0.66


# --------------------------------------------------------------------------- matte extraction
def extract_logo(rgb: np.ndarray, chroma_thr=30, colour_thr=60, min_component=40, blur=0.6) -> np.ndarray:
    """Keys a saturated/dark logo out of a light, neutral (grey/white) checkerboard.

    Shape comes from a chroma threshold (the background has chroma ~0; every logo colour is
    saturated or dark navy), softened by a ~1px blur for anti-aliasing. Colour comes from the
    original pixels wherever they are confidently logo-coloured, and from the nearest such pixel
    on the soft edge, so no checkerboard grey or the original's bright ringing halo leaks into the
    result. The logo's shapes, proportions and colours are left exactly as designed.
    """
    im = rgb.astype(np.float32)
    chroma = im.max(2) - im.min(2)
    luma = (im * np.array([0.299, 0.587, 0.114], np.float32)).sum(2)
    h, w = chroma.shape
    mask = chroma >= chroma_thr

    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    n = 0
    for y, x in zip(*np.nonzero(mask)):                     # drop specks (components < min_component px)
        if lab[y, x]:
            continue
        n += 1
        q = deque([(y, x)])
        lab[y, x] = n
        count = 0
        while q:
            cy, cx = q.popleft()
            count += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n
                        q.append((ny, nx))
        sizes.append(count)
    keep = np.array([False] + [s >= min_component for s in sizes[1:]])
    mask = keep[lab] & mask

    known = mask & (chroma >= colour_thr) & (luma < 175)    # real logo colours are darker than the halo
    vals = im * known[..., None]
    for _ in range(8):                                        # grow trusted colours outward over the soft edge
        acc = np.zeros_like(vals)
        cnt = np.zeros((h, w), np.float32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                sk = np.roll(np.roll(known, dy, 0), dx, 1)
                sv = np.roll(np.roll(vals, dy, 0), dx, 1)
                acc += sv * sk[..., None]
                cnt += sk
        new = (~known) & (cnt > 0)
        vals[new] = acc[new] / cnt[new][:, None]
        known = known | new

    alpha = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)),
                       dtype=np.float32)
    alpha[~known] = 0
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(vals + 0.5, 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(alpha + 0.5, 0, 255).astype(np.uint8)
    return out


def load_transparent_logo() -> Image.Image:
    master = Image.open(MASTER).convert("RGBA")
    alpha = np.asarray(master.getchannel("A"))
    if alpha.min() == 255:                                   # opaque: transparency is a baked checkerboard
        print("master has no real transparency (alpha is 255 everywhere) -> keying the logo out of the checkerboard")
        logo = Image.fromarray(extract_logo(np.asarray(master.convert("RGB"))), "RGBA")
    else:
        print("master already has real transparency -> using its alpha as is")
        logo = master
    logo.save(TRANSPARENT_MASTER, optimize=True)
    return logo


# --------------------------------------------------------------------------- geometry
def enclosing_circle(logo: Image.Image):
    """Minimal enclosing circle (centre x, y, radius) of the logo's visible pixels, in master pixels."""
    a = np.asarray(logo.getchannel("A")) >= 128
    inner = a & np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1)
    ys, xs = np.nonzero(a & ~inner)
    pts = np.stack([xs, ys], 1).astype(np.float64)
    c = pts.mean(0)
    for i in range(1, 20001):                                # Badoiu-Clarkson iteration
        far = pts[np.argmax(((pts - c) ** 2).sum(1))]
        c = c + (far - c) / (i + 1)
    r = np.sqrt(((pts - c) ** 2).sum(1)).max()
    return float(c[0]), float(c[1]), float(r)


def place(logo: Image.Image, circle, canvas_px: int, logo_diameter_px: float):
    """A transparent square canvas with the logo scaled so its enclosing circle has the given diameter,
    centred. Downscales only (asserted by the callers), so nothing is ever upsampled."""
    cx, cy, r = circle
    s = logo_diameter_px / (2 * r)
    size = max(1, round(logo.width * s))
    scaled = logo.resize((size, size), Image.LANCZOS)        # RGBA is premultiplied internally by Pillow
    ox = round(canvas_px / 2 - cx * s)
    oy = round(canvas_px / 2 - cy * s)
    canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    x0, y0 = max(ox, 0), max(oy, 0)
    x1, y1 = min(ox + size, canvas_px), min(oy + size, canvas_px)
    if x1 > x0 and y1 > y0:
        canvas.alpha_composite(scaled.crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy)), (x0, y0))
    return canvas, s


def tile(size: int, shape: str) -> Image.Image:
    """White legacy-icon tile (rounded square or circle), anti-aliased by 4x supersampling."""
    ss = 4
    big = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    box = [0, 0, size * ss - 1, size * ss - 1]
    if shape == "round":
        d.ellipse(box, fill=(255, 255, 255, 255))
    else:
        d.rounded_rectangle(box, radius=int(size * ss * 0.22), fill=(255, 255, 255, 255))
    return big.resize((size, size), Image.LANCZOS)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
    print(f"  wrote {path.relative_to(ROOT)}  {img.width}x{img.height}")


# --------------------------------------------------------------------------- outputs
def main() -> int:
    if not MASTER.exists():
        print(f"missing {MASTER}", file=sys.stderr)
        return 1
    logo = load_transparent_logo()
    circle = enclosing_circle(logo)
    native_diameter = 2 * circle[2]
    print(f"logo enclosing circle: centre=({circle[0]:.1f},{circle[1]:.1f}) diameter={native_diameter:.1f}px (native)")

    print("adaptive icon foregrounds")
    for density, scale in DENSITY_SCALE.items():
        canvas = round(ADAPTIVE_CANVAS_DP * scale)
        diameter = ADAPTIVE_LOGO_DIAMETER_DP * scale
        assert diameter <= native_diameter, f"adaptive {density} would upscale the logo"
        img, _ = place(logo, circle, canvas, diameter)
        save_png(img, RES / f"mipmap-{density}" / "ic_launcher_foreground.png")

    print("legacy launcher icons")
    for density, size in LEGACY_SIZES.items():
        for name, shape, fill in (("ic_launcher", "square", LEGACY_SQUARE_FILL), ("ic_launcher_round", "round", LEGACY_ROUND_FILL)):
            base = tile(size, shape)
            mark, _ = place(logo, circle, size, size * fill)
            base.alpha_composite(mark)
            save_png(base, RES / f"mipmap-{density}" / f"{name}.png")

    # The splash logo is capped so that even at xxxhdpi (4px/dp) it is drawn at <= native size.
    splash_diameter_dp = min(SPLASH_MAX_LOGO_DIAMETER_DP, int(native_diameter // 4))
    print(f"splash icon (logo enclosing diameter {splash_diameter_dp}dp inside the {SPLASH_VISIBLE_DIAMETER_DP}dp visible circle)")
    for density, scale in DENSITY_SCALE.items():
        canvas = round(SPLASH_CANVAS_DP * scale)
        img, s = place(logo, circle, canvas, splash_diameter_dp * scale)
        assert s <= 1.0 + 1e-6, f"splash {density} would upscale the logo ({s:.2f}x)"
        save_png(img, RES / f"drawable-{density}" / "splash_icon.png")

    print("favicon")
    pad = 0.06
    ys, xs = np.nonzero(np.asarray(logo.getchannel("A")) >= 128)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    side = max(box[2] - box[0], box[3] - box[1])
    side = round(side * (1 + 2 * pad))
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.alpha_composite(logo.crop((round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))))
    square.resize((256, 256), Image.LANCZOS).save(FAVICON, sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  wrote {FAVICON.relative_to(ROOT)}  16/32/48")
    return 0


if __name__ == "__main__":
    sys.exit(main())
