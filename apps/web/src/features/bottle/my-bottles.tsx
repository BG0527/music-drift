/**
 * 「我参与过的漂流瓶」—— 稿 `p-profile-record.html` 的 `.crate` 沉积柜（返工令 2026-09-28：
 * **逐块照抄**：`.chead`（共 N 支）+ `.csub` + `.window` 列表窗，行结构 `.lay`/`.float`/`.veil`/`.txt`
 * 全按稿；样式在 `pages/profile-page.css`（稿 <style> 逐值 + 唯一允许的 px→fluid 翻译）。
 *
 * 数据是**服务端给的事实**（`GET /api/me/bottles`），不是本机书签：
 * 1. **换浏览器也在**；2. **被斩浪的段仍算参与过**（§16.7）：`role` 不变、`mySegmentIndexes`
 *    不再有它 —— 文字行如实说明，柱上层位不少一层；3. 缺口语义与详情页一致（服务端给，前端不推算）。
 *
 * 装置（稿逐块）：
 * - **每格一根沉积柱**：层位数 = `totalSegments`（4 层位＝4 段位），层位自下而上 = 第 1 段 → 第 N 段
 *   （DOM 顺序 b1→bN，`flex-direction:column-reverse` 落位）；已录 = `.sd` 实心沉积层、
 *   缺口 = `.wt` 水腔（层位还在、内容没落下来）、被斩挖走 = `.cut`（虚线珊瑚）；
 *   我唱的那层右缘一道 `.mine` 珊瑚刻记；柱子 `aria-hidden`（文字行给盲读等价物）。
 * - **回航泊位**：`awaitingMyAction=true` → 柱身 `.shaft` 暖光 + 柱口 `.hoop` 系缆环 + 行内 `.st`
 *   实心暖牌「等你操作」+ `.due` 时限；整块 `.msgs li.hero` 提示在 profile 页（三态测试在案）。
 * - `.cut` 的推导边界：我的段被斩 ⇒ `mySegmentIndexes` 清空且**缺口恰好只剩这一段**，此时能唯一推出
 *   （照稿 row5 画 `.cut`）；推不出时按 `.wt` 水腔画 —— 位留着，不填假数。
 */
import type { CSSProperties } from 'react';
import type { MyBottle } from '@music-drift/shared';
import { cn } from '../../design-system';
import { useMyBottles } from '../api/queries';
import { progressLabel } from './relay-status';
import { AsyncBoundary } from '../../pages/shell/async-boundary';
import { Link } from '../../pages/shell/router';

export interface MyBottlesProps {
  className?: string;
}

const ROLE_LABEL: Record<MyBottle['role'], string> = {
  INITIATOR: '我发起的',
  SINGER: '我接唱的',
};

/** 稿 row 里那只还漂着的瓶子（22×34 viewBox，逐值照抄；立式给回航泊位、斜式浮在沉积面上）。 */
function FloatBottle(props: {
  className: string;
  width: number;
  height: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={props.className}
      width={props.width}
      height={props.height}
      viewBox="0 0 22 34"
      fill="none"
      aria-hidden="true"
      style={props.style}
    >
      <rect x="7.2" y="1.2" width="7.6" height="5" rx="2" fill="rgba(246,215,154,.62)" />
      <path
        d="M8.4 6.4v4.4M13.6 6.4v4.4"
        stroke="rgba(203,238,246,.62)"
        strokeWidth="1.1"
      />
      <rect
        x="4.2"
        y="10.8"
        width="13.6"
        height="21.4"
        rx="4"
        fill="rgba(127,209,217,.16)"
        stroke="rgba(203,238,246,.72)"
        strokeWidth="1.2"
      />
      <rect
        x="7.4"
        y="14.6"
        width="7.2"
        height="13.6"
        rx="2"
        fill="rgba(246,215,154,.24)"
        stroke="rgba(246,215,154,.55)"
        strokeWidth="1"
      />
    </svg>
  );
}

export function MyBottles({ className }: MyBottlesProps) {
  const mine = useMyBottles();
  /** t17 空态构图：确认为空时把说明写进 `.window`（参考 showEmpty target=windowBox）——
      空 ≠ 错：加载/错误态仍走 AsyncBoundary 装在窗里。 */
  const empty = mine.data !== undefined && mine.data.items.length === 0;

  return (
    <section className={cn('crate', className)} aria-labelledby="my-bottles-heading">
      {/* 锚点挂在标题上：它必须进首屏（列表有几条由数据决定） */}
      <div className="chead" data-anchor="me-bottles">
        <h2 id="my-bottles-heading">我参与过的漂流瓶</h2>
        {/* 计数位照稿「共 5 支」的槽：只填服务端真条数，加载中位留着不填假数 */}
        <span className="cat">{mine.data === undefined ? '' : `共 ${mine.data.items.length} 支`}</span>
      </div>
      <p className="csub">
        我发起的、以及我唱过一段的瓶子都会在这里（按最近活跃排序，时间线来自服务端）。
      </p>

      {/*
        t17 深度复刻（参考 `site/me.html` + `page-me.js showEmpty({target: windowBox})`）：
        **空态消息落在 `.window` 里** —— 窗是这一块的展示位，不在窗外套一张右卡
        （参考没有独立空态卡；左半屏因此永远有内容）。加载/错误态仍由 AsyncBoundary 装进窗里。
      */}
      <div className="window">
        {empty ? (
          <p className="window-empty">
            你还没有参与过任何漂流瓶：
            <Link to="/river" className="whitespace-nowrap">
              去河道捞一个
            </Link>
            ，或者
            <Link to="/new" className="whitespace-nowrap">
              自己发起一支
            </Link>
            。
          </p>
        ) : (
          <AsyncBoundary query={mine} emptyWhen={(page) => page.items.length === 0}>
            {(page) => (
              <ul>
                {page.items.map((bottle, index) => (
                  <MyBottleRow key={bottle.id} bottle={bottle} index={index} />
                ))}
              </ul>
            )}
          </AsyncBoundary>
        )}
      </div>
    </section>
  );
}

/**
 * 稿的一格（`<li>`）：左 `.lay` 沉积柱 → 漂着的瓶 `.float` → `.veil` 暗幕 → `.txt` 文字区。
 * 层位状态只由服务端字段推：`missingSegmentIndexes` → `.wt`、可唯一判定的被斩 → `.cut`、
 * 其余 → `.sd`；`mySegmentIndexes` → `.mine` 刻记。
 */
function MyBottleRow({ bottle, index }: { bottle: MyBottle; index: number }) {
  const missing = new Set(bottle.missingSegmentIndexes);
  const mineSegs = new Set(bottle.mySegmentIndexes);
  const total = bottle.totalSegments;

  // 被斩唯一可推的情形（稿 row5）：我的段被斩 = 我段清空 且 缺口恰好只剩这一段
  const cutSegment =
    missing.size === 1 && mineSegs.size === 0 ? bottle.missingSegmentIndexes[0]! : null;
  const waterSegments = [...missing].filter((segment) => segment !== cutSegment);
  // 沉积面（.iface）压在最低那层水腔之下：bottom% = 它下方的层高累计
  const lowestWater = waterSegments.length === 0 ? null : Math.min(...waterSegments);
  const ifacePct = lowestWater === null ? null : ((lowestWater - 1) / total) * 100;

  const gap = missing.size === 0 ? null : `缺第 ${bottle.missingSegmentIndexes.join('、')} 段`;

  // 层位 DOM 顺序照稿：b1（最老、最底）→ bN（最新、最顶）
  const layers: number[] = [];
  for (let segment = 1; segment <= total; segment += 1) layers.push(segment);

  return (
    <li className={`enter-rise stagger-${Math.min(index + 1, 4)}`}>
      {/* 柱（装饰性装置，信息与文字行重复 ⇒ aria-hidden） */}
      <span
        aria-hidden="true"
        data-sediment
        className={cn('lay', bottle.awaitingMyAction && 'ret')}
      >
        {bottle.awaitingMyAction ? <i className="shaft" /> : null}
        {layers.map((segment, position) => {
          const state =
            segment === cutSegment ? 'cut' : missing.has(segment) ? 'cavity' : 'sediment';
          const isMine = mineSegs.has(segment);
          // 深度档照稿 b1..b4（越老越靠下越暗）；4 层时即 b{段号}，>4 层时最老的几层复用 b1
          const depthClass = `b${4 - Math.min(total - 1 - position, 3)}`;
          const stateClass = state === 'cut' ? 'cut' : state === 'cavity' ? 'wt' : 'sd';
          return (
            <i
              key={segment}
              className={cn(depthClass, stateClass, isMine && 'mine')}
              data-segment={segment}
              data-state={state}
              data-mine={isMine ? 'true' : 'false'}
            >
              <b className={cn('no', state === 'cavity' && 'ghost')}>{segment}</b>
            </i>
          );
        })}
        {ifacePct === null ? null : (
          <i className="iface" style={{ bottom: `${String(ifacePct)}%` }} />
        )}
        {bottle.awaitingMyAction ? <i className="hoop" /> : null}
      </span>

      {/* 漂着的瓶：回航泊位立在柱口；有水腔时浮在沉积面上；全实心则没有（照稿 row1/2/3/4/5） */}
      {bottle.awaitingMyAction ? (
        <FloatBottle className="float fstand" width={16} height={26} />
      ) : ifacePct === null ? null : (
        <FloatBottle
          className="float flask"
          width={18}
          height={28}
          style={{ bottom: `calc(${String(ifacePct)}% - 6px)` }}
        />
      )}

      <span className="veil" aria-hidden="true" />

      <div className="txt">
        <div className="r1">
          <span className="slot">{String(index + 1).padStart(2, '0')}</span>
          <span className={cn('role', bottle.role === 'INITIATOR' && 'mine')}>
            {ROLE_LABEL[bottle.role]}
          </span>
        </div>
        <p className="t">{bottle.songTitle}</p>
        <p className="d">{progressLabel(bottle)}</p>
        {bottle.mySegmentIndexes.length === 0 ? (
          <p className="d warn">我唱的那一段被斩浪删除了（仍算参与过）</p>
        ) : (
          <p className="d">我唱的：第 {bottle.mySegmentIndexes.join('、')} 段</p>
        )}
        {gap === null ? (
          // 稿 row1（等你操作那格）没有 ok 行：暖牌与时限顶了它的位置；row4 非待办的完整瓶才有
          bottle.awaitingMyAction ? null : (
            <p className="d ok">全部段位都有人唱过</p>
          )
        ) : (
          <p className="d warn">{gap}</p>
        )}
        {/* 唯一的「要你动手」状态：全页仅此一枚实心暖牌（牌面记号＝柱口那枚系缆环） */}
        {bottle.awaitingMyAction ? (
          <p className="st">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <ellipse cx="6.5" cy="8.2" rx="5.4" ry="3" stroke="rgba(5,15,20,.88)" strokeWidth="1.3" />
              <rect x="5.6" y="1.7" width="1.8" height="6.3" rx="0.9" fill="rgba(5,15,20,.88)" />
            </svg>
            等你操作
          </p>
        ) : null}
        {bottle.awaitingMyAction ? <p className="due">回传决策时限 48 小时</p> : null}
        <p className="lk">
          <Link to={`/bottles/${bottle.id}`} className="whitespace-nowrap">
            去看这个瓶子
          </Link>
          <Link to={`/bottles/${bottle.id}/log`} className="whitespace-nowrap">
            漂流日志
          </Link>
        </p>
      </div>
    </li>
  );
}
