"""越界改动的前后对比：设置 / 404 各一对（改前=HEAD，改后=工作区）。"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DIR = Path(__file__).resolve().parent
TILE_W, TILE_H = 620, 388
GAP, MARGIN, TITLE_H, LABEL_H = 18, 32, 58, 28
INK, LINE, PAPER, MUTED = (5, 15, 20), (70, 92, 100), (243, 249, 250), (150, 175, 183)

TILES = [
    ("改前 · HEAD（owner 版）", "_hist-settings-before"),
    ("改后 · 被越界改动", "p-settings-record"),
    ("改前 · HEAD（owner 版）", "_hist-404-before"),
    ("改后 · 被越界改动", "p-404-record"),
]

W = MARGIN * 2 + 2 * TILE_W + GAP
H = MARGIN * 2 + TITLE_H + 2 * (TILE_H + LABEL_H) + GAP
canvas = Image.new("RGB", (W, H), INK)
draw = ImageDraw.Draw(canvas)

font_label = font_meta = None
for path in [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]:
    try:
        font_label = ImageFont.truetype(path, 16)
        font_meta = ImageFont.truetype(path, 13)
        break
    except OSError:
        continue
if font_label is None:
    font_label = font_meta = ImageFont.load_default()

draw.text((MARGIN, MARGIN - 4), "越界改动前后对比：设置（上） / 404（下）", font=font_label, fill=PAPER)

for index, (label, stem) in enumerate(TILES):
    col, row = index % 2, index // 2
    x = MARGIN + col * (TILE_W + GAP)
    y = MARGIN + TITLE_H + row * (TILE_H + LABEL_H + GAP)
    src = DIR / f"{stem}.png"
    if src.exists():
        with Image.open(src) as handle:
            canvas.paste(handle.convert("RGB").resize((TILE_W, TILE_H), Image.LANCZOS), (x, y))
    draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=LINE)
    draw.text((x, y + TILE_H + 4), f"{label}   ({stem})", font=font_meta, fill=MUTED)

out = DIR / "_before-after.png"
canvas.save(out)
print(f"{out}  {canvas.size[0]}x{canvas.size[1]}")
