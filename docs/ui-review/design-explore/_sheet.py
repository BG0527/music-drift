"""全站一致性对照表：把 record-v1 的每页稿按同一底色、同一缩放拼成一张图。

用途：用户的第一优先级是「好看」，第二是「切换页面后画面和谐」——后者只有把页面并排才看得出来。
缺的页面画成「待交付」占位，等补齐后重跑本脚本即可（python _sheet.py）。

运行：<bundled python> docs/ui-review/design-explore/_sheet.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

DIR = Path(__file__).resolve().parent
COLS, ROWS = 4, 3
TILE_W, TILE_H = 480, 300
GAP = 16
MARGIN = 32
TITLE_H = 62
LABEL_H = 26
INK = (5, 15, 20)
LINE = (58, 78, 86)
PAPER = (243, 249, 250)
MUTED = (150, 175, 183)

# 顺序＝用户旅程：发起 → 河道 → 公海 → 审核 → 设置
PAGES = [
    ("河道（主线）", "f4-groove"),
    ("选一首歌", "p-songpicker-record"),
    ("瓶子详情", "p-bottle-record"),
    ("登录 / 注册", "p-login-record"),
    ("公海大厅", "s1-sea-record"),
    ("公海作品详情", "p-sea-detail-record"),
    ("漂流日志", "p-driftlog-record"),
    ("我的", "p-profile-record"),
    ("审核台", "s2-admin-record"),
    ("设置", "p-settings-record"),
    ("404", "p-404-record"),
]

CANVAS_W = MARGIN * 2 + COLS * TILE_W + (COLS - 1) * GAP
CANVAS_H = MARGIN * 2 + TITLE_H + ROWS * (TILE_H + LABEL_H) + (ROWS - 1) * GAP
canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), INK)
draw = ImageDraw.Draw(canvas)

# 中文标签需要真字体；PIL 读不了 woff2，用系统雅黑，取不到就退回默认位图字体
FONT_PATHS = [r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]
font_label = font_meta = None
for path in FONT_PATHS:
    try:
        font_label = ImageFont.truetype(path, 15)
        font_meta = ImageFont.truetype(path, 12)
        break
    except OSError:
        continue
if font_label is None:
    font_label = font_meta = ImageFont.load_default()

draw.text((MARGIN, MARGIN - 4), "record-v1 全站一致性对照", font=font_label, fill=PAPER)
draw.text(
    (MARGIN + 200, MARGIN + 2),
    f"{COLS}x{ROWS} · 每格 1440x900 缩至 {TILE_W}x{TILE_H} · 同一底色 {INK}",
    font=font_meta,
    fill=MUTED,
)

missing = []
for index, (name, stem) in enumerate(PAGES):
    col, row = index % COLS, index // COLS
    x = MARGIN + col * (TILE_W + GAP)
    y = MARGIN + TITLE_H + row * (TILE_H + LABEL_H + GAP)
    src = DIR / f"{stem}.png"
    if src.exists():
        tile = Image.open(src).convert("RGB").resize((TILE_W, TILE_H), Image.LANCZOS)
        canvas.paste(tile, (x, y))
        draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=LINE)
    else:
        missing.append(stem)
        draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=LINE)
        draw.text((x + TILE_W // 2 - 34, y + TILE_H // 2 - 8), "待交付", font=font_label, fill=MUTED)
    draw.text((x, y + TILE_H + 6), f"{name}", font=font_label, fill=PAPER)
    draw.text((x + 108, y + TILE_H + 9), stem, font=font_meta, fill=MUTED)

out = DIR / "_contact-sheet.png"
canvas.save(out)
print(f"{out}  {canvas.size[0]}x{canvas.size[1]}  缺 {len(missing)} 页: {missing or '无'}")
