"""实现 vs 设计稿并排（§5.3 的工具）：左＝设计稿，右＝真实前端截图，同一缩放。

用法：
  <bundled python> docs/ui-review/_impl-compare.py <route> <mockup-stem> [out]
例：
  <bundled python> docs/ui-review/_impl-compare.py river f4-groove
  → 读 docs/ui-review/design-explore/f4-groove.png 与 docs/ui-review/impl-1440/river.png，
    输出 docs/ui-review/_impl-cmp-river.png

为什么需要它：机器判据只能证明"编译过、不溢出"，**证明不了"那一页的记忆点还在"**。
每片实现完由 captain 用这张图逐条核对装置是否存活（见 docs/impl-plan-record-v1.md §5）。
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
DESIGN_DIR = REPO / 'docs' / 'ui-review' / 'design-explore'
IMPL_DIR = REPO / 'docs' / 'ui-review' / 'impl-1440'

TILE_W, TILE_H = 700, 438
GAP, MARGIN, TITLE_H, LABEL_H = 18, 32, 56, 30


def main() -> None:
    if len(sys.argv) < 3:
        print(__doc__)
        raise SystemExit(2)
    route, stem = sys.argv[1], sys.argv[2]
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else REPO / 'docs' / 'ui-review' / f'_impl-cmp-{route}.png'

    left, right = DESIGN_DIR / f'{stem}.png', IMPL_DIR / f'{route}.png'
    missing = [str(p) for p in (left, right) if not p.exists()]

    width = MARGIN * 2 + TILE_W * 2 + GAP
    height = MARGIN * 2 + TITLE_H + TILE_H + LABEL_H
    canvas = Image.new('RGB', (width, height), (5, 15, 20))
    draw = ImageDraw.Draw(canvas)

    font_label = font_meta = None
    for path in (r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        try:
            font_label = ImageFont.truetype(path, 17)
            font_meta = ImageFont.truetype(path, 13)
            break
        except OSError:
            continue
    if font_label is None:
        font_label = font_meta = ImageFont.load_default()

    draw.text((MARGIN, MARGIN - 6), f'{route} · 实现 vs 设计稿（左＝设计稿，右＝真实前端）', font=font_label, fill=(243, 249, 250))
    if missing:
        draw.text((MARGIN, MARGIN + 18), '缺图：' + ' , '.join(missing), font=font_meta, fill=(226, 96, 74))

    for index, (label, path) in enumerate((('设计稿', left), ('实现', right))):
        x = MARGIN + index * (TILE_W + GAP)
        y = MARGIN + TITLE_H
        if path.exists():
            with Image.open(path) as handle:
                canvas.paste(handle.convert('RGB').resize((TILE_W, TILE_H), Image.LANCZOS), (x, y))
        draw.rectangle([x, y, x + TILE_W - 1, y + TILE_H - 1], outline=(70, 92, 100))
        draw.text((x, y + TILE_H + 5), f'{label}  {path.name}', font=font_meta, fill=(150, 175, 183))

    canvas.save(out)
    print(f'{out}  {canvas.size[0]}x{canvas.size[1]}' + (f'  缺 {len(missing)} 张' if missing else ''))


if __name__ == '__main__':
    main()
