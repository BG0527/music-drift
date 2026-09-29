/**
 * t6 · 全站动效增强 —— 可断言契约（`motion-web` skill §2/§3/§7/§8）。
 *
 * 本文件是**静态扫描**（jsdom 证明不了屏幕观感，见 skill §8 的分层声明）：
 *  - 重绘后的瓶体确实进了捞起/抛下分镜（不是只躺在 showcase）；
 *  - 分镜里的「留在水上」过渡、以及三处**状态语义**动效：
 *    公海分区 tab / 心情标签选中 / 段位选中 —— 参数只引契约 token、只动 transform/opacity；
 *  - 每一处都有 `prefers-reduced-motion` 逐项冻结（全局 `*{animation:none}` 之外的双保险）。
 *
 * 真机观感（60fps、缓动手感）不由本层冒充：由 guard --shot 截图 / 录屏人工目检。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGES_DIR = join(process.cwd(), 'src', 'pages');
const DESIGN_SYSTEM = join(process.cwd(), 'src', 'design-system');
const BOTTLE_FEATURES = join(process.cwd(), 'src', 'features', 'bottle');
const read = (path: string): string => readFileSync(path, 'utf8');

/** 去注释正文（守卫只扫真实声明 —— 注释里的形态说明不算内联参数，与 river-page.test 同口径）。 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 花括号配对取出 keyframes 体（与 river-page.test 同款口径）。 */
function keyframeBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const found of text.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
    let depth = 1;
    let at = (found.index ?? 0) + found[0].length;
    const start = at;
    while (at < text.length && depth > 0) {
      if (text[at] === '{') depth += 1;
      else if (text[at] === '}') depth -= 1;
      at += 1;
    }
    blocks.push(text.slice(start, at - 1));
  }
  return blocks;
}

/** keyframes 体里只能出现 transform / opacity（skill §3）。 */
function propsOf(blocks: string[]): string[] {
  return blocks.flatMap((block) =>
    [...block.matchAll(/(?:^|\n)\s*([a-z-]+)\s*:/g)].map((found) => found[1] as string),
  );
}

describe('t6 · 重绘的瓶体进了捞起/抛下分镜', () => {
  const river = (): string => read(join(PAGES_DIR, 'river-page.tsx'));

  it('FlowVessel 渲染的是 design-system 的 BottleVessel（旧 18×54 占位瓶已退场）', () => {
    expect(river(), '分镜瓶必须换成重绘件').toContain('<BottleVessel');
    expect(river(), '旧占位瓶应已删除').not.toContain('viewBox="0 0 18 54"');
  });

  it('涟漪段：瓶体挂「留在水上」的过渡类（进出配对之外的第三段）', () => {
    expect(river(), 'ripple 段未挂 hold 类').toContain('river-vessel-hold');
  });
});

describe('t6 · 分镜过渡与状态动效：参数只引契约 token、只动 transform', () => {
  it('river-motion.css：river-vessel-hold 由 --motion-ripple-duration 驱动且只动 transform', () => {
    const css = codeOnly(read(join(PAGES_DIR, 'river-motion.css')));
    const hold = /@keyframes river-vessel-hold\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(hold, '缺 @keyframes river-vessel-hold').not.toBe('');
    for (const prop of [...hold.matchAll(/(?:^|\n)\s*([a-z-]+)\s*:/g)].map((m) => m[1] as string)) {
      expect(['transform', 'opacity'], `hold 动画了非白名单属性 ${prop}`).toContain(prop);
    }
    expect(css, 'hold 必须用涟漪段时长 token').toContain('var(--motion-ripple-duration)');
    expect(css, 'hold 必须用契约缓动').toContain('var(--motion-entry-easing)');
    expect(css, '出现内联时长').not.toMatch(/\d+(?:\.\d+)?m?s\b/);
  });

  it('公海分区 tab：选中态一次性确认动效（guidance：现在看的是哪个分区）', () => {
    const sea = codeOnly(read(join(PAGES_DIR, 'sea-page.tsx')));
    expect(sea, '缺 @keyframes sea-tab-pick').toContain('@keyframes sea-tab-pick');
    expect(sea, '选中态未挂动效').toMatch(
      /\.sea-hall \.zones li\[aria-selected='true'\]\{[^}]*animation:\s*sea-tab-pick/,
    );
    expect(sea, '时长必须是 token').toContain('var(--motion-entry-duration)');
    expect(sea, '缩放比例必须是契约 hoverScale').toContain('var(--motion-hover-scale)');
    for (const prop of propsOf(keyframeBlocks(sea))) {
      expect(['transform', 'opacity'], `sea keyframes 动了 ${prop}`).toContain(prop);
    }
    expect(sea, '出现内联时长').not.toMatch(/\d+(?:\.\d+)?m?s\b/);
    expect(sea, '手写缓动').not.toContain('cubic-bezier');
  });

  it('心情标签 / 段位选中：共用 bottle-pick 确认动效（feedback + guidance）', () => {
    const mood = read(join(BOTTLE_FEATURES, 'mood-chips.tsx'));
    const relay = read(join(BOTTLE_FEATURES, 'relay-timeline.tsx'));
    expect(mood, '心情标签选中未挂确认类').toContain('mood-pick');
    expect(relay, '段位选中未挂确认类').toContain('segment-pick');

    const css = codeOnly(read(join(DESIGN_SYSTEM, 'motion.css')));
    const pick = /@keyframes bottle-pick\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(pick, '缺 @keyframes bottle-pick').not.toBe('');
    for (const prop of [...pick.matchAll(/(?:^|\n)\s*([a-z-]+)\s*:/g)].map((m) => m[1] as string)) {
      expect(['transform', 'opacity'], `bottle-pick 动了 ${prop}`).toContain(prop);
    }
    expect(pick, '缩放必须是契约 hoverScale').toContain('var(--hover-scale)');
    expect(css, '.mood-pick 未接关键帧').toMatch(/\.mood-pick\s*\{[^}]*bottle-pick/);
    expect(css, '.segment-pick 未接关键帧').toMatch(/\.segment-pick\s*\{[^}]*bottle-pick/);
    expect(css, '时长必须是 token').toMatch(/bottle-pick\s+var\(--entry-duration\)/);
    // 只扫 animation/transition 声明行（motion.css 的 :root 本来就是 token 的毫秒值登记处）
    const declarations = css.split('\n').filter((line) => /\banimation\s*:/.test(line));
    expect(declarations.length).toBeGreaterThanOrEqual(2);
    for (const line of declarations) {
      expect(line, `出现内联时长：${line}`).not.toMatch(/\d+(?:\.\d+)?m?s\b/);
    }
  });
});

describe('t6 · prefers-reduced-motion 逐项降级（全局兜底之外的双保险）', () => {
  /** 取文件**最后一个** reduce 块（要求它是文件收尾）。 */
  const reduceBlock = (text: string): string =>
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\}\s*$/.exec(text)?.[0] ?? '';

  it('river-motion.css 的 reduce 块冻结 river-vessel-hold', () => {
    const css = read(join(PAGES_DIR, 'river-motion.css'));
    const block = reduceBlock(css);
    expect(block, '缺文件收尾的 reduce 块').not.toBe('');
    expect(block, 'reduce 未冻结 river-vessel-hold').toContain('.river-vessel-hold');
  });

  it('motion.css 的 reduce 块冻结 mood-pick / segment-pick', () => {
    const block = reduceBlock(read(join(DESIGN_SYSTEM, 'motion.css')));
    expect(block, '缺 reduce 块').not.toBe('');
    expect(block).toContain('.mood-pick');
    expect(block).toContain('.segment-pick');
  });

  it('sea-page 自带 reduce 块冻结 sea-tab-pick', () => {
    const sea = read(join(PAGES_DIR, 'sea-page.tsx'));
    expect(sea, 'sea 缺 reduce 块').toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none/,
    );
  });
});

describe('t6 · 动效不是唯一反馈（skill §7）', () => {
  it('公海分区切换有 tablist/aria-selected 结构通道，段位选中有可见文字状态', () => {
    const sea = read(join(PAGES_DIR, 'sea-page.tsx'));
    expect(sea).toContain('role="tablist"');
    expect(sea).toContain('aria-selected=');
    const relay = read(join(BOTTLE_FEATURES, 'relay-timeline.tsx'));
    expect(relay, '选中段必须有文字标识（不只是动效）').toMatch(/isSelected\s*\?/);
  });
});
