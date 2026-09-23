/**
 * 「我参与过的漂流瓶」——**服务端给的事实**（`GET /api/me/bottles`）。
 *
 * 这条列表在 t11 时只能靠 localStorage 书签凑（"这台设备参与过的瓶子"），
 * t19 交付接口后换成服务端口径，三个好处是实打实的：
 * 1. **换浏览器也在**（书签做不到）；
 * 2. **被斩浪的段仍算参与过**（§16.7）：`role` 不变，只是 `mySegmentIndexes` 里不再有它 ——
 *    所以"我的那一段被斩了"必须**如实显示**，不能把这条记录藏起来；
 * 3. 缺口语义与详情页一致（`missingSegmentIndexes` 直接来自服务端，前端不推算）。
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

export function MyBottles({ className }: MyBottlesProps) {
  const mine = useMyBottles();

  return (
    <section
      className={cn('flex flex-col gap-3', className)}
      aria-labelledby="my-bottles-heading"
    >
      {/* 锚点挂在标题上：它必须进首屏（列表有几条由数据决定，把锚点挂在整段上就变成"数据越多人越容易红"） */}
      <header className="flex flex-col gap-1" data-anchor="me-bottles">
        <h2 id="my-bottles-heading" className="text-[1.0625rem] font-semibold text-abyss">
          我参与过的漂流瓶
        </h2>
        <p className="text-[0.875rem] leading-[1.5] text-slate-current">
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
        {(page) => (
          <ul className="flex flex-col gap-2">
            {page.items.map((bottle) => (
              <MyBottleRow key={bottle.id} bottle={bottle} />
            ))}
          </ul>
        )}
      </AsyncBoundary>
    </section>
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
    <li className="flex flex-col gap-[6px] rounded-base border border-mist bg-foam px-4 py-[8px] shadow-card">
      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[2px]">
        <Icon name="Music" size={18} />
        <span className="text-[1rem] font-semibold text-abyss">{bottle.songTitle}</span>
        <span className="rounded-pill bg-tide-pool px-3 py-1 text-[0.8125rem] text-abyss">
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

      <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[2px] text-[0.875rem] text-slate-current">
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
    </li>
  );
}
