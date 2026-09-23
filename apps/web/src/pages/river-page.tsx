/**
 * 河道（Figma `home-river` 的主交互，加一个**等权**的"投下"区）。
 *
 * 两个主区（用户 2026-09-23 裁决：**投下漂流瓶要和捞起同样重**）：
 * - **捞起**：三层涟漪 + 圆形主按钮（110×110），点击即随机打捞；
 * - **投下**：同规格的第二个主区（选歌 → 录第 1 段 → 确认投河）。
 *
 * 几何一律写显式 px：`theme.css` 把 `--spacing` 覆盖成 0.5rem，
 * 于是 `h-40` = 320px、`h-28` = 224px（不是 160/112）—— 这正是"按钮巨大、排版比例不对"的来源。
 */
import { Button, Icon, RippleRing, cn } from '../design-system';
import { useDrawBottle, useInvalidateBottle } from '../features/api/mutations';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { useSession } from '../features/session/session-context';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { TEXT_LINK } from './shell/link-styles';

export function RiverPage() {
  const draw = useDrawBottle();
  const invalidate = useInvalidateBottle();
  const navigate = useNavigate();
  const session = useSession();
  const newHref =
    session.status === 'authed' ? '/new' : `/login?next=${encodeURIComponent('/new')}`;

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
    <div className="flex flex-col gap-[32px]">
      <header className="flex flex-col gap-[4px]">
        <h1 className="text-[1.5rem] font-semibold text-abyss">暖流河道</h1>
        <p className="text-[0.875rem] text-slate-current">拾起那些搁浅在黑夜里的声线</p>
      </header>

      <div className="grid gap-[24px] lg:grid-cols-2">
        {/* ① 捞起 */}
        <section
          aria-labelledby="draw-heading"
          className="flex min-h-[440px] flex-col items-center justify-center gap-[24px] rounded-2xl bg-deep-current px-[16px] py-[24px] text-wave-white md:min-h-[517px] md:px-[48px] md:py-[40px]"
        >
          <h2 id="draw-heading" className="sr-only">
            从河道捞一个漂流瓶
          </h2>

          <div className="relative flex h-[180px] w-[180px] items-center justify-center md:h-[240px] md:w-[240px]">
            {/* 静态三层涟漪（240/180/130）保证任何时刻都看得见 + 一层动画做"水面在动" */}
            <span
              aria-hidden="true"
              className="absolute h-[180px] w-[180px] rounded-full border border-lagoon/35 md:h-[240px] md:w-[240px]"
            />
            <span
              aria-hidden="true"
              className="absolute h-[140px] w-[140px] rounded-full border border-lagoon/45 md:h-[180px] md:w-[180px]"
            />
            <span
              aria-hidden="true"
              className="absolute h-[100px] w-[100px] rounded-full border border-sea-glass/40 md:h-[130px] md:w-[130px]"
            />
            <RippleRing className="h-[180px] w-[180px] md:h-[240px] md:w-[240px]" />

            <Button
              variant="primary"
              loading={draw.isPending}
              aria-label="捞一个漂流瓶"
              className={cn(
                'relative z-10 h-[88px] w-[88px] rounded-full px-0 md:h-[110px] md:w-[110px]',
              )}
              onClick={onDraw}
            >
              <span className="flex flex-col items-center gap-[4px]">
                <Icon name="Waves" size={24} />
                <span className="whitespace-nowrap text-[0.8125rem] font-semibold">捞取</span>
              </span>
            </Button>
          </div>

          <div className="flex flex-col items-center gap-[8px] text-center">
            <p className="text-[1.125rem] font-semibold">
              <span className="whitespace-nowrap">捞一个漂流瓶</span>
            </p>
            <p className="max-w-[38rem] text-[0.875rem] leading-[1.6] text-on-dark-muted">
              捞取深海深处传来的匿名哼唱，接续她的下一句旋律。
              <span className="whitespace-nowrap">捞到即持有</span>
              ：同一时刻，同一条河道上只有你拿着它。
            </p>
            <p className="text-[0.8125rem] leading-[1.6] text-on-dark-muted">
              河道只能随机打捞，没有搜索，也不能指定某个人来接。
            </p>
          </div>

          {draw.isPending ? (
            <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold">
              正在打捞…
            </p>
          ) : null}
        </section>

        {/* ② 投下（等权） */}
        <section
          aria-labelledby="cast-heading"
          className="flex min-h-[440px] flex-col items-center justify-center gap-[24px] rounded-2xl bg-deep-current px-[16px] py-[24px] text-wave-white md:min-h-[517px] md:px-[48px] md:py-[40px]"
        >
          <h2 id="cast-heading" className="sr-only">
            投下一支漂流瓶
          </h2>

          <div className="relative flex h-[180px] w-[180px] items-center justify-center md:h-[240px] md:w-[240px]">
            <span
              aria-hidden="true"
              className="absolute h-[180px] w-[180px] rounded-full border border-coral/35 md:h-[240px] md:w-[240px]"
            />
            <span
              aria-hidden="true"
              className="absolute h-[140px] w-[140px] rounded-full border border-coral/45 md:h-[180px] md:w-[180px]"
            />
            <span
              aria-hidden="true"
              className="absolute h-[100px] w-[100px] rounded-full border border-coral/55 md:h-[130px] md:w-[130px]"
            />

            <Link
              to={newHref}
              aria-label="投下一支漂流瓶"
              className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-coral text-wave-white transition-transform duration-200 ease-out hover:scale-[1.03] hover:bg-coral-deep focus-visible:ring-2 focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current active:translate-y-[-1px] md:h-[110px] md:w-[110px]"
            >
              <span className="flex flex-col items-center gap-[4px]">
                <Icon name="Music" size={24} />
                <span className="whitespace-nowrap text-[0.8125rem] font-semibold">投下</span>
              </span>
            </Link>
          </div>

          <div className="flex flex-col items-center gap-[8px] text-center">
            <p className="text-[1.125rem] font-semibold">
              <span className="whitespace-nowrap">投下一支漂流瓶</span>
            </p>
            <p className="max-w-[38rem] text-[0.875rem] leading-[1.6] text-on-dark-muted">
              选一首歌，录下第 1 段 15–30 秒，然后投进河道等一个陌生人接下一棒。
            </p>
            <p className="text-[0.8125rem] leading-[1.6] text-on-dark-muted">
              投河之后就交出去了；想找回来看，去「我参与过的漂流瓶」。
            </p>
          </div>
        </section>
      </div>

      {draw.isError ? (
        <ConflictNotice
          error={draw.error}
          onRetry={onDraw}
          retryLabel="再捞一次"
          className="max-w-[46rem]"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-[16px]">
        <Link to="/sea" className={TEXT_LINK}>
          先去公海听听已经完成的作品
        </Link>
        <Link
          to={session.status === 'authed' ? '/me' : `/login?next=${encodeURIComponent('/me')}`}
          className={TEXT_LINK}
        >
          我参与过的漂流瓶
        </Link>
      </div>
    </div>
  );
}
