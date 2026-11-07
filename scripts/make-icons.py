#!/usr/bin/env python3
"""Generate Recast app icons from a single vector-ish composition.

Design: dark rounded square, single accent gradient, a white geometric
play/cursor mark — no emoji, no text. Outputs:
  build/icon.png (1024)         — linux + electron-builder source
  build/icon.ico                — windows (multi-size)
  build/iconTemplate.png (16)   — macOS tray template
  build/iconTemplate@2x.png (32)
"""
from PIL import Image, ImageDraw
import os

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'apps', 'desktop', 'build')
os.makedirs(OUT, exist_ok=True)

# Vertical accent gradient #5A6CF0 -> #0E1015 over a near-black square
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded-square base with gradient (drawn as 1px lines, cheap and exact)
radius = 200
grad = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
top = (0x5A, 0x6C, 0xF0, 255)
bottom = (0x14, 0x18, 0x28, 255)
for y in range(SIZE):
    f = y / SIZE
    c = tuple(int(top[i] + (bottom[i] - top[i]) * f) for i in range(4))
    gd.line([(0, y), (SIZE, y)], fill=c)
mask = Image.new('L', (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

# Cursor-arrow glyph, white, centered
def arrow(scale, dx, dy, color=(255, 255, 255, 255)):
    pts = [
        (500, 300), (542, 460), (560, 440), (588, 470), (598, 452), (570, 432),
        (612, 402),
    ]
    pts = [((x - 550) * scale + 512 + dx, (y - 400) * scale + 512 + dy) for x, y in pts]
    d.polygon(pts, fill=color)

arrow(2.4, 0, 0)

img.save(os.path.join(OUT, 'icon.png'))

# Windows .ico with several sizes
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(os.path.join(OUT, 'icon.ico'), sizes=ico_sizes)

# macOS tray template (small, monochrome-friendly)
tray = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
td = ImageDraw.Draw(tray)
td.ellipse([8, 8, 24, 24], fill=(255, 255, 255, 255))
tray.save(os.path.join(OUT, 'iconTemplate.png'))
tray.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, 'iconTemplate@2x.png'))

print('icons written to', OUT)
