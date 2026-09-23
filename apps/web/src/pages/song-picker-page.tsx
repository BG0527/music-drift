/**
 * 选歌 → 发起（CONTEXT §3.1）。
 *
 * 版权红线（captain 裁决）：**不使用官方专辑封面**（用内联 SVG），**不复制歌词正文**，
 * 只给结构性信息（这首歌分几段、每段多长、第几段先由你唱）。
 */
import { useState } from 'react';
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
  /**
   * 曲库过滤（§46.3：曲库变长时页面仍要一屏装下）。
   * 这是**本地过滤**，不是分页：`/api/songs` 目前没有游标契约，所以绝不假装有下一页。
   * 曲目真的多到一屏放不下时，正确做法是给 `/api/songs` 加游标（已上报 captain），
   * 不是在前端造一个"下一页"。
   */
  const [keyword, setKeyword] = useState('');

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
        {(items) => {
          const needle = keyword.trim().toLowerCase();
          const matched =
            needle.length === 0
              ? items
              : items.filter((song) => song.title.toLowerCase().includes(needle));
          return (
            <div className="flex flex-col gap-4" data-anchor="new-catalog">
              <label className="flex flex-wrap items-center gap-3">
                <span className="text-[0.875rem] text-slate-current">找歌</span>
                <input
                  type="search"
                  value={keyword}
                  placeholder="按曲名过滤"
                  aria-label="按曲名过滤曲库"
                  onChange={(event) => {
                    setKeyword(event.target.value);
                  }}
                  className="h-[36px] w-[220px] rounded-pill border border-mist bg-wave-white px-4 text-[0.875rem] text-abyss"
                />
                <span className="text-[0.875rem] text-slate-current">
                  {matched.length === items.length
                    ? `曲库共 ${String(items.length)} 首`
                    : `匹配 ${String(matched.length)} / ${String(items.length)} 首`}
                </span>
              </label>

              {matched.length === 0 ? (
                <p className="rounded-base border border-mist bg-foam px-4 py-[10px] text-[0.9375rem] text-slate-current">
                  曲库里没有名字含「{keyword}」的歌，换个词试试。
                </p>
              ) : (
                <ul className="grid gap-3 xl:grid-cols-2">
                  {matched.map((song) => {
                    const firstSegment = song.segments[0];
                    const seconds =
                      firstSegment === undefined
                        ? null
                        : Math.round(firstSegment.durationMs / 1000);
                    /**
                     * 【用户可见缺陷】`segments` 为空 = 这首歌没有切分/预设
                     * （服务端侧有 fail-closed 兜底：无预设拒绝录制）。
                     * 如果这里不挡，用户会一路到草稿里卡死：建了空草稿 → 录制被拒 → 无路可走。
                     * 处置方式是**禁用 + 在行内写明理由**（不静默隐藏：用户要知道它存在、以及为什么不能选）。
                     */
                    const startable = song.segments.length > 0;
                    return (
                      <li key={song.id}>
                        {/* 一行一首（§46.3）：曲名 + 结构性元信息 + 动作，不铺三行说明 */}
                        <Card className="flex flex-wrap items-center gap-x-[12px] gap-y-[8px] py-[12px]">
                          <BottleMark size={36} />
                          <p className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold text-abyss">
                            {song.title}
                          </p>
                          <p className="flex flex-wrap items-center gap-x-[12px] text-[0.875rem] text-slate-current">
                            <span>共 {song.totalSegments} 段</span>
                            {seconds === null ? null : <span>每段约 {String(seconds)} 秒</span>}
                            <span>来源：{song.licensedSource}</span>
                          </p>
                          {startable ? null : (
                            <span className="text-[0.8125rem] leading-[1.6] text-warning">
                              这首还没有切分，暂不能发起
                            </span>
                          )}
                          <Button
                            variant="primary"
                            className="h-[36px] min-h-[36px] px-[14px] text-[0.875rem]"
                            loading={create.isPending}
                            disabled={!startable}
                            icon={<Icon name="Mic" size={16} />}
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
                            {startable ? '选这首，录第 1 段' : '暂不可发起'}
                          </Button>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        }}
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
