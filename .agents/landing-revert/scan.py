import json, os, glob, re, sys

OUT = r'D:\Develop\projects\music\.agents\landing-revert'
report = []

def log(s):
    report.append(s)

# --- dsh sessions ---
dsh_dir = r'C:\Users\BG\.dsh\sessions\--D-Develop-projects-music--'
jsonls = sorted(glob.glob(os.path.join(OUT, 'session-*.jsonl')))

for f in jsonls:
    base = os.path.basename(f)
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        if 'landing-page' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        t = o.get('type')
        if t == 'tool/call':
            d = o.get('data', {})
            name = d.get('name') or d.get('tool') or '?'
            args = d.get('args') or d.get('arguments') or d.get('input') or {}
            if isinstance(args, str):
                try: args = json.loads(args)
                except Exception: args = {'raw': args}
            fp = args.get('file_path') or args.get('path') or args.get('filePath') or ''
            if 'landing-page' in str(fp) or 'landing-page' in json.dumps(args, ensure_ascii=False)[:200]:
                clen = len(json.dumps(args, ensure_ascii=False))
                log(f'{base}\tL{i}\ttime={o.get("time")}\tTOOL={name}\tfile={fp}\targslen={clen}')
        elif t in ('workspace/changes',):
            log(f'{base}\tL{i}\t{t}\t{json.dumps(o, ensure_ascii=False)[:300]}')

# --- codex sessions ---
codex_dir = r'C:\Users\BG\.codex\sessions\2026\09\28'
for f in sorted(glob.glob(os.path.join(codex_dir, '*.jsonl'))):
    base = os.path.basename(f)
    for i, line in enumerate(open(f, encoding='utf-8', errors='replace'), 1):
        if 'landing-page' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        # codex rollout format: {"timestamp":..., "type":..., "payload":{...}}
        ts = o.get('timestamp', '')
        t = o.get('type', '')
        payload = o.get('payload', {})
        pt = payload.get('type', '')
        s = json.dumps(payload, ensure_ascii=False)
        if pt in ('function_call',) or 'apply_patch' in s or 'apply_patch' in line:
            # get name and args
            name = payload.get('name', '')
            args = payload.get('arguments', '')
            if isinstance(args, str) and 'landing-page' in args:
                log(f'{base}\tL{i}\t{ts}\tCODEX {pt} name={name}\targlen={len(args)}')
            elif 'landing-page' in s:
                log(f'{base}\tL{i}\t{ts}\tCODEX {pt} name={name}\t(payload len {len(s)})')

with open(os.path.join(OUT, 'scan-report.txt'), 'w', encoding='utf-8') as fh:
    fh.write('\n'.join(report))
print('lines in report:', len(report))
