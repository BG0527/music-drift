/**
 * Landing v2（`/` 根路由 · 整页翻页式）—— t12。
 *
 * ## 裁决沿革
 * - t4：介绍页挂 `/intro`（长滚动六段）；
 * - **t12 用户新裁决**：`/` 直接渲染本页，`/intro` 独立路由收编删除；
 *   原「`/` → `/river` 规范化」（第十三轮 ①）被覆盖（`canonicalHref` 已删除）。
 *
 * ## 内容
 * v3 文案（用户逐屏 grill 锁定）唯一依据 = `docs/landing-copy-v3.md`：
 * 8 屏（开场 + 七段追问）、标题系统 A「瓶语线」、双轴主心（声音案底 / 计数与回应）、
 * 三列五行对比表、新增等待屏「它漂到哪儿了」；方向 A「顺流」的翻页叙事照旧
 * （`docs/landing-brainstorm.md` §5/§6 已同步 v3）。
 *
 * ## 翻页交互（用户指定）
 * - 滚轮/触控板一划 = 翻一整页：**root 不滚动**（`h-[100dvh] overflow-hidden` + 离散
 *   `translateY(calc(i * 100dvh))`），wheel 以 `{ passive: false }` 挂载并 `preventDefault`
 *   接管；屏内有可滚余量时先交还原生滚动（矮视口/手机不吞内容）；
 * - 页码指示 `01 / 08`（`aria-live` 播报，动效不是唯一反馈）+ 右侧圆点导航（带屏名、
 *   可点、`aria-current`）+ 方向键/PageUp/PageDown/Home/End；
 * - 防抖：一次翻页后锁定 `motion.entryDuration`（480ms，契约 token）——快速连滑不跳页；
 * - reduced-motion：过渡只引 `--motion-page-duration`/`--motion-entry-easing`，由
 *   motion.css 全局 `transition: none` 降级为**即时切换**（不删功能、只去位移）。
 *
 * ## 动效纪律（motion-web）
 * 目的 = continuity（切屏的空间连续感）；只动 `transform`；反馈通道 = 页码文字 +
 * `aria-current` 圆点 + `aria-live`；参数全部来自设计契约 token，无内联 ms/缓动。
 *
 * ## 装置与红线
 * Platter + Glint 背景层；BottleMark（水位=已录段数，承担信息）；播放进度槽（唱针语法）。
 * 无 emoji / AI 陈词 / lorem / 15–30 旧口径 / 内联 hex / h-screen；
 * feature 卡片栅格非对称（CONFLICTS #7），三等宽仅出现在带序号顺序步骤 `<ol>` 内。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type { BottleDetail } from '@music-drift/shared';
import { BottleMark, BottleVessel, Button, Icon, Skeleton, cn, motion } from '../design-system';
import { segmentAudioUrl, useBottle, useSeaList } from '../features/api/queries';
import { useSegmentPlayer } from '../features/audio';
import { TEXT_LINK, TEXT_LINK_GHOST, TEXT_LINK_PRIMARY } from './shell/link-styles';
import { Link } from './shell/router';
import './landing-page.css';

/* ────────────────────────────── 屏幕编排 ────────────────────────────── */

interface ScreenMeta {
  id: string;
  title: string;
}

/** 8 屏：开场（三问首屏）+ 七段追问（每屏一段）。v3 文案唯一依据：docs/landing-copy-v3.md。 */
const SCREENS: readonly ScreenMeta[] = [
  { id: 'intro-hero', title: '开场' },
  { id: 'intro-what', title: '漂流瓶，是什么' },
  { id: 'intro-how', title: '怎么漂起来' },
  { id: 'intro-diff', title: '歌，都漂去哪儿' },
  { id: 'intro-scene', title: '什么时候，漂一瓶' },
  { id: 'intro-wait', title: '它漂到哪儿了' },
  { id: 'intro-trust', title: '漂流的规矩' },
  { id: 'intro-try', title: '投出你的第一瓶' },
];

const LAST_SCREEN = SCREENS.length - 1;

/** 一次翻页后的锁定窗口（防连滑连跳）；取契约 token，不另造数字。 */
const WHEEL_LOCK_MS = motion.entryDuration;
/** 输入噪声门槛与滑动阈值：这是事件噪声过滤，不是动效参数（动效参数一律走 token）。 */
const WHEEL_EPSILON = 2;
const SWIPE_MIN_PX = 60;

/* ────────────────────────────── 文案（v3 定稿 · docs/landing-copy-v3.md） ────────────────────────────── */

/** 记忆钩子（v3 方案乙 · 四四对仗：案底轴"无痕" + 回应轴"有应"）。 */
const HOOK = '唱过无痕，声声有应。';

/** 定义（v3 用户定稿 32 字；测试放宽至 ≤32，依据 docs/landing-copy-v3.md §2）。 */
const DEFINITION = '匿名接力唱：唱约 20 秒投进河里，陌生人接唱下一段，四段拼成一首。';

/** 价值句（双轴总纲：轴一不署名不入册 / 轴二有没有人接住你的声音）。 */
const VALUE_LINE =
  '接力链不公开账号，也不比谁唱得好——只问一件事：有没有人，接住你的声音。';

/** 链尾 CTA（t12 用户指定动作词）：去开始体验 → /login → 河道（next 走 encodeURIComponent）。 */
const CTA_HREF = `/login?next=${encodeURIComponent('/river')}`;

/* ────────────────────────────── 段落数据 ────────────────────────────── */

interface PlayableSegment {
  id: string;
  index: number;
  ownerCode: string;
  durationMs: number;
}

function playableSegmentsOf(detail: BottleDetail | undefined): PlayableSegment[] {
  if (detail === undefined) return [];
  return detail.segments
    .filter(
      (segment) =>
        segment.deletedAt === null && segment.audioMime !== null && segment.durationMs !== null,
    )
    .sort((left, right) => left.index - right.index)
    .map((segment) => ({
      id: segment.id,
      index: segment.index,
      ownerCode: segment.ownerCode,
      durationMs: segment.durationMs ?? 0,
    }));
}

/* ──────────────────────────── 当场体验播放器 ──────────────────────────── */

type Playback = 'idle' | 'playing' | 'paused' | 'ended';

const CTA_UI: Record<Playback, { label: string; icon: 'Play' | 'Pause' | 'RotateCcw' }> = {
  idle: { label: '当场听一支成品', icon: 'Play' },
  playing: { label: '暂停', icon: 'Pause' },
  paused: { label: '继续听', icon: 'Play' },
  ended: { label: '从头再听一遍', icon: 'RotateCcw' },
};

const STATE_TEXT: Record<Playback, string> = {
  idle: '待播放',
  playing: '正在播放',
  paused: '已暂停',
  ended: '本段已播完',
};

/** 接力链播放：一段播完自动接下一段（陌生人接力在页内的最小演示）。 */
function ExperiencePlayer({
  songTitle,
  segments,
}: {
  songTitle: string;
  segments: PlayableSegment[];
}) {
  const total = segments.length;
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, total - 1);
  const current = segments[safeIndex] as PlayableSegment;
  const player = useSegmentPlayer({
    src: segmentAudioUrl(current.id),
    durationMs: current.durationMs,
  });
  const autoAdvanceRef = useRef(false);

  useEffect(() => {
    if (player.playbackState === 'ended' && safeIndex < total - 1) {
      autoAdvanceRef.current = true;
      setIndex(safeIndex + 1);
    }
  }, [player.playbackState, safeIndex, total]);

  useEffect(() => {
    if (!autoAdvanceRef.current) return;
    autoAdvanceRef.current = false;
    player.toggle();
  }, [safeIndex, player.toggle]);

  function onCta(): void {
    if (player.playbackState === 'ended') {
      if (total > 1) {
        autoAdvanceRef.current = true;
        setIndex(0);
      } else {
        player.replay();
      }
      return;
    }
    player.toggle();
  }

  function onSelect(next: number): void {
    if (next === safeIndex) return;
    autoAdvanceRef.current = player.isPlaying;
    setIndex(next);
  }

  const cta = CTA_UI[player.playbackState];
  const percent = Math.round(player.ratio * 100);

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[1.1875rem] font-semibold leading-tight text-paper">{songTitle}</p>
        <p className="font-latin text-[0.78125rem] text-muted">
          第 {safeIndex + 1} 段 · {current.ownerCode}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          onClick={onCta}
          icon={<Icon name={cta.icon} size={18} />}
          className="whitespace-nowrap"
        >
          {cta.label}
        </Button>
        <p role="status" aria-live="polite" className="text-[0.875rem] text-muted">
          {STATE_TEXT[player.playbackState]} · 第 {safeIndex + 1} 段 / 共 {total} 段
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-sm bg-line/10"
      >
        <div
          className="h-1.5 origin-left rounded-sm bg-coral transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]"
          style={{ transform: `scaleX(${String(player.ratio)})` }}
        />
      </div>

      <ul className="flex flex-wrap gap-2">
        {segments.map((segment, segmentIndex) => (
          <li key={segment.id}>
            <button
              type="button"
              aria-pressed={segmentIndex === safeIndex}
              onClick={() => onSelect(segmentIndex)}
              className={cn(
                'min-h-11 whitespace-nowrap rounded-base border px-3 text-[0.78125rem] font-medium',
                'transition-colors duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                segmentIndex === safeIndex
                  ? 'border-coral text-coral'
                  : 'border-hairline text-muted hover:text-paper',
              )}
            >
              第 {segment.index} 段
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExperienceFallback({ text }: { text: string }) {
  return (
    <div className="mt-4 flex flex-col gap-1">
      <p className="text-[0.875rem] leading-[1.8] text-muted">{text}</p>
      <Link to="/river" className={TEXT_LINK}>
        先去河道看看
      </Link>
    </div>
  );
}

/** 数据装配：公海列表（公开接口）→ 第一支成品详情 → 页内接力链播放（免注册）。 */
function ExperienceSection() {
  const sea = useSeaList('COMPLETED');
  const firstId = sea.data?.items[0]?.id;
  const detail = useBottle(firstId);
  const segments = playableSegmentsOf(detail.data);

  const loadingBlock = (
    <div className="mt-4 flex flex-col gap-3" aria-busy="true">
      <Skeleton height="2.5rem" width="14rem" />
      <Skeleton height="1rem" width="100%" />
      <p className="text-[0.875rem] text-muted">正在取一支公海成品…</p>
    </div>
  );

  if (sea.isLoading || (firstId !== undefined && detail.isLoading)) return loadingBlock;
  if (sea.isError) return <ExperienceFallback text="公海暂时取不到成品，先去河道看看。" />;
  if (sea.data !== undefined && sea.data.items.length === 0) {
    return <ExperienceFallback text="公海还没有成品，先去河道看看在漂的瓶子。" />;
  }
  if (detail.data === undefined) {
    if (detail.isError) {
      return <ExperienceFallback text="这支成品的声音还没就绪，先去河道看看。" />;
    }
    return loadingBlock;
  }
  if (segments.length === 0) {
    return <ExperienceFallback text="这支成品还没有可播放的段落，先去河道看看。" />;
  }
  return <ExperiencePlayer songTitle={detail.data.songTitle} segments={segments} />;
}

/* ────────────────────────────── 段落素材 ────────────────────────────── */

function SectionHeading({ index, id, children }: { index: string; id: string; children: string }) {
  return (
    <div className="landing-section-heading mb-6 flex items-baseline gap-4">
      <span aria-hidden="true" className="font-latin text-[0.6875rem] tracking-[0.24em] text-coral">
        {index}
      </span>
      <h2 id={id} className="text-[1.625rem] font-bold leading-tight text-paper">
        {children}
      </h2>
    </div>
  );
}

/**
 * 三列五行对比表（v4 定稿）。竞品事实口径由用户提供，不得扩写：
 * 原漂流瓶 = 独唱（可选片段）+ 账号级透明互动；现有合唱 = 双方账号透明、
 * 固定两个人、指定人配对（无法随机）。见 docs/landing-copy-v3.md §5。
 */
const DIFF_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  [
    '录完之后',
    '歌停在草稿箱，等一个敢',
    '挂在账号上，等一个指定的人',
    '投进河里，河替你遇见下一个人',
  ],
  ['开始的条件', '自己独唱', '指定的人，无法随机', '随机捞起，听见心动就接唱'],
  ['对方是谁', '以账号相见，透明可查', '双方账号透明，固定两人', '一个只属于这只瓶的代号'],
  ['同一首歌有几个人', '只有你', '固定两个人', '多人接力，由陌生人拼成一首'],
  ['作品给谁欣赏', '留在你自己的主页', '两个人的账号', '入海——所有人的公共作品集'],
];

const SCENES: ReadonlyArray<{ key: string; title: string; body: string; span: string }> = [
  {
    key: 'commute',
    title: '通勤',
    body: '挤在地铁里捞起一个瓶子，唱一段；到站之前，刚好唱完。',
    span: 'md:col-span-3',
  },
  {
    key: 'sleep',
    title: '睡前',
    body: '灯关了，世界只剩你和伴奏。录一段投出去，关上手机，让它自己漂。',
    span: 'md:col-span-2',
  },
  {
    key: 'noon',
    title: '午休',
    body: '吃完饭接别人的一段，回工位的路上，这支歌又多了一段。',
    span: 'md:col-span-2',
  },
];

/** 等待屏（v3 新增 · 轴二）：漂流日志 / 漂流中 / 揭晓 / 敲门，事实出处见 copy-v3 §7。 */
const WAIT_CARDS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: '漂流日志',
    body: '瓶子漂到哪了，随时看得见：每一棒的瓶级代号和核心漂流事件，不暴露账号。',
  },
  {
    title: '漂流中',
    body: '「已传 3 棒 · 最后活跃在 2 小时前 · 正在等待下一棒」。当前已录的每一段都可以试听。',
  },
  {
    title: '揭晓',
    body: '入海后，完整作品进入公海；完成作品可以收藏，等待接力的作品也能继续接唱。',
  },
  {
    title: '敲门',
    body: '完成时它会来敲门：「你参与过的漂流瓶已完成，点击查看完整接力链。」',
  },
];

const TRUST: ReadonlyArray<{ title: string; body: string }> = [
  { title: '瓶与瓶是断的', body: '每个瓶子单发一个代号；一个代号，跨不出这只瓶。' },
  { title: '想说"不好"，先听完 80%', body: '同一段一人一票，作者不能踩自己。' },
  { title: '赞只显示热度，不救生', body: '斩浪只用来防捣乱，不针对人。' },
  { title: '有人管', body: '瓶子、段落、留言都能举报，人工审核拥有最终决定权。' },
  { title: '失控有时限', body: '72 小时没人接，自动退回或入海；回传决策限时 48 小时。' },
  {
    title: '你看到的就是做出来的',
    body: '本页介绍的每条规则都已在 Demo 里实现，顺着入口就能走到。',
  },
];

/**
 * 全页唯一的河与主瓶。它不在翻页轨道中，因此切屏时不会 remount；视觉连续性由根节点
 * `data-journey` 驱动，CSS 只过渡 transform / opacity。远景瓶是静态环境信息。
 */
function RiverJourney() {
  return (
    <div
      className="landing-river-stage"
      data-river-continuity=""
      data-bottle-lane=""
      aria-hidden="true"
    >
      <svg className="landing-river-map" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="landing-river-current" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-water-surface)" />
            <stop offset="0.52" stopColor="var(--color-water-body)" />
            <stop offset="1" stopColor="var(--color-water-bed)" />
          </linearGradient>
          <radialGradient id="landing-sea-mouth" cx="0.45" cy="0.45" r="0.7">
            <stop offset="0" stopColor="var(--color-water-surface)" />
            <stop offset="1" stopColor="var(--color-water-void)" />
          </radialGradient>
        </defs>
        <path
          className="landing-river-shadow"
          d="M-80 770 C190 650 330 790 545 700 S850 625 1010 730 S1255 810 1420 710 S1580 730 1700 820"
        />
        <path
          className="landing-river-water"
          d="M-80 770 C190 650 330 790 545 700 S850 625 1010 730 S1255 810 1420 710 S1580 730 1700 820"
        />
        <path
          className="landing-river-thread landing-river-thread-a"
          d="M-80 730 C180 610 330 745 535 660 S845 585 1020 690 S1260 770 1420 670 S1580 690 1700 780"
        />
        <path
          className="landing-river-thread landing-river-thread-b"
          d="M-60 815 C210 700 335 835 555 750 S855 675 1000 780 S1250 860 1430 755 S1580 780 1690 865"
        />
        <ellipse
          data-river-sea=""
          className="landing-river-sea"
          cx="1540"
          cy="780"
          rx="300"
          ry="170"
          fill="url(#landing-sea-mouth)"
        />
      </svg>

      <div className="landing-far-bottle landing-far-bottle-a" data-far-bottle="">
        <BottleVessel size={22} />
      </div>
      <div className="landing-far-bottle landing-far-bottle-b" data-far-bottle="">
        <BottleVessel size={17} />
      </div>
      <div className="landing-far-bottle landing-far-bottle-c" data-far-bottle="">
        <BottleVessel size={19} />
      </div>

      <div className="landing-protagonist" data-journey-bottle="">
        <span className="landing-protagonist-halo" />
        <BottleVessel size={58} />
      </div>
    </div>
  );
}

/* ────────────────────────────── 页面 ────────────────────────────── */

/** 屏内容（body 不含屏壳）：0 = 开场三问，1–7 = 七段追问。 */
function screenBody(screenIndex: number): ReactNode {
  switch (screenIndex) {
    case 0:
      return (
        <div className="landing-hero grid grid-cols-1 items-start gap-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12">
          <div className="landing-hero-copy flex min-w-0 flex-col gap-5">
            <p className="font-latin text-[0.6875rem] tracking-[0.24em] text-muted">
              音乐共创 · 匿名接力
            </p>
            <h1
              id="intro-hook"
              className="text-[clamp(2rem,4.5vw,3.5rem)] font-bold leading-[1.15] text-paper"
            >
              {HOOK}
            </h1>
            <p className="max-w-[38ch] text-[1.0625rem] leading-[1.85] text-paper">{DEFINITION}</p>
            <p className="border-l-2 border-coral pl-4 text-[0.9375rem] leading-[1.85] text-muted">
              {VALUE_LINE}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link to="/new" className={TEXT_LINK_GHOST}>
                唱一段投进去
              </Link>
            </div>
          </div>

          <div
            id="intro-experience"
            className="landing-listen-deck scroll-mt-24 rounded-lg border border-line/20 bg-water-void p-5 md:p-6"
          >
            <p className="font-latin text-[0.6875rem] tracking-[0.24em] text-muted">
              公海成品 · 免注册
            </p>
            <p className="mt-2 text-[0.9375rem] leading-[1.85] text-paper">
              四段接力拼成的一支成品，点开就能听。
            </p>
            <ExperienceSection />
            <p className="mt-4 text-[0.78125rem] leading-[1.8] text-muted">
              不用注册，也不用麦克风——现在，只负责听。
            </p>
          </div>
        </div>
      );
    case 1:
      return (
        <div>
          <SectionHeading index="01" id="h-what">
            漂流瓶，是什么
          </SectionHeading>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_1fr] md:gap-12">
            <div className="flex min-w-0 flex-col gap-4">
              <p className="text-[1.0625rem] leading-[1.85] text-paper">
                一个基于匿名接力的音乐共创社区——唱一段，投进河里，让陌生人接棒，最终汇入公海。
              </p>
              <p className="text-[0.9375rem] leading-[1.85] text-muted">
                这里不收整首歌，只收你敢开口的 20 秒。四段声音来自几位陌生人，合成一首没有主角的歌。
              </p>
              <p className="text-[0.9375rem] leading-[1.85] text-coral">
                我的声音会和谁的声音拼在一起？
              </p>
            </div>
            <dl className="landing-glossary grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ['漂流瓶', '一段尚未唱完的歌，正在河上'],
                ['河道', '没有搜索，没有关注——只能随机遇见'],
                ['公海', '所有歌的终点，谁都能来听'],
                ['匿名代号', '接力链只显示瓶级代号，不公开账号'],
              ].map(([term, desc]) => (
                <div key={term} className="flex flex-col gap-1 border-l border-hairline pl-3">
                  <dt className="text-[0.9375rem] font-semibold text-paper">{term}</dt>
                  <dd className="text-[0.78125rem] leading-[1.8] text-muted">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      );
    case 2:
      return (
        <div>
          <SectionHeading index="02" id="h-how">
            怎么漂起来
          </SectionHeading>
          <ol className="landing-steps grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
            {[
              ['唱一段', '挑一首你熟的歌，系统替你切成四段，每段约 20 秒；你只录第 1 段。'],
              ['投进河', '不挑听众，不看主页，谁捞到它，由河说了算。'],
              [
                '接力拼完',
                '捞到的人续唱下一段，可以继续投河，也可以沿着来路把整首歌送回你手里；四段齐了，入海。',
              ],
            ].map(([title, body], stepIndex) => (
              <li key={title} className="flex flex-col gap-2 border-t border-hairline pt-4">
                <span
                  aria-hidden="true"
                  className="font-latin text-[0.6875rem] tracking-[0.24em] text-glass"
                >
                  {`0${String(stepIndex + 1)}`}
                </span>
                <h3 className="text-[1.1875rem] font-semibold text-paper">{title}</h3>
                <p className="text-[0.9375rem] leading-[1.85] text-muted">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-5 border-t border-hairline pt-6">
            <BottleMark size={56} filled={4} />
            <div className="min-w-0">
              <p className="text-[0.9375rem] leading-[1.85] text-paper">
                回传让作品不只是被陌生人接续，而是被陌生人接力送回家。
              </p>
              <p className="mt-1 text-[0.78125rem] leading-[1.8] text-muted">
                瓶中水位 = 已唱段数：四段齐了才入海。
              </p>
            </div>
          </div>
        </div>
      );
    case 3:
      return (
        <div>
          <SectionHeading index="03" id="h-diff">
            歌，都漂去哪儿
          </SectionHeading>
          <div className="landing-comparison w-full min-w-0 overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '27%' }} />
                <col style={{ width: '27%' }} />
              </colgroup>
              <thead>
                <tr className="border-b border-line/20">
                  <th scope="col" className="pb-3 pr-3 text-[0.6875rem] font-normal text-muted">
                    对比维度
                  </th>
                  <th scope="col" className="pb-3 pr-3 text-[0.875rem] font-semibold text-muted">
                    原漂流瓶
                  </th>
                  <th scope="col" className="pb-3 pr-3 text-[0.875rem] font-semibold text-muted">
                    现有合唱
                  </th>
                  <th scope="col" className="pb-3 text-[0.875rem] font-semibold text-coral">
                    本品
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIFF_ROWS.map(([dimension, bottle, duet, ours]) => (
                  <tr key={dimension} className="border-b border-hairline align-top">
                    <th scope="row" className="py-3 pr-3 text-[0.8125rem] text-paper">
                      {dimension}
                    </th>
                    <td className="py-3 pr-3 text-[0.8125rem] leading-[1.7] text-muted">{bottle}</td>
                    <td className="py-3 pr-3 text-[0.8125rem] leading-[1.7] text-muted">{duet}</td>
                    <td className="py-3 text-[0.8125rem] leading-[1.7] text-paper">{ours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 text-[0.9375rem] leading-[1.85] text-muted">
            合唱要先指定对方，配不上就开不了口；这里没有配对——随机捞起一个陌生的声音，听见喜欢的，就接下去。
          </p>
          <p className="mt-3 text-[0.9375rem] leading-[1.85] text-paper">
            有些天籁不缺勇气，只差一个没听过你的听众。
          </p>
          <p className="mt-4 text-[1.0625rem] leading-[1.85] text-coral">
            你负责开口，剩下的交给漂流。
          </p>
        </div>
      );
    case 4:
      return (
        <div>
          <SectionHeading index="04" id="h-scene">
            什么时候，漂一瓶
          </SectionHeading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            {SCENES.map((scene) => (
              <article
                key={scene.key}
                className={cn(
                  'landing-scene-card flex flex-col gap-3 rounded-base border border-hairline p-6',
                  scene.span,
                  scene.key === 'commute' && 'bg-water-void',
                )}
              >
                <h3 className="text-[1.1875rem] font-semibold text-paper">{scene.title}</h3>
                <p className="text-[0.9375rem] leading-[1.85] text-muted">{scene.body}</p>
                <p className="font-latin mt-auto text-[0.75rem] tracking-[0.1em] text-glass">
                  一段约 20 秒
                </p>
              </article>
            ))}
            <p className="flex items-center justify-center rounded-base border border-hairline p-6 text-center text-[0.9375rem] leading-[1.85] text-paper md:col-span-3">
              一段歌的长度，一次开口的勇气。
            </p>
          </div>
        </div>
      );
    case 5:
      return (
        <div>
          <SectionHeading index="05" id="h-wait">
            它漂到哪儿了
          </SectionHeading>
          <p className="text-[1.0625rem] leading-[1.85] text-paper">
            等待不是空白——日志里每一行，都是有人来过。
          </p>
          <ul className="landing-info-grid mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {WAIT_CARDS.map((item) => (
              <li
                key={item.title}
                className="landing-info-card flex min-w-0 flex-col gap-1 rounded-base border border-hairline p-5"
              >
                <h3 className="text-[0.9375rem] font-semibold text-paper">{item.title}</h3>
                <p className="text-[0.8125rem] leading-[1.8] text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-l-2 border-coral pl-4 text-[0.9375rem] leading-[1.85] text-paper">
            你等的不是点赞数，是下一棒的脚印。
          </p>
        </div>
      );
    case 6:
      return (
        <div>
          <SectionHeading index="06" id="h-trust">
            漂流的规矩
          </SectionHeading>
          <ul className="landing-info-grid landing-trust-grid grid grid-cols-1 gap-4 md:grid-cols-2">
            {TRUST.map((item) => (
              <li
                key={item.title}
                className="landing-info-card flex min-w-0 flex-col gap-1 rounded-base border border-hairline p-5"
              >
                <h3 className="text-[0.9375rem] font-semibold text-paper">{item.title}</h3>
                <p className="text-[0.8125rem] leading-[1.8] text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-l-2 border-coral pl-4 text-[0.8125rem] leading-[1.8] text-muted">
            公开评论直接显示账号名；私密留言送达后，只有通信双方互相看到账号名。
          </p>
        </div>
      );
    default:
      return (
        <div>
          <SectionHeading index="07" id="h-try">
            投出你的第一瓶
          </SectionHeading>
          <ol className="landing-final-steps grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            <li className="landing-step-card flex flex-col gap-2 rounded-base border border-hairline p-5">
              <span
                aria-hidden="true"
                className="font-latin text-[0.6875rem] tracking-[0.24em] text-glass"
              >
                第一步
              </span>
              <a href="#intro-experience" className={TEXT_LINK}>
                当场听一支成品
              </a>
              <p className="text-[0.8125rem] leading-[1.8] text-muted">
                回到第一屏的播放器，不用注册，点开就播。
              </p>
            </li>
            <li className="landing-step-card flex flex-col gap-2 rounded-base border border-hairline p-5">
              <span
                aria-hidden="true"
                className="font-latin text-[0.6875rem] tracking-[0.24em] text-glass"
              >
                第二步
              </span>
              <Link to="/river" className={TEXT_LINK}>
                去河道捞一个
              </Link>
              <p className="text-[0.8125rem] leading-[1.8] text-muted">
                随机打捞，听到别人的半句，再决定接不接。
              </p>
            </li>
            <li className="landing-step-card flex flex-col gap-2 rounded-base border border-hairline p-5">
              <span
                aria-hidden="true"
                className="font-latin text-[0.6875rem] tracking-[0.24em] text-glass"
              >
                第三步
              </span>
              <Link to="/new" className={TEXT_LINK_GHOST}>
                唱一段投进去
              </Link>
              <p className="text-[0.8125rem] leading-[1.8] text-muted">
                登录只在这一步之后出现；录一段，投进河里。
              </p>
            </li>
          </ol>
          {/* 链尾 CTA（t12）：去开始体验 → /login → 河道页（正式体验入口） */}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to={CTA_HREF} className={TEXT_LINK_PRIMARY}>
              去开始体验
            </Link>
            <p className="text-[0.9375rem] leading-[1.85] text-paper">
              接力链使用瓶级代号；唱完一段，就把下一棒交给河流。
            </p>
          </div>
        </div>
      );
  }
}

/** 当前屏内是否还有可滚余量（有 ⇒ wheel 先交还原生滚动，到边再翻页）。 */
function canInnerScroll(screen: HTMLElement, down: boolean): boolean {
  if (down) return screen.scrollTop + screen.clientHeight < screen.scrollHeight - 1;
  return screen.scrollTop > 1;
}

export function LandingPage() {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const lockRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);

  /** 翻到指定屏（圆点/方向键用：即时响应，不加锁）。 */
  const goTo = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(LAST_SCREEN, next)));
  }, []);

  /** 滚轮/滑动翻页（带防抖锁：一次翻页后 WHEEL_LOCK_MS 内不再翻）。 */
  const step = useCallback((delta: number): void => {
    const now = Date.now();
    if (now < lockRef.current) return;
    const next = indexRef.current + delta;
    if (next < 0 || next > LAST_SCREEN) return;
    lockRef.current = now + WHEEL_LOCK_MS;
    setIndex(next);
  }, []);

  // 滚轮/触控板：non-passive 监听（否则 preventDefault 无效，浏览器原生滚动会接管）
  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      const down = event.deltaY > 0;
      const active = document.querySelector<HTMLElement>(
        '[data-landing-screen][data-active="true"]',
      );
      if (active !== null && canInnerScroll(active, down)) return;
      event.preventDefault();
      if (Math.abs(event.deltaY) < WHEEL_EPSILON) return;
      step(down ? 1 : -1);
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [step]);

  // 方向键 / PageUp / PageDown / Home / End（Enter、Space 留给按钮，不劫持）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target !== null) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (target.isContentEditable) return;
      }
      switch (event.key) {
        case 'ArrowDown':
        case 'PageDown':
          event.preventDefault();
          goTo(indexRef.current + 1);
          break;
        case 'ArrowUp':
        case 'PageUp':
          event.preventDefault();
          goTo(indexRef.current - 1);
          break;
        case 'Home':
          event.preventDefault();
          goTo(0);
          break;
        case 'End':
          event.preventDefault();
          goTo(LAST_SCREEN);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goTo]);

  function onTouchStart(event: ReactTouchEvent<HTMLElement>): void {
    touchStartRef.current = event.touches[0]?.clientY ?? null;
  }

  function onTouchEnd(event: ReactTouchEvent<HTMLElement>): void {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientY ?? start;
    const delta = start - end; // > 0 = 上滑（翻下一页）
    if (Math.abs(delta) < SWIPE_MIN_PX) return;
    const down = delta > 0;
    const active = document.querySelector<HTMLElement>(
      '[data-landing-screen][data-active="true"]',
    );
    if (active !== null && canInnerScroll(active, down)) return;
    step(down ? 1 : -1);
  }

  const meta = SCREENS[index] as ScreenMeta;

  return (
    // 页面自带 <main>（外壳约定）。root 不滚动：一页 = 一个视口，离散 translate 切屏
    <main
      data-testid="landing-page"
      data-journey={String(index)}
      className="landing-v4 relative isolate h-[100dvh] overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <RiverJourney />

      {/* 翻页轨道：只动 transform；时长/缓动全部来自 --motion-* 契约 token */}
      <div
        className="landing-track relative z-base flex flex-col transition-[transform] duration-[var(--motion-page-duration)] ease-[var(--motion-entry-easing)]"
        style={{ transform: `translateY(calc(${-index} * 100dvh))` }}
      >
        {SCREENS.map((screen, screenIndex) => (
          <section
            key={screen.id}
            data-landing-screen=""
            data-screen-title={screen.title}
            data-active={screenIndex === index ? 'true' : undefined}
            // 第一屏的 one-screen 锚点（tools/one-screen-check 的 `/` 路由条目要用）
            {...(screenIndex === 0 ? { 'data-anchor': 'intro-hero' } : {})}
            aria-label={screen.title}
            className="landing-screen h-[100dvh] shrink-0 overflow-y-auto overscroll-contain"
          >
            <div className="landing-screen-inner mx-auto flex min-h-full w-full max-w-[1280px] min-w-0 flex-col justify-center px-6 pb-[88px] pt-[72px] md:px-12">
              <div className="landing-screen-content">{screenBody(screenIndex)}</div>
            </div>
          </section>
        ))}
      </div>

      {/* 页码/进度指示（非动效反馈通道：文字 + aria-live） */}
      <p
        data-testid="landing-indicator"
        aria-live="polite"
        className="landing-indicator font-latin fixed bottom-5 left-6 z-sticky text-[0.6875rem] tracking-[0.24em] text-muted"
      >
        {String(index + 1).padStart(2, '0')} / {String(SCREENS.length).padStart(2, '0')} ·{' '}
        {meta.title}
      </p>

      {/* 圆点导航：带屏名、可点、热区 ≥44px */}
      <nav aria-label="翻页导航" className="landing-screen-nav fixed right-3 top-1/2 z-sticky -translate-y-1/2">
        <ul className="flex flex-col items-center">
          {SCREENS.map((screen, screenIndex) => {
            const active = screenIndex === index;
            return (
              <li key={screen.id}>
                <button
                  type="button"
                  aria-label={`第 ${screenIndex + 1} 屏 · ${screen.title}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => goTo(screenIndex)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-full',
                    'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'block h-2 w-2 rounded-full border transition-[transform,background-color] duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                      active
                        ? 'scale-[1.03] border-coral bg-coral'
                        : 'border-muted bg-transparent hover:bg-muted',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </main>
  );
}
