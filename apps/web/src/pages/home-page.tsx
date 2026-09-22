/**
 * 首页（「今日海面」）。
 *
 * IA 参考 Figma `home-river` 的三段结构（标题区 / 主交互区 / 我的瓶子）与文案；
 * 视觉按 `DESIGN.md`：Hero 用深水暗底（**沉浸式区块**，不是深色模式），其余保持 wave-white。
 *
 * 关键取舍：**未登录的中转不留给用户** —— 两个主行动在未登录时直接指向带 `next` 的登录页，
 * 而不是让用户点进去再吃一个 401。
 */
import { Card, EmptyState, Icon, WaveDivider, cn } from '../design-system';
import { useSeaList } from '../features/api/queries';
import { RememberedBottles } from '../features/bottle/remembered-bottles';
import { progressLabel } from '../features/bottle/relay-status';
import { useSession } from '../features/session/session-context';
import { AsyncBoundary } from './shell/async-boundary';
import { Link } from './shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';

export function HomePage() {
  const session = useSession();
  const authed = session.status === 'authed';
  const sea = useSeaList('COMPLETED');

  const riverHref = authed ? '/river' : `/login?next=${encodeURIComponent('/river')}`;
  const newHref = authed ? '/new' : `/login?next=${encodeURIComponent('/new')}`;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-6 rounded-2xl bg-deep-current p-8 text-wave-white">
        <div className="flex flex-col gap-3">
          <h1 className="text-[2rem] font-bold leading-tight md:text-[2.5rem]">暖流河道</h1>
          <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-on-dark-muted">
            拾起那些搁浅在黑夜里的声线。唱一段 15–30 秒，投进河道，等一个陌生人接下一棒。
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            to={riverHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-base bg-wave-white px-6 text-[1rem] font-semibold text-peacock hover:bg-foam"
          >
            <Icon name="Waves" size={20} />
            捞一个漂流瓶
          </Link>
          <Link
            to={newHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-base border-[1.5px] border-on-dark-muted px-6 text-[1rem] font-semibold text-wave-white hover:bg-trench"
          >
            <Icon name="Music" size={20} />
            选一首歌，投出第一棒
          </Link>
        </div>

        <p className="text-[0.875rem] leading-[1.6] text-on-dark-muted">
          河道只能随机打捞：没有搜索，也不能指定某个人来接。捞到的人不知道你是谁 ——
          在每个瓶子里，你都有一个单独的匿名代号。
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="today-sea-heading">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="today-sea-heading" className="text-[1.375rem] font-semibold text-abyss">
            今日海面
          </h2>
          <Link to="/sea" className={TEXT_LINK}>
            去公海大厅
          </Link>
        </header>

        <AsyncBoundary
          query={sea}
          emptyWhen={(page) => page.items.length === 0}
          empty={
            <EmptyState
              icon="Ship"
              title="公海还空着"
              description="等第一批作品录满全部段位、被送进公海之后，这里就会有可以听完整的作品。"
              action={
                <Link to={newHref} className={TEXT_LINK_STRONG}>
                  选一首歌，投出第一棒
                </Link>
              }
            />
          }
        >
          {(page) => (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {page.items.slice(0, 3).map((bottle) => (
                <li key={bottle.id}>
                  <Card className="hover-lift flex h-full flex-col gap-2">
                    <p className="text-[1.0625rem] font-semibold text-abyss">{bottle.songTitle}</p>
                    <p className="text-[0.875rem] text-slate-current">
                      {progressLabel(bottle)}
                      {bottle.missingSegmentIndexes.length === 0
                        ? ' · 全部段位都有人唱过'
                        : ` · 缺第 ${bottle.missingSegmentIndexes.join('、')} 段`}
                    </p>
                    <Link to={`/sea/${bottle.id}`} className={cn(TEXT_LINK, 'mt-auto')}>
                      听这支作品
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>
      </section>

      <WaveDivider />

      <RememberedBottles />
    </div>
  );
}
