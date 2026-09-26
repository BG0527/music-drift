"""f4 历史各版并排（格子放大到 640x400，好让"环 vs 柔和混合"的差别看得出来）。

运行：<bundled python> docs/ui-review/design-explore/_sheet-f4.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DIR = Path(__file__).resolve().parent
COLS, ROWS = 2, 2
TILE_W, TILE_H = 640, 400
GAP, MARGIN, TITLE_H, LABEL_H = 18, 32, 58, 30
INK = (5, 15, 20)
LINE = (70, 92, 100)
PAPER = (243, 249, 250)
MUTED = (150, 175, 183)

TILES = [
    ("A", "_hist-f4-a-024c0ea", "subagent 唱片质感重构：分档沟距（内 11px 环 / 外 4.4px 柔和）"),
    ("B", "_hist-f4-b-304cad5", "v6 均匀密度 2.2px × 12px"),
    ("C", "_hist-f4-c-cd35d6a", "v4 稀 3.5px × 26px（泊位挪左、删唱臂）"),
    ("D", "_hist-f4-d-db3b89d", "当前在库版 = A 的画面 + 后来的文字改动"),
]

W = MARGIN * 2 + COLS * TILE_W + (COLS - 1) * GAP
H = MARGIN * 2 + TITLE_H + ROWS * (TILE_H + LABEL_H) + (ROWS - 1) * GAP
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

draw.text((MARGIN, MARGIN - 4), "f4-groove 历史各版并排（同一底色/同一缩放）", font=font_label, fill=PAPER)

for index, (tag, stem, note) in enumerate(TILES):
    col, row = index % COLS, index // COLS
    x = MARGIN + col * (TILE_W + GAP)
    y = MARGIN + TITLE_H + row * (TILE_H + LABEL_H + GAP)
    src = DIR / f"{stem}.png"
    if src.exists():
        with Image.open(src) as handle:
            canvas.paste(handle.convert("RGB").resize((TILE_W, TILE_H), Image.LANCZOS), (x, y))
    draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=LINE)
    draw.text((x, y + TILE_H + 5), f"{tag} · {stem}", font=font_label, fill=PAPER)
    draw.text((x + 200, y + TILE_H + 8), note, font=font_meta, fill=MUTED)

out = DIR / "_f4-candidates.png"
canvas.save(out)
print(f"{out}  {canvas.size[0]}x{canvas.size[1]}")
