"""t17 并排对比图：ref + rep 水平拼接（同一视口 1280×800 的取证）。
用法：python _t17_compare.py <ref.png> <rep.png> <out.png> [gap]
"""
import sys
from PIL import Image

ref_path, rep_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
gap = int(sys.argv[4]) if len(sys.argv) > 4 else 12

ref = Image.open(ref_path).convert('RGB')
rep = Image.open(rep_path).convert('RGB')
h = max(ref.height, rep.height)
w = ref.width + rep.width + gap
canvas = Image.new('RGB', (w, h), (24, 24, 24))
canvas.paste(ref, (0, 0))
canvas.paste(rep, (ref.width + gap, 0))
canvas.save(out_path)
print(f'{out_path} {w}x{h} (ref {ref.width}x{ref.height} | rep {rep.width}x{rep.height})')
