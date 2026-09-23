/**
 * 漂流日志（CONTEXT §9「追踪揭示」的 Demo 形态）。
 *
 * 两条纪律：
 * - **时间线以服务端为准**：按 `seq` 升序渲染，客户端不本地推算（`docs/api.md` §2.4）；
 * - **只给时间线**，不给内容可见性判断（私密留言的可见性在服务端，属 t12）。
 */
import { useBottle, useBottleEvents } from '../features/api/queries';
import { actorSourceOf, eventTimeline } from '../features/bottle/drift-events';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { Icon, Skeleton } from '../design-system';
import { Link } from './shell/router';

export function DriftLogPage({ id }: { id: string }) {
  const events = useBottleEvents(id);
  const bottle = useBottle(id);

  if (events.isPending || bottle.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton height="2.25rem" width="14rem" />
        <Skeleton height="6rem" width="100%" />
      </div>
    );
  }

  if (events.isError || bottle.isError) {
    return <ConflictNotice error={events.isError ? events.error : bottle.error} />;
  }

  const timeline = eventTimeline(events.data, actorSourceOf(bottle.data));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="面包屑" className="flex flex-wrap items-center gap-3 text-[0.875rem]">
        <Link
          to={`/bottles/${id}`}
          className="inline-flex min-h-11 items-center gap-2 text-peacock underline"
        >
          <Icon name="ArrowLeft" size={16} />
          回漂流瓶
        </Link>
        <span className="text-slate-current">漂流日志</span>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-[1.5rem] font-semibold text-abyss">
          {bottle.data.songTitle}
          <span className="ml-[12px] text-[1rem] font-normal text-slate-current">漂流日志</span>
        </h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          这支瓶子从被发起到现在，每一次捞取、录音、投河、回传、入海都会在这里留下一条记录。
          操作者只显示匿名代号 —— 系统行为会标成「系统」。
        </p>
      </header>

      <ol data-testid="drift-log" className="flex flex-col gap-3">
        {timeline.map((entry) => (
          <li
            key={entry.seq}
            className="flex flex-wrap items-baseline gap-3 rounded-base border border-mist bg-foam px-4 py-3"
          >
            <span
              className="text-[0.8125rem] text-slate-current"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              #{String(entry.seq).padStart(2, '0')}
            </span>
            <span className="text-[1rem] font-medium text-abyss">{entry.label}</span>
            <span className="flex items-center gap-2 text-[0.875rem] text-slate-current">
              <Icon name={entry.isSystem ? 'Settings' : 'UserRound'} size={16} />
              {entry.actor}
            </span>
            <span className="ml-auto text-[0.875rem] text-slate-current">{entry.at}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
