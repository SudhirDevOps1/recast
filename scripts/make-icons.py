#!/usr/bin/env python3
"""Generate Recast app icons with modern, sleek craftsmanship.

Design:
- Deep dark slate backdrop with subtle inner glow and bevel edge
- Rich violet/indigo studio gradient (#7C5CFF -> #4F38CA -> #12141D)
- Stylized, precision-engineered geometric 'R' aperture + dynamic cursor glyph
- Crystal clear anti-aliasing and depth shadow

Outputs:
  build/icon.png (1024)         — linux + electron-builder source
  build/icon.ico                — windows (multi-size)
  build/iconTemplate.png (16)   — macOS tray template
  build/iconTemplate@2x.png (32)
  apps/website/assets/icon.png (256)
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import os
import math

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'desktop', 'build')
WEB_OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'website', 'assets')
os.makedirs(OUT, exist_ok=True)
os.makedirs(WEB_OUT, exist_ok=True)

# 1. Supersampled canvas for ultra-crisp edges
SS = 2
CANVAS_SIZE = SIZE * SS
im = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))

# 2. Outer Soft Glow / Shadow
shadow = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
radius = int(240 * SS)
margin = int(50 * SS)
card_box = [margin, margin, CANVAS_SIZE - margin - 1, CANVAS_SIZE - margin - 1]

# Subtle deep ambient shadow
sd.rounded_rectangle([margin + 10, margin + 40, CANVAS_SIZE - margin - 10, CANVAS_SIZE - margin + 30], radius=radius, fill=(0, 0, 0, 160))
shadow = shadow.filter(ImageFilter.GaussianBlur(int(36 * SS)))
im = Image.alpha_composite(im, shadow)

# 3. Base Card with diagonal studio gradient
card = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
cd = ImageDraw.Draw(card)

# Diagonal gradient #8B5CF6 -> #6366F1 -> #181B26 -> #0E1017
grad = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)

c_top = (139, 92, 246, 255)     # #8B5CF6 Vibrant Violet
c_mid = (99, 102, 241, 255)     # #6366F1 Indigo
c_bot = (18, 22, 33, 255)       # #121621 Deep Midnight

for y in range(CANVAS_SIZE):
    f = y / CANVAS_SIZE
    if f < 0.5:
        sub_f = f * 2.0
        c = tuple(int(c_top[i] + (c_mid[i] - c_top[i]) * sub_f) for i in range(4))
    else:
        sub_f = (f - 0.5) * 2.0
        c = tuple(int(c_mid[i] + (c_bot[i] - c_mid[i]) * sub_f) for i in range(4))
    gd.line([(0, y), (CANVAS_SIZE, y)], fill=c)

# Circular highlight orb in top-left
orb = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
od = ImageDraw.Draw(orb)
od.ellipse([int(-200 * SS), int(-200 * SS), int(800 * SS), int(800 * SS)], fill=(167, 139, 250, 70))
orb = orb.filter(ImageFilter.GaussianBlur(int(100 * SS)))
grad = Image.alpha_composite(grad, orb)

# Mask into squircle
mask = Image.new('L', (CANVAS_SIZE, CANVAS_SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle(card_box, radius=radius, fill=255)
card.paste(grad, (0, 0), mask)

# Fine inner rim / hairline border
cd.rounded_rectangle(card_box, radius=radius, outline=(255, 255, 255, 60), width=int(2.5 * SS))
im = Image.alpha_composite(im, card)

# 4. Draw Precision Iconic Logo Glyph:
# Studio Camera Aperture / Dynamic Recast 'R' Symbol
glyph_layer = Image.new('RGBA', (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glyph_layer)

cx, cy = CANVAS_SIZE // 2, CANVAS_SIZE // 2

# Stylized Recording Aperture Ring (representing capture & framing)
ring_r = int(270 * SS)
gd.arc([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r], start=135, end=405, fill=(255, 255, 255, 45), width=int(16 * SS))

# Distinct Dynamic Lens Arc (Accent colored)
gd.arc([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r], start=310, end=405, fill=(244, 63, 94, 230), width=int(20 * SS))

# Central Clean Monogram / Studio Cursor Play Mark
# Polished cursor arrow that forms a play chevron
arrow_pts = [
    (cx - int(70 * SS), cy - int(150 * SS)),
    (cx + int(140 * SS), cy),
    (cx - int(70 * SS), cy + int(150 * SS)),
    (cx - int(25 * SS), cy),
]
gd.polygon(arrow_pts, fill=(255, 255, 255, 255))

# Recording Live Indicator Dot inside Chevron
rec_r = int(32 * SS)
rec_x = cx - int(120 * SS)
rec_y = cy - int(140 * SS)
gd.ellipse([rec_x - rec_r, rec_y - rec_r, rec_x + rec_r, rec_y + rec_r], fill=(239, 68, 68, 255))
gd.ellipse([rec_x - rec_r - 6, rec_y - rec_r - 6, rec_x + rec_r + 6, rec_y + rec_r + 6], outline=(255, 255, 255, 120), width=int(2 * SS))

im = Image.alpha_composite(im, glyph_layer)

# 5. Downsample with High Quality Lanczos to Final Target Size
final_icon = im.resize((SIZE, SIZE), Image.LANCZOS)
final_icon.save(os.path.join(OUT, 'icon.png'))

# Save for Website & Docs Header
final_icon.resize((256, 256), Image.LANCZOS).save(os.path.join(WEB_OUT, 'icon.png'))

# Windows Multi-Size .ico
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
final_icon.save(os.path.join(OUT, 'icon.ico'), sizes=ico_sizes)

# macOS Tray Templates (clean high-contrast monochrome)
tray16 = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
t16 = ImageDraw.Draw(tray16)
t16.ellipse([2, 2, 13, 13], outline=(255, 255, 255, 240), width=2)
t16.ellipse([5, 5, 10, 10], fill=(255, 255, 255, 255))
tray16.save(os.path.join(OUT, 'iconTemplate.png'))

tray32 = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
t32 = ImageDraw.Draw(tray32)
t32.ellipse([4, 4, 27, 27], outline=(255, 255, 255, 240), width=3)
t32.ellipse([10, 10, 21, 21], fill=(255, 255, 255, 255))
tray32.save(os.path.join(OUT, 'iconTemplate@2x.png'))

print('High-craft icons successfully written to', OUT, 'and', WEB_OUT)
