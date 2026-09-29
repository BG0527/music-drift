/** t17 /me 底部两栏子树对照（参考 vs 复刻）：打印 .bottom 后代的 rect 与文本，定位 ink 差异。 */
/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const env = JSON.parse(readFileSync(join(HERE, 't17-env.json'), 'utf8'));

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

async function dump(label, url, cookie) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([
    {
      name: 'mdb_session',
      value: cookie.split('=').slice(1).join('='),
      domain: 't17.localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const rows = await page.evaluate(() => {
    const root = document.querySelector('.bottom') ?? document.querySelector('.p-record');
    if (root === null) return ['no .bottom'];
    const out = [];
    const walk = (node, depth) => {
      if (depth > 4) return;
      for (const child of Array.from(node.children)) {
        const r = child.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          out.push(
            `${'  '.repeat(depth)}<${child.tagName.toLowerCase()} class="${String(child.className).slice(0, 40)}"> x${Math.round(r.x)} y${Math.round(r.y)} w${Math.round(r.width)} h${Math.round(r.height)} :: ${(child.textContent ?? '').trim().slice(0, 40)}`,
          );
          walk(child, depth + 1);
        }
      }
    };
    walk(root, 0);
    return out;
  });
  console.log(`=== ${label} (${url})`);
  console.log(rows.join('\n'));
  await context.close();
}

await dump('REF me (account a)', `http://t17.localhost:${env.refPort}/me.html`, env.accounts.a.cookie);
await dump('WEB me (account a)', `http://t17.localhost:${env.webPort}/me`, env.accounts.a.cookie);
await browser.close();
