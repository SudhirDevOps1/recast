#!/usr/bin/env python3
"""Generate apps/website/assets/og.png — the social-card image (1200x630).

Run from the repo root:  python3 scripts/make-og.py
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (10, 12, 16)
SURFACE = (18, 20, 27)
ACCENT = (124, 92, 255)
ACCENT_HI = (146, 125, 255)
TEXT = (232, 235, 242)
MUTED = (152, 160, 179)

BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def main() -> None:
    im = Image.new("RGB", (W, H), BG)

    # Accent glow, bottom-right.
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    cx, cy = W - 240, H - 120
    for r, a in [(460, 8), (370, 12), (280, 16), (200, 22), (130, 30)]:
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT + (a,))
    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
    d = ImageDraw.Draw(im)

    # Hairline grid hint (very low alpha).
    for x in range(0, W, 80):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 4), width=1)

    # Logo tile.
    tile = Image.new("RGBA", (168, 168), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    td.rounded_rectangle([0, 0, 167, 167], radius=40, fill=SURFACE + (255,))
    td.rounded_rectangle(
        [1, 1, 166, 166], radius=39, outline=(255, 255, 255, 28), width=2
    )
    fr = ImageFont.truetype(BOLD, 96)
    td.text((84, 76), "R", font=fr, fill=ACCENT_HI + (255,), anchor="mm")
    td.rounded_rectangle([52, 138, 116, 147], radius=4, fill=ACCENT + (140,))
    im.paste(tile, (84, 128), tile)

    # Headline + copy.
    f_head = ImageFont.truetype(BOLD, 62)
    f_sub = ImageFont.truetype(REG, 30)
    f_tag = ImageFont.truetype(BOLD, 24)
    d.text((84, 356), "Recast", font=f_head, fill=TEXT)
    d.text(
        (84, 444),
        "Screen recordings, recut like a demo reel — fully offline.",
        font=f_sub,
        fill=MUTED,
    )
    d.text(
        (84, 510),
        "FREE  ·  OPEN SOURCE  ·  NO ACCOUNT  ·  NO TELEMETRY",
        font=f_tag,
        fill=ACCENT_HI,
    )

    im.save("apps/website/assets/og.png", optimize=True)
    print("wrote apps/website/assets/og.png", im.size)


if __name__ == "__main__":
    main()
