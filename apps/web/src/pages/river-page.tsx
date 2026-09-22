/**
 * 河道（Figma `home-river` 采纳 IA：标题区 / 捞取主交互区 / 说明行）。
 *
 * 一屏一个动作：**随机捞一个瓶子**。视觉按 `DESIGN.md`：主交互区用深水暗底（沉浸式区块），
 * 涟漪是内联 SVG（不复刻 Figma 的外发光）。
 *
 * 交互纪律：
 * - 捞取中按钮 loading，且**不可重复提交**（避免一次点击开出两个持有请求）；
 * - 河道空（409 `NO_BOTTLE_AVAILABLE`）是**正常业务结果** → 空态 + 两个出口，不是红色报错。
 */
import { Button, Icon, RippleRing, cn } from '../design-system';
import { useDrawBottle, useInvalidateBottle } from '../features/api/mutations';
import { ConflictNotice } from '../features/bottle/conflict-notice';
import { rememberBottle, browserBottleStorage } from '../features/profile/bottle-index';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { TEXT_LINK } from './shell/link-styles';

export function RiverPage() {
  const draw = useDrawBottle();
  const invalidate = useInvalidateBottle();
  const navigate = useNavigate();

  function onDraw(): void {
    void draw
      .mutateAsync()
      .then(async (response) => {
        rememberBottle(browserBottleStorage(), {
          id: response.bottle.id,
          songTitle: response.bottle.songTitle,
          role: 'RELAY',
          at: new Date().toISOString(),
        });
        await invalidate(response.bottle.id);
        navigate(`/bottles/${response.bottle.id}`);
      })
      .catch(() => undefined);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">暖流河道</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          拾起那些搁浅在黑夜里的声线。河道只能随机打捞：没有搜索，也不能指定谁来接你的瓶子。
        </p>
      </header>

      <section className="flex flex-col items-center gap-6 rounded-2xl bg-deep-current px-6 py-10 text-wave-white">
        <div className="relative flex h-40 w-40 items-center justify-center">
          <RippleRing />
          <RippleRing className="[animation-delay:0.8s]" />
          <RippleRing className="[animation-delay:1.6s]" />
          <Button
            variant="primary"
            loading={draw.isPending}
            className={cn('relative z-10 h-28 w-28 rounded-full p-0 text-[1rem]')}
            onClick={onDraw}
            icon={<Icon name="Waves" size={24} />}
          >
            捞一个漂流瓶
          </Button>
        </div>

        <p className="max-w-[38rem] text-center text-[0.9375rem] leading-[1.6] text-on-dark-muted">
          捞取深海深处传来的匿名哼唱，接续她的下一句旋律。捞到即持有 ——
          同一时刻，同一条河道上只有你拿着它。
        </p>

        {draw.isPending ? (
          <p role="status" aria-live="polite" className="text-[0.9375rem] font-semibold">
            正在打捞…
          </p>
        ) : null}
      </section>

      {draw.isError ? (
        <ConflictNotice
          error={draw.error}
          onRetry={onDraw}
          retryLabel="再捞一次"
          className="max-w-[46rem]"
        />
      ) : null}

      <div className="flex max-w-[46rem] flex-col gap-1 text-[0.875rem] leading-[1.6] text-slate-current">
        <p>
          放回海里的瓶子有短暂冷却，短时间内不会再漂回同一双手；你参与过的瓶子也不会再回到你手上。
        </p>
        <Link to="/sea" className={TEXT_LINK}>
          先去公海听听已经完成的作品
        </Link>
      </div>
    </div>
  );
}
