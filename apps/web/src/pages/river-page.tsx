/**
 * 河道（`/river`；`/` 是它的旧入口，已规范化，见 `routes.ts` 的 `canonicalHref`）= 全站门面。
 *
 * ## 本轮改了什么（用户：「必须高级符合人类审美地好看，因为这是参赛作品」）
 * 原来是**两张同宽、同高、同圆角、同阴影的深色卡片**并排 —— 那正是"内容被剁成一个个一样的圆角卡片"
 * 的通用模板感（`frontend-design` 的 AI 生成感清单第 4 条），而且把「捞」与「投」读成了两个并列功能。
 * 现在是一幅**河道剖面**：一条水线横贯内容区，岸在上、水在下，
 * 两个**等权**的泊位骑在这条河上 —— 读起来是「同一条河上的两个位置」（下游接住 / 上游放下），
 * 这正是产品规则（单支路河道，`CONTEXT.md` §4.1）的形状。
 *
 * 四个主题装在一幅画里：海洋（水体渐变 + 水下光柱）、河道（水线 + 主流 + 上下游）、
 * 漂流瓶（沿主流漂过的瓶）、音乐（主流 = 声波包络 —— 声波即水波）。
 *
 * 方案与逐条反默认自检：`docs/ui-review/design-plan-river.md`；契约：`DESIGN.md` 的 `## Composition`。
 * 机器守卫：`design-system/__tests__/water-motif.test.tsx` 的「河道剖面」两组。
 */
import {
  Button,
  CurrentLines,
  DriftingBottle,
  Icon,
  LightShafts,
  RippleRing,
  SurfaceLine,
  WaterSheen,
  WaterTexture,
  cn,
} from '../design-system';
import { useDrawBottle, useInvalidateBottle } from '../features/api/mutations';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { MoodChips } from '../features/bottle/mood-chips';
import { useSession } from '../features/session/session-context';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { TEXT_LINK } from './shell/link-styles';

/**
 * 两个泊位**共用这一份尺寸定义** —— 「投下与捞起等权」（用户 2026-09-23 裁决）的机器可检形式。
 * 守卫断言它至少被引用两次：只改其中一个会让等权静默失衡，所以这里不允许各写一份。
 * 焦点/边界装置**故意留在各自元素上**（不抽公共常量）：`deep-surface-cta.test.ts` 要读到真实的 class。
 */
const PORT_SIZE = 'h-[76px] w-[76px] rounded-full md:h-[110px] md:w-[110px]';

export function RiverPage() {
  const draw = useDrawBottle();
  const invalidate = useInvalidateBottle();
  const navigate = useNavigate();
  const session = useSession();
  const newHref =
    session.status === 'authed' ? '/new' : `/login?next=${encodeURIComponent('/new')}`;
  const mineHref = session.status === 'authed' ? '/me' : `/login?next=${encodeURIComponent('/me')}`;

  function onDraw(): void {
    void draw
      .mutateAsync()
      .then(async (response) => {
        await invalidate(response.bottle.id);
        navigate(`/bottles/${response.bottle.id}`);
      })
      .catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-[24px]">
      {/* ── 岸（水线以上）───────────────────────────────────────────────────
          浅底 + 极淡水面层。标题用 `DESIGN.md` 的 hero 档 —— 门面页此前用的是 h2 档（1.5rem），
          把一整页最重要的排版位置浪费掉了。 */}
      <header className="relative isolate flex flex-wrap items-end justify-between gap-x-[24px] gap-y-[12px] pb-[20px]">
        <WaterSheen tone="light" />
        <WaterTexture tone="light" drift />
        <div className="flex min-w-0 flex-col gap-[4px]">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)] font-semibold leading-[1.1] text-abyss">
            暖流河道
          </h1>
          <p className="text-[0.9375rem] leading-[1.6] text-slate-current">
            拾起那些搁浅在黑夜里的声线
          </p>
        </div>
        <Link to={mineHref} className={TEXT_LINK}>
          我参与过的漂流瓶
        </Link>
      </header>

      {/* ── 水体（水线以下）─────────────────────────────────────────────────
          一整片水：渐变由既有深水色组成、水下有光柱、河底有一条主流（声波）与一只漂过的瓶子。
          两个泊位**没有各自的背景/边框/阴影** —— 它们浮在同一片水上，这是"不是两张卡"的关键。 */}
      <section
        data-anchor="river-draw"
        aria-labelledby="river-heading"
        className="river-body relative isolate flex flex-col justify-between gap-[12px] overflow-hidden rounded-2xl px-[16px] py-[12px] text-wave-white md:gap-[32px] md:px-[48px] md:py-[36px]"
      >
        {/* 水线：岸与水的分界（全页唯一一条横向实线）。零布局高度。 */}
        <SurfaceLine className="top-0" />
        <WaterSheen />
        <WaterTexture drift />
        <LightShafts />

        <h2 id="river-heading" className="sr-only">
          河道
        </h2>

        <div className="grid gap-[12px] md:grid-cols-2 md:gap-[48px]">
          {/* 下游 · 捞取（左）。新用户的第一动作，按阅读顺序放先。 */}
          <section
            aria-labelledby="draw-heading"
            className="flex flex-col items-center gap-[16px] text-center"
          >
            <h2 id="draw-heading" className="sr-only">
              从河道捞一个漂流瓶
            </h2>
            <div className="relative flex h-[96px] w-[96px] items-center justify-center md:h-[200px] md:w-[200px]">
              <span
                aria-hidden="true"
                className="absolute h-[96px] w-[96px] rounded-full border border-lagoon/35 md:h-[200px] md:w-[200px]"
              />
              <span
                aria-hidden="true"
                className="absolute h-[76px] w-[76px] rounded-full border border-lagoon/45 md:h-[150px] md:w-[150px]"
              />
              <span
                aria-hidden="true"
                className="absolute h-[56px] w-[56px] rounded-full border border-sea-glass/40 md:h-[112px] md:w-[112px]"
              />
              <RippleRing className="h-[96px] w-[96px] md:h-[200px] md:w-[200px]" />
              <Button
                variant="primary"
                loading={draw.isPending}
                aria-label="捞一个漂流瓶"
                className={cn(
                  PORT_SIZE,
                  'relative z-10 min-h-11 px-0 ring-2 ring-foam focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current',
                )}
                onClick={onDraw}
              >
                <span className="flex flex-col items-center gap-[4px]">
                  <Icon name="Waves" size={24} />
                  <span className="whitespace-nowrap text-[0.8125rem] font-semibold">捞取</span>
                </span>
              </Button>
            </div>

            <div className="flex flex-col items-center gap-[6px]">
              <p className="text-[1.125rem] font-semibold">
                <span className="whitespace-nowrap">捞一个漂流瓶</span>
              </p>
              <p className="max-w-[32rem] text-[0.875rem] leading-[1.6] text-on-dark-muted">
                捞取深海深处传来的匿名哼唱，接续她的下一句旋律。
                <span className="whitespace-nowrap">捞到即持有</span>
                ：同一时刻，同一条河道上只有你拿着它。
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.6] text-on-dark-muted">
                河道只能随机打捞，没有搜索，也不能指定某个人来接。
              </p>
            </div>

            {draw.isPending ? (
              <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold">
                正在打捞…
              </p>
            ) : null}
          </section>

          {/* 上游 · 投下（右）：与捞取等权（同一份 `PORT_SIZE`），只有颜色与图标不同。 */}
          <section
            data-anchor="river-drop"
            aria-labelledby="cast-heading"
            className="flex flex-col items-center gap-[16px] text-center"
          >
            <h2 id="cast-heading" className="sr-only">
              投下一支漂流瓶
            </h2>
            <div className="relative flex h-[96px] w-[96px] items-center justify-center md:h-[200px] md:w-[200px]">
              <span
                aria-hidden="true"
                className="absolute h-[96px] w-[96px] rounded-full border border-coral/35 md:h-[200px] md:w-[200px]"
              />
              <span
                aria-hidden="true"
                className="absolute h-[76px] w-[76px] rounded-full border border-coral/45 md:h-[150px] md:w-[150px]"
              />
              <span
                aria-hidden="true"
                className="absolute h-[56px] w-[56px] rounded-full border border-coral/55 md:h-[112px] md:w-[112px]"
              />
              <Link
                to={newHref}
                aria-label="投下一支漂流瓶"
                className={cn(
                  PORT_SIZE,
                  'relative z-10 min-h-11 flex items-center justify-center bg-coral text-wave-white ring-2 ring-foam transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] hover:scale-[var(--motion-hover-scale)] hover:bg-coral-deep focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current motion-safe:active:translate-y-[-1px]',
                )}
              >
                <span className="flex flex-col items-center gap-[4px]">
                  <Icon name="Music" size={24} />
                  <span className="whitespace-nowrap text-[0.8125rem] font-semibold">投下</span>
                </span>
              </Link>
            </div>

            <div className="flex flex-col items-center gap-[6px]">
              <p className="text-[1.125rem] font-semibold">
                <span className="whitespace-nowrap">投下一支漂流瓶</span>
              </p>
              <p className="max-w-[32rem] text-[0.875rem] leading-[1.6] text-on-dark-muted">
                选一首歌，录下第 1 段（时长以该段为准），然后投进河道等一个陌生人接下一棒。
              </p>
              <p className="max-w-[32rem] text-[0.8125rem] leading-[1.6] text-on-dark-muted">
                投河之后就交出去了；想找回来看，去「我参与过的漂流瓶」。
              </p>
            </div>
          </section>
        </div>

        {/* 河底：主流（声波包络 = 音乐母题）+ 沿它漂过的漂流瓶（漂流瓶母题）。
            外层固定 96px 高度兜住零布局高度的两件装饰；`overflow-hidden` 让瓶子的 ±160px 位移
            不会造成横向滚动（375px 的硬底线）。瓶子定位在**正中间**（`left-1/2` 减去半个瓶宽），
            这样它的整段行程都在画面里 —— 位移只由内层的 `passage-drift` 承担。 */}
        <div className="relative -mb-[12px] h-[48px] overflow-hidden md:-mb-[36px] md:h-[96px]">
          <CurrentLines className="inset-x-0 bottom-0 h-[48px] md:h-[96px]" />
          <DriftingBottle
            className="bottom-[11px] left-1/2 -ml-[17px] md:bottom-[35px]"
            size={34}
          />
        </div>
      </section>

      {draw.isError ? (
        <ConflictNotice
          error={draw.error}
          onRetry={onDraw}
          retryLabel="再捞一次"
          className="max-w-[46rem]"
        />
      ) : null}

      <div className="flex flex-col gap-[16px]">
        <Link to="/sea" className={TEXT_LINK}>
          先去公海听听已经完成的作品
        </Link>
        {/* 心情标签（用户第十三轮 ①）：从首页搬来，**只作展示**，点击只有视觉反馈 */}
        <MoodChips />
      </div>
    </div>
  );
}
