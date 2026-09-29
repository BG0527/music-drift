"""t17 像素取证：ref/rep 并排图的**网格墨迹对照**（不靠肉眼，靠可复算的数）。

方法：
- 两侧各自切成 R 行 × C 列网格，统计每格「墨迹占比」= 与页面底色不同的像素比例；
- 报告三类格子：
  · MISS  参考有内容、复刻几乎空白（复刻缺结构 / 大片空区）
  · EXTRA 复刻有内容、参考空白（复刻多出来的块）
  · DIFF  两侧都有内容但密度差 > 阈值（排版/密度不一致）
用法：python _t17_inkgrid.py <ref.png> <rep.png> [--rows 12] [--cols 16] [--threshold 0.10]
"""
import sys
from PIL import Image

args = sys.argv[1:]
rows, cols, thr = 12, 16, 0.10
pos = []
i = 0
while i < len(args):
    if args[i] == '--rows':
        rows = int(args[i + 1]); i += 2
    elif args[i] == '--cols':
        cols = int(args[i + 1]); i += 2
    elif args[i] == '--threshold':
        thr = float(args[i + 1]); i += 2
    else:
        pos.append(args[i]); i += 1

ref_path, rep_path = pos[0], pos[1]


def ink_grid(path):
    img = Image.open(path).convert('L')
    w, h = img.size
    small = img.resize((cols * 8, rows * 8), Image.BOX)
    px = small.load()
    # 背景 = 出现最多的灰度（页面底色）
    hist = {}
    for y in range(small.height):
        for x in range(small.width):
            v = px[x, y]
            hist[v] = hist.get(v, 0) + 1
    bg = max(hist, key=hist.get)
    grid = []
    for r in range(rows):
        line = []
        for c in range(cols):
            ink = 0
            total = 0
            for y in range(r * 8, (r + 1) * 8):
                for x in range(c * 8, (c + 1) * 8):
                    total += 1
                    if abs(px[x, y] - bg) > 18:
                        ink += 1
            line.append(ink / total)
        grid.append(line)
    return grid, (w, h), bg


ref, ref_size, ref_bg = ink_grid(ref_path)
rep, rep_size, rep_bg = ink_grid(rep_path)
print(f'ref {ref_path} {ref_size} bg={ref_bg}')
print(f'rep {rep_path} {rep_size} bg={rep_bg}')
print()

miss, extra, diff = [], [], []
for r in range(rows):
    for c in range(cols):
        a, b = ref[r][c], rep[r][c]
        if a >= thr and b < thr * 0.5:
            miss.append((r, c, round(a, 2), round(b, 2)))
        elif b >= thr and a < thr * 0.5:
            extra.append((r, c, round(a, 2), round(b, 2)))
        elif abs(a - b) >= thr:
            diff.append((r, c, round(a, 2), round(b, 2)))


def show(title, cells):
    print(f'{title} ({len(cells)})')
    for r, c, a, b in cells:
        print(f'  row{r:02d} col{c:02d}  ref={a} rep={b}')
    print()


show('MISS 参考有/复刻无', miss)
show('EXTRA 复刻有/参考无', extra)
show('DIFF 密度差', diff)

print('网格密度对照（ref | rep，每格 0..1）:')
for r in range(rows):
    left = ' '.join(f'{ref[r][c]:.2f}' for c in range(cols))
    right = ' '.join(f'{rep[r][c]:.2f}' for c in range(cols))
    print(f'r{r:02d} {left}   |   {right}')
