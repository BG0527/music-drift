import os, glob, subprocess, sys

OUT = r'D:\Develop\projects\music\.agents\landing-revert'
dsh = r'C:\Users\BG\.dsh\sessions\--D-Develop-projects-music--'
count = 0
for d in sorted(os.listdir(dsh)):
    src = os.path.join(dsh, d, 'session.v4.jsonl.zstd')
    if not os.path.exists(src):
        continue
    dst = os.path.join(OUT, d + '.jsonl')
    if os.path.exists(dst):
        continue
    r = subprocess.run(['zstd', '-d', '-f', '-q', src, '-o', dst], capture_output=True)
    if r.returncode != 0:
        print('fail', d, r.stderr.decode(errors='replace'))
    else:
        count += 1
print('decompressed:', count)
