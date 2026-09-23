/**
 * 选歌 → 发起（CONTEXT §3.1）。
 *
 * 版权红线（captain 裁决）：**不使用官方专辑封面**（用内联 SVG），**不复制歌词正文**，
 * 只给结构性信息（这首歌分几段、每段多长、第几段先由你唱）。
 */
import { useCreateBottle } from '../features/api/mutations';
import { useSongs } from '../features/api/queries';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { useSession } from '../features/session/session-context';
import {
  BottleMark,
  Button,
  Card,
  EmptyState,
  Icon,
  Skeleton,
  WaveDivider,
} from '../design-system';
import { AsyncBoundary } from './shell/async-boundary';
import { useNavigate } from './shell/router-context';

export function SongPickerPage() {
  const songs = useSongs();
  const create = useCreateBottle();
  const navigate = useNavigate();
  const session = useSession();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">选一首歌，投出第一棒</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          这里每首歌都被切成固定段位（同一位置永远属于同一段，斩浪也不会把后面的段前移）。 你录第 1
          段，之后交给河道里的陌生人。
        </p>
      </header>

      <AsyncBoundary
        query={songs}
        skeleton={
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton height="7rem" width="100%" />
            <Skeleton height="7rem" width="100%" />
          </div>
        }
        emptyWhen={(items) => items.length === 0}
        empty={
          <EmptyState
            icon="Music"
            title="曲库还没准备好"
            description="这一版还没有可选的歌。曲库接入后，这里会出现可以分成 4 段的曲目。"
          />
        }
      >
        {(items) => (
          <ul className="flex flex-col gap-4">
            {items.map((song) => {
              const firstSegment = song.segments[0];
              const seconds =
                firstSegment === undefined ? null : Math.round(firstSegment.durationMs / 1000);
              return (
                <li key={song.id}>
                  <Card className="flex flex-col gap-4 md:flex-row md:items-center">
                    <BottleMark size={56} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-[1.125rem] font-semibold text-abyss">{song.title}</p>
                      <p className="text-[0.875rem] text-slate-current">
                        共 {song.totalSegments} 段
                        {seconds === null ? '' : ` · 每段约 ${String(seconds)} 秒`}
                        {` · 来源：${song.licensedSource}`}
                      </p>
                      <p className="text-[0.875rem] leading-[1.6] text-slate-current">
                        你录的是第 1 段；录完可以选择继续投河，或者直接送进公海。
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      loading={create.isPending}
                      icon={<Icon name="Mic" size={18} />}
                      onClick={() => {
                        // 「我参与过的漂流瓶」由服务端 `GET /api/me/bottles` 提供（t19），
                        // 页面不再写任何本机书签 —— 少一处"第二真相"。
                        void create
                          .mutateAsync({ songId: song.id })
                          .then((bottle) => {
                            navigate(`/bottles/${bottle.id}`);
                          })
                          .catch(() => undefined);
                      }}
                    >
                      选这首，去录第一段
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </AsyncBoundary>

      {create.isError ? <ConflictNotice error={create.error} retryLabel="再试一次" /> : null}

      <WaveDivider />

      <p className="text-[0.875rem] leading-[1.6] text-slate-current">
        {session.status === 'authed'
          ? '发起之后你会拿到这支瓶子的匿名代号；别人看到的是代号，不是你的账号。'
          : '发起需要登录：账号只用来认领你自己的漂流瓶，别人看到的是每个瓶子单独的匿名代号。'}
      </p>
    </div>
  );
}
