/** 一次性 DOM 结构探针：打印 .window 的子树两层（tag/class/宽度），用于定位 li 变窄的根因。 */
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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
await page.goto(`http://t17.localhost:${env.webPort}/me`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const out = await page.evaluate(() => {
  const dump = (node, depth) => {
    const r = node.getBoundingClientRect();
    const rows = [
      `${'  '.repeat(depth)}<${node.tagName.toLowerCase()} class="${node.className}" x=${Math.round(r.x)} w=${Math.round(r.width)} h=${Math.round(r.height)}>`,
    ];
    if (depth < 3) for (const child of Array.from(node.children)) rows.push(...dump(child, depth + 1));
    return rows;
  };
  const win = document.querySelector('.window');
  if (win === null) return ['no .window'];
  const rows = dump(win, 0);
  const ul = win.querySelector('ul');
  const li = win.querySelector('li');
  if (ul !== null && li !== null) {
    const cs = getComputedStyle(li);
    const us = getComputedStyle(ul);
    rows.push(
      `ul display=${us.display} dir=${us.flexDirection} align=${us.alignItems} justify=${us.justifyContent} children=${ul.children.length} width=${us.width} | li display=${cs.display} pos=${cs.position} flex=${cs.flex} basis=${cs.flexBasis} grow=${cs.flexGrow} minW=${cs.minWidth} maxWidth=${cs.maxWidth} width=${cs.width} offsetW=${li.offsetWidth} rectW=${Math.round(li.getBoundingClientRect().width)}`,
    );
    // 扫描所有样式表里命中该 li 的规则
    const matched = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      const walk = (list) => {
        for (const rule of Array.from(list)) {
          if (rule.selectorText === undefined) {
            if (rule.cssRules !== undefined && rule.cssRules !== null) walk(rule.cssRules);
            continue;
          }
          try {
            if (li.matches(rule.selectorText) && /flex|width|position/.test(rule.cssText)) {
              matched.push(`${rule.selectorText} { ${rule.style.cssText} }`);
            }
          } catch {
            /* 选择器不可匹配（如 @keyframes）忽略 */
          }
        }
      };
      walk(rules);
    }
    rows.push(...matched.map((m) => `  rule: ${m}`));
    rows.push(`li matches '.window li'=${li.matches('.window li')} parent=${li.parentElement?.tagName}`);
  }
  return rows;
});
console.log(out.join('\n'));
await browser.close();
