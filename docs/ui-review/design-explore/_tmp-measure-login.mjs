import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
let found = null;
for (const entry of readdirSync(cacheRoot)) {
  const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
  if (existsSync(candidate)) found = candidate;
}
const { chromium } = await import(`file://${found.replaceAll('\\', '/')}`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///D:/Develop/projects/music/docs/ui-review/design-explore/p-login-record.html');
await page.evaluate(() => document.fonts.ready);
const overflowers = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 900.5 || r.right > 1440.5) {
      out.push(
        `${el.tagName}.${typeof el.className === 'string' ? el.className : 'svg'} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} right=${Math.round(r.right)}`,
      );
    }
  }
  return {
    out,
    documentElement: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
    bodyOffsetHeight: document.body.offsetHeight,
    page: document.querySelector('.page').scrollHeight,
    pageOffset: document.querySelector('.page').offsetHeight,
    pageClient: document.querySelector('.page').clientHeight,
  };
});
console.log(JSON.stringify(overflowers, null, 1));
await browser.close();
