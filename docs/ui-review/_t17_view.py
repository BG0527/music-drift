"""t17 视检小样：把 ref/rep 两张截图缩到 1272×790 以内并排，供可信管线（8199 → navigate → visual）目检。
用法：python _t17_view.py <ref.png> <rep.png> <out.png>
"""
import sys
from PIL import Image

ref_path, rep_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
MAX_W, MAX_H = 1272, 790
GAP = 12

ref = Image.open(ref_path).convert('RGB')
rep = Image.open(rep_path).convert('RGB')
scale = min((MAX_W - GAP) / 2 / ref.width, MAX_H / max(ref.height, rep.height))
size = (round(ref.width * scale), round(ref.height * scale))
r1 = ref.resize(size, Image.LANCZOS)
r2 = rep.resize(size, Image.LANCZOS)
canvas = Image.new('RGB', (size[0] * 2 + GAP, size[1]), (24, 24, 24))
canvas.paste(r1, (0, 0))
canvas.paste(r2, (size[0] + GAP, 0))
canvas.save(out_path)
print(f'{out_path} {canvas.size[0]}x{canvas.size[1]} (scale {scale:.3f})')
