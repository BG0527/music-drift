/**
 * t17 DOM 坐标探针：同一数据状态下，参考页与复刻页逐块矩形对照（不靠肉眼）。
 *
 * 用法：node docs/ui-review/t17-probe.mjs [--viewport=1280x800] [--only=bottle3,me-full]
 * 输出：docs/ui-review/t17-probe.json + 终端对照表（rect / font-size / 页面滚动条与溢出）。
 *
 * 数据来源：docs/ui-review/t17-env.json（t17-env.mjs 起的一次性库 + 参考站 + 复刻站）
 * 会话：docs/ui-review/t17-state-{a,c,d}.json（storageState，域 t17.localhost，与其它成员分键）。
 */
/* eslint-disable no-console */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const env = JSON.parse(readFileSync(join(HERE, 't17-env.json'), 'utf8'));

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value] = raw.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const [vw, vh] = (args.get('viewport') ?? '1280x800').split('x').map(Number);
const only = (args.get('only') ?? 'bottle3,bottle0,me-full,me-empty').split(',');

async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) {
      const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(candidate)) return import(`file://${candidate.replaceAll('\\', '/')}`);
    }
  }
  throw new Error('找不到 playwright 缓存');
}

const cookieOf = (key) => env.accounts[key].cookie;
const REF = `http://t17.localhost:${env.refPort}`;
const WEB = `http://t17.localhost:${env.webPort}`;

/** 每个状态：两站 URL + 两侧各自的探针选择器（选择器缺失时不报错，只记 null）。 */
function states() {
  const b3 = env.bottles.bottle3;
  const b0 = env.bottles.draft0;
  return {
    bottle3: {
      who: 'c',
      ref: `${REF}/bottle.html?id=${b3}`,
      web: `${WEB}/bottles/${b3}`,
      selectors: {
        common: ['h1'],
        ref: [
          '.crumb', 'h1', '.work', '.metaRow', '.note', '.maker', '.heroLab',
          '.segNum', '.segLab', '.cap', '.gapBox', '.gapSlot', '.cta', '.gapNote',
          '.callout', '.corkLab', '.w7-timeline', '.listenCol', '.transport', '.bar',
          '.votes', '.voteBtn', '.votesNote', '.putBack', '.destCol', '.destRow',
          '.bottomRule', '.bottom', 'svg.scene', '.selMark',
        ],
        web: [
          'main', 'nav[aria-label="面包屑"]', 'h1', '.bf-title', '.bf-meta', '.bf-note', '.maker',
          '.bp-timeline', '.groove-rail',
          '[data-testid="bottle-water-level"]', '[data-testid="bottle-body"]', 'svg.scene',
          '[data-testid="relay-timeline"] li',
          '.segNum', '.segLab', '.cap', '.cap .code', '.gapBox', '.gapSlot', '.gapNote',
          '.callout', '.corkLab', '.selMark',
          '[data-anchor="bottle-record"]', '[data-anchor="bottle-play"]', '[data-anchor="bottle-action"]',
          '.listenCol', '.transport', '.bar', '.timecode', '.votes', '.votesNote', '.putBack',
          '.destCol', '.destRow', '.bottomRule', '.bottom',
        ],
      },
    },
    bottle0: {
      who: 'a',
      ref: `${REF}/bottle.html?id=${b0}`,
      web: `${WEB}/bottles/${b0}`,
      selectors: {
        common: ['h1'],
        ref: [
          '.crumb', '.heroLab', '.segNum', '.segLab', '.gapBox', '.gapKind',
          '.gapHead', '.cta', '.gapNote', '.listenCol', '.destCol', '.destRow',
          '.bottomRule', 'svg.scene', '.w7-timeline',
        ],
        web: [
          'main', '[data-testid="bottle-water-level"]', '[data-testid="relay-timeline"] li',
          '[data-anchor="bottle-record"]', '.cta', '[data-anchor="bottle-action"]',
          '[data-anchor="bottle-play"]', '[data-anchor="groove-timeline"]',
        ],
      },
    },
    'me-full': {
      who: 'a',
      ref: `${REF}/me.html`,
      web: `${WEB}/me`,
      selectors: {
        common: ['h1'],
        ref: [
          'main', 'header', '.cat', 'h1', '.sub', '.sleeve', '.hole', '.who',
          '.crate', '.chead', '.csub', '.window', '.window li', '.lay', '.veil', '.txt',
          '.bottom', '.msgs', '.msgs h2', '.msgs ul', '.msgs li', '.pockets', '.pocket',
        ],
        web: [
          'main', 'header', 'header .cat', 'h1', '.sub', 'nav[aria-label="站内去路"]',
          '.sleeve', '.hole', '.who', '.crate', '.chead', '.csub', '.window', '.window li',
          '.lay', '.veil', '.txt', '.bottom', '.msgs', '.msgs h2', '.msgs ul', '.msgs li',
          '.pockets', '.pocket',
        ],
      },
    },
    'me-empty': {
      who: 'd',
      ref: `${REF}/me.html`,
      web: `${WEB}/me`,
      selectors: {
        common: ['h1'],
        ref: [
          'main', '.sleeve', '.crate', '.chead', '.window', '.window li', '.bottom',
          '.msgs ul', '.pockets', '.pocket',
        ],
        web: [
          'main', '.sleeve', '.crate', '.window', '[data-device="crate-band"]',
          '[data-device="crate-empty"]', '.bottom', '.msgs ul', '.pockets', '.pocket',
        ],
      },
    },
  };
}

const SELECTOR_RESULT = `(() => {
  const out = { page: { url: location.href, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, innerW: innerWidth, innerH: innerHeight } };
  out.vscroll = document.documentElement.scrollHeight > innerHeight + 1;
  out.hscroll = document.documentElement.scrollWidth > innerWidth + 1;
  return out;
})()`;

async function probe(context, url, side, selectors) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: 15_000 }).catch(() => false);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const base = await page.evaluate(SELECTOR_RESULT);
  const rects = {};
  for (const selector of selectors) {
    rects[selector] = await page.evaluate((sel) => {
      const nodes = Array.from(document.querySelectorAll(sel)).slice(0, 6);
      return nodes.map((node) => {
        const r = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          x: Math.round(r.x), y: Math.round(r.y),
          w: Math.round(r.width), h: Math.round(r.height),
          fs: style.fontSize, display: style.display,
          text: (node.textContent ?? '').trim().slice(0, 24),
          style: node.getAttribute('style') ?? '',
        };
      });
    }, selector);
  }
  await page.close();
  return { side, ...base, rects };
}

const playwright = await loadPlaywright();
const browser = await playwright.chromium.launch();
const report = { viewport: { w: vw, h: vh }, states: {} };

for (const [name, spec] of Object.entries(states())) {
  if (!only.includes(name)) continue;
  const context = await browser.newContext({ viewport: { width: vw, height: vh } });
  await context.addCookies([
    {
      name: 'mdb_session',
      value: cookieOf(spec.who).split('=').slice(1).join('='),
      domain: 't17.localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
  const ref = await probe(context, spec.url ?? spec.ref, 'ref', spec.selectors.ref);
  const web = await probe(context, spec.web, 'web', spec.selectors.web);
  await context.close();
  report.states[name] = { ref, web };
  console.log(`\n=== ${name} (${vw}x${vh}) ===`);
  console.log(
    `ref scroll=${ref.page.scrollW}x${ref.page.scrollH} vscroll=${ref.vscroll} hscroll=${ref.hscroll} | ` +
      `web scroll=${web.page.scrollW}x${web.page.scrollH} vscroll=${web.vscroll} hscroll=${web.hscroll}`,
  );
  const dump = (side, data) => {
    console.log(`-- ${side}`);
    for (const [selector, list] of Object.entries(data.rects)) {
      if (list.length === 0) {
        console.log(`   ${selector.padEnd(42)} — 未命中`);
        continue;
      }
      for (const item of list) {
        console.log(
          `   ${selector.padEnd(42)} x${String(item.x).padStart(5)} y${String(item.y).padStart(4)} w${String(item.w).padStart(5)} h${String(item.h).padStart(4)} ${item.fs.padStart(8)} ${item.text}${item.style === '' ? '' : ` ⟨${item.style}⟩`}`,
        );
      }
    }
  };
  dump('ref', ref);
  dump('web', web);
}

await browser.close();
writeFileSync(join(HERE, 't17-probe.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n→ ${join(HERE, 't17-probe.json')}`);
