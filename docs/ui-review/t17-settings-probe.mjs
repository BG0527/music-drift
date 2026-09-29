/**
 * t17 settings 五线抽测（验收⑦：settings 五线零误差不回退）。
 * 量 /settings 上：画出的水线（anonymous-waterline）、背景干湿分界（.set-sea）、
 * 纸的干湿分界、瓶接触水皮、倒影顶 五条 y —— 参考口径全部 = 520（1440×900 档 520·--u）。
 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const env = JSON.parse(readFileSync(join(HERE, 't17-env.json'), 'utf8'));
const [vw, vh] = (process.argv[2] ?? '1440x900').split('x').map(Number);

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('no playwright');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: vw, height: vh } });
await context.addCookies([
  {
    name: 'mdb_session',
    value: env.accounts.a.cookie.split('=').slice(1).join('='),
    domain: 't17.localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
  },
]);
const page = await context.newPage();
await page.goto(`http://t17.localhost:${env.webPort}/settings`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: 15_000 }).catch(() => false);
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
const rows = await page.evaluate(() => {
  const y = (sel) => {
    const node = document.querySelector(sel);
    if (node === null) return null;
    const r = node.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    scroll: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight },
    lines: {
      '水面线 [data-device=anonymous-waterline]': y('[data-device="anonymous-waterline"]'),
      '背景湿侧 .set-sea': y('.set-sea'),
      '纸干湿分界 .set-leaf-dry 下沿': y('.set-leaf-dry'),
      '瓶接触水皮 [data-part=contact]': y('[data-part="contact"]'),
      '倒影顶 .set-refl': y('.set-refl'),
    },
  };
});
console.log(JSON.stringify(rows, null, 2));
await browser.close();
