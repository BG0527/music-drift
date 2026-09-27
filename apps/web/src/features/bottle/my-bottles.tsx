/**
 * 「我参与过的漂流瓶」——**服务端给的事实**（`GET /api/me/bottles`）。
 *
 * 这条列表在 t11 时只能靠 localStorage 书签凑（"这台设备参与过的瓶子"），
 * t19 交付接口后换成服务端口径，三个好处是实打实的：
 * 1. **换浏览器也在**（书签做不到）；
 * 2. **被斩浪的段仍算参与过**（§16.7）：`role` 不变，只是 `mySegmentIndexes` 里不再有它 ——
 *    所以"我的那一段被斩了"必须**如实显示**，不能把这条记录藏起来；
 * 3. 缺口语义与详情页一致（`missingSegmentIndexes` 直接来自服务端，前端不推算）。
 *
 * 装置（docs/impl-plan-record-v1.md §5.1 `/me` 行）：
 * - **每格一根沉积柱**：层位数 = `totalSegments`（4 层位＝4 段位），层位自下而上 = 第 1 段 → 第 N 段；
 *   已录＝实心沉积层，缺口＝**层位还在、内容挖空**（空腔），我唱的那层右缘一道珊瑚刻记。
 *   柱子 `aria-hidden`（文字行已给盲读等价物：已录 x/y、我唱的、缺第 n 段）。
 * - **回传提示**：任一条 `awaitingMyAction` 为 true 才出现「收到回传 · 等你操作」整块提示，
 *   该行挂实心暖牌「等你操作」+ 柱口系缆环（回航泊位）；一条都不是 true ⇒ 整块不出现（安全降级）。
 */
import type { MyBottle } from '@music-drift/shared';
import { EmptyState, Icon, cn } from '../../design-system';
import { useMyBottles } from '../api/queries';
import { progressLabel } from './relay-status';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Link } from '../../pages/shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from '../../pages/shell/link-styles';

export interface MyBottlesProps {
  className?: string;
}

const ROLE_LABEL: Record<MyBottle['role'], string> = {
  INITIATOR: '我发起的',
  SINGER: '我接唱的',
};

/**
 * 沉积层渐变按**层位深度**分档（设计稿逐值：顶色 .21/.17/.13/.10、底色 .065/.05/.035/.02 ——
 * 越老越靠下越暗）。必须写成字面 class：Tailwind JIT 只扫描完整字符串，拼接出来的类名不会被生成。
 * 超过 4 层时更老的层复用最暗一档（契约 totalSegments 上限 8，设计稿只画了 4 层位）。
 */
const SEDIMENT_FROM = [
  'from-warm/[0.21]',
  'from-warm/[0.17]',
  'from-warm/[0.13]',
  'from-warm/[0.10]',
] as const;
const SEDIMENT_TO = [
  'to-paper/[0.065]',
  'to-paper/[0.05]',
  'to-paper/[0.035]',
  'to-paper/[0.02]',
] as const;

export function MyBottles({ className }: MyBottlesProps) {
  const mine = useMyBottles();

  return (
    <section
      className={cn('flex flex-col gap-3', className)}
      aria-labelledby="my-bottles-heading"
    >
      {/* 锚点挂在标题上：它必须进首屏（列表有几条由数据决定，把锚点挂在整段上就变成"数据越多人越容易红"） */}
      <header className="flex flex-col gap-1" data-anchor="me-bottles">
        <h2 id="my-bottles-heading" className="text-[1.0625rem] font-semibold text-paper">
          我参与过的漂流瓶
        </h2>
        <p className="text-[0.875rem] leading-[1.5] text-muted">
          我发起的、以及我唱过一段的瓶子都会在这里（按最近活跃排序，时间线来自服务端）。
        </p>
      </header>

      <AsyncBoundary
        query={mine}
        emptyWhen={(page) => page.items.length === 0}
        empty={
          <EmptyState
            icon="Waves"
            title="还没有参与过的漂流瓶"
            description="去河道捞一个瓶子接唱，或者选一首歌投出第一棒 —— 之后它们会出现在这里。"
            action={
              <Link to="/river" className={TEXT_LINK_STRONG}>
                去河道捞一个
              </Link>
            }
          />
        }
      >
        {(page) => {
          const awaiting = page.items.filter((bottle) => bottle.awaitingMyAction);
          return (
            /* 桌面：列表窗内滚（设计稿 `.window` 高 260px、overflow:hidden 的固定窗）——
               窗高有界，/me 整页才装得下一屏；锚点在窗外的标题上，不随滚动移出首屏。
               单列（<lg）不封顶：手机端不按整页高判定，按锚点判定。 */
            <div className="flex flex-col gap-3 lg:max-h-[260px] lg:overflow-y-auto">
              {awaiting.length > 0 ? <AwaitingReturnHint target={awaiting[0]!} /> : null}
              <ul className="flex flex-col gap-2">
                {page.items.map((bottle) => (
                  <MyBottleRow key={bottle.id} bottle={bottle} />
                ))}
              </ul>
            </div>
          );
        }}
      </AsyncBoundary>
    </section>
  );
}

/**
 * 「收到回传 · 等你操作」整块提示（W6，`awaitingMyAction`）。
 * 只在至少一条为 true 时渲染 —— 宁可不弹，也不要误报（契约 `default(false)` 就是这个语义）。
 */
function AwaitingReturnHint({ target }: { target: MyBottle }) {
  return (
    <aside
      data-anchor="me-awaiting"
      className="flex flex-col gap-[2px] rounded-base border-l-2 border-warm/85 bg-gradient-to-r from-warm/[0.14] to-transparent px-[12px] py-[8px]"
    >
      <div className="flex flex-wrap items-center gap-[9px]">
        <Icon name="Anchor" size={16} className="text-warm" aria-hidden="true" />
        <p className="text-[0.9375rem] font-bold text-warm">收到回传 · 等你操作</p>
      </div>
      <p className="text-[0.8125rem] leading-[1.55] text-paper/80">
        完整版本已经沿父链回到你手里 —— 你只能把它送进公海（回传决策时限 48 小时，超时自动入海）。
      </p>
      <Link
        to={`/bottles/${target.id}`}
        className="inline-flex min-h-11 w-fit items-center whitespace-nowrap text-[0.8125rem] font-bold text-warm underline"
      >
        去看看这个瓶子
      </Link>
    </aside>
  );
}

/**
 * 沉积柱（装饰性装置，信息与文字行重复 ⇒ `aria-hidden`）。
 * 层位状态只由服务端字段推：`missingSegmentIndexes` → 空腔、其余 → 实心沉积、`mySegmentIndexes` → 珊瑚刻记。
 */
function SedimentColumn({ bottle }: { bottle: MyBottle }) {
  const missing = new Set(bottle.missingSegmentIndexes);
  const mine = new Set(bottle.mySegmentIndexes);
  // DOM 从上往下 = 第 N 段 → 第 1 段（层位自下而上：越老越靠下，与设计稿一致）
  const layers: number[] = [];
  for (let segment = bottle.totalSegments; segment >= 1; segment -= 1) layers.push(segment);

  return (
    <span
      aria-hidden="true"
      data-sediment
      className={cn(
        'relative flex min-h-[104px] w-[50px] shrink-0 flex-col self-stretch overflow-hidden rounded-base border',
        bottle.awaitingMyAction
          ? 'border-warm/70 bg-gradient-to-b from-warm/[0.35] via-warm/[0.2] to-warm/[0.1]'
          : 'border-line/[0.16] bg-water-void/40',
      )}
    >
      {layers.map((segment, position) => {
        const state = missing.has(segment) ? 'cavity' : 'sediment';
        const isMine = mine.has(segment);
        const depth = Math.min(position, SEDIMENT_FROM.length - 1);
        return (
          <span
            key={segment}
            data-sediment-layer
            data-segment={segment}
            data-state={state}
            data-mine={isMine ? 'true' : 'false'}
            className={cn(
              'relative flex-1 border-t border-line/[0.16] first:border-t-0 bg-gradient-to-b',
              state === 'sediment'
                ? cn(SEDIMENT_FROM[depth], SEDIMENT_TO[depth])
                : 'from-glass/[0.2] to-glass/[0.07]',
            )}
          >
            <b
              className={cn(
                'absolute bottom-[2px] left-[5px] text-[10px] font-normal',
                state === 'cavity' ? 'text-water-mid/70' : 'text-paper/55',
              )}
            >
              {segment}
            </b>
            {state === 'cavity' ? (
              <i className="absolute bottom-[13px] left-[9px] h-[5px] w-[5px] rounded-full border border-water-mid/60" />
            ) : null}
            {isMine ? <i className="absolute inset-y-[6px] right-[3px] w-[2px] bg-coral/80" /> : null}
          </span>
        );
      })}
      {/* 回航泊位：柱口系缆环（只有「等你操作」那一格有） */}
      {bottle.awaitingMyAction ? (
        <i className="absolute left-[2px] right-[2px] top-[3px] h-[14px] rounded-full border-2 border-warm/90 bg-warm/[0.14]" />
      ) : null}
    </span>
  );
}

function MyBottleRow({ bottle }: { bottle: MyBottle }) {
  const gap =
    bottle.missingSegmentIndexes.length === 0
      ? null
      : `缺第 ${bottle.missingSegmentIndexes.join('、')} 段`;

  return (
    /* 两行结构（§46.3）：第一行"歌名 + 我的角色 + 出口"，第二行"进度 / 我唱的段 / 缺口"。
       原来全塞一行，窄一点就折成三行，4 条就把 /me 顶出 900。

       原语：这行曾是 `hover-lift`（hover 整行抬起）。但这一行**本身不可点**（可点的是行内的两个
       `<Link>`），抬起的动效于是在承诺一个不存在的交互 —— `motion-web` §1 要求每个动效说清它
       "替代或补充了什么"，这一条说不出。故撤销；可点性反馈留给行内的链接自己。
       （纪律守卫：`design-system/__tests__/motion-contract.test.tsx` 的 hover-lift 宿主检查） */
    <li
      className={cn(
        'flex gap-[12px] rounded-base border bg-ink px-4 py-[8px]',
        bottle.awaitingMyAction ? 'border-warm/50' : 'border-line/15',
      )}
    >
      <SedimentColumn bottle={bottle} />

      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
        <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[2px]">
          <Icon name="Music" size={18} />
          <span className="text-[1rem] font-semibold text-paper">{bottle.songTitle}</span>
          <span className="rounded-base border border-line/20 bg-water-void px-3 py-1 text-[0.8125rem] text-paper">
            {ROLE_LABEL[bottle.role]}
          </span>

          <span className="ml-auto flex flex-wrap items-center gap-[16px]">
            <Link to={`/bottles/${bottle.id}`} className={TEXT_LINK}>
              <span className="whitespace-nowrap">去看这个瓶子</span>
            </Link>
            <Link to={`/bottles/${bottle.id}/log`} className={TEXT_LINK}>
              <span className="whitespace-nowrap">漂流日志</span>
            </Link>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[2px] text-[0.875rem] text-muted">
          <span>{progressLabel(bottle)}</span>

          {bottle.mySegmentIndexes.length === 0 ? (
            <span className="text-warning">我唱的那一段被斩浪删除了（仍算参与过）</span>
          ) : (
            <span>我唱的：第 {bottle.mySegmentIndexes.join('、')} 段</span>
          )}

          {gap === null ? (
            <span className="flex items-center gap-2 text-success">
              <Icon name="CheckCircle2" size={16} />
              全部段位都有人唱过
            </span>
          ) : (
            <span className="flex items-center gap-2 text-warning">
              <Icon name="CircleDashed" size={16} />
              {gap}
            </span>
          )}
        </div>

        {/* 唯一的"要你动手"状态：全页仅此一枚实心暖牌（与柱口系缆环是同一个记号） */}
        {bottle.awaitingMyAction ? (
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px]">
            <span className="inline-flex items-center gap-[6px] rounded-base bg-warm px-[10px] py-[4px] text-[0.78125rem] font-bold tracking-[0.04em] text-ink">
              <Icon name="Anchor" size={16} aria-hidden="true" />
              等你操作
            </span>
            <span className="text-[0.65625rem] tracking-[0.08em] text-warm/75">
              回传决策时限 48 小时
            </span>
          </div>
        ) : null}
      </div>
    </li>
  );
}
