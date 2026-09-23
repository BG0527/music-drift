/**
 * 首页（Figma `home-river` 的**三段结构**，一屏一动作）。
 *
 * Figma 帧（`docs/figma/frames/4-43--home-river.md` §1）：
 * ```text
 * main-content 1180×871 · column · gap 32 · padding 40/48
 *   ├── header-row 1084×50        标题 24/600 + 副标 14/400
 *   ├── hero-fishing-zone 1084×517 · padding 48      ← 主交互区
 *   │   └── ripple-system 240×240（240/180/130 三层涟漪）+ master-pick-btn 110×110
 *   └── mood-filters 370×35 · gap 12 · padding 8/18   ← 5 个心情标签
 * ```
 * 三条纪律：
 * 1. **一屏三段、不滚动**：所以「今日海面」列表**不在首页**（作品列表归公海；我参与过的归「我的」）；
 * 2. **招牌主交互不许换掉**：三层涟漪 + 110×110 圆形捞取按钮，不能退化成"带边框的卡片按钮"；
 * 3. **文字必须包在 `<span className="whitespace-nowrap">` 里**：裸文本节点在 flex 容器中是匿名 flex item，
 *    空间不足会被压到 min-content（**一列一个字符**）—— 375px 下「捞 一 个 漂 流 瓶」竖排就是这么来的
 *    （captain 截图实测）。
 */
import { Icon, RippleRing } from '../design-system';
import { useSession } from '../features/session/session-context';
import { Link } from './shell/router';
import { TEXT_LINK } from './shell/link-styles';

/** Figma 的心情标签（Demo 只保留样式，不参与筛选 —— CONTEXT §3.1 / §3.2）。 */
const MOOD_TAGS = ['全部', '深夜', '通勤', '告白', '雨天'] as const;

export function HomePage() {
  const session = useSession();
  const authed = session.status === 'authed';
  const riverHref = authed ? '/river' : `/login?next=${encodeURIComponent('/river')}`;
  const newHref = authed ? '/new' : `/login?next=${encodeURIComponent('/new')}`;
  const meHref = authed ? '/me' : `/login?next=${encodeURIComponent('/me')}`;

  return (
    <div className="flex flex-col gap-[32px]">
      {/* header-row：标题 24/600 + 副标 14/400；右侧只放次级入口，不抢主交互 */}
      <header className="flex flex-wrap items-end justify-between gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <h1 className="text-[1.5rem] font-semibold text-abyss">暖流河道</h1>
          <p className="text-[0.875rem] text-slate-current">拾起那些搁浅在黑夜里的声线</p>
        </div>
        <nav aria-label="快捷入口" className="flex flex-wrap items-center gap-[16px]">
          <Link to="/sea" className={TEXT_LINK}>
            公海大厅
          </Link>
          <Link to={meHref} className={TEXT_LINK}>
            我参与过的漂流瓶
          </Link>
          <Link to={newHref} className={TEXT_LINK}>
            投出第一棒
          </Link>
        </nav>
      </header>

      {/* hero-fishing-zone：深水暗底 + 三层涟漪 + 110×110 主按钮（Figma 的招牌主交互） */}
      <section
        aria-labelledby="hero-heading"
        className="flex flex-col items-center justify-center gap-[16px] rounded-2xl bg-deep-current px-[16px] py-[24px] text-wave-white md:min-h-[517px] md:gap-[24px] md:px-[48px] md:py-[40px]"
      >
        <h2 id="hero-heading" className="sr-only">
          从河道捞一个漂流瓶
        </h2>

        <div className="relative flex h-[180px] w-[180px] items-center justify-center md:h-[240px] md:w-[240px]">
          {/*
            三层涟漪（桌面 240 / 180 / 130；移动按比例缩到 180 / 140 / 100 以保一屏）。
            ⚠️ 这里**静态描边 + 动画涟漪分两层**：
            只用 `RippleRing`（纯动画）时，涟漪会随动画淡出 —— 静止截图/静态环境下
            招牌主交互看起来"什么都没有"（我第一版就是这样被抓到的）。
            所以三层用静态圆圈保证**任何时刻都看得见**，再叠一层动画做"水面在动"的感觉。
          */}
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

          <Link
            to={riverHref}
            aria-label="捞一个漂流瓶"
            data-anchor="home-pick"
            className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-peacock md:h-[110px] md:w-[110px] text-wave-white transition-transform duration-200 ease-out hover:scale-[1.03] hover:bg-peacock-deep focus-visible:ring-2 focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current active:translate-y-[-1px]"
          >
            <span className="flex flex-col items-center gap-[4px]">
              <Icon name="Waves" size={24} />
              <span className="whitespace-nowrap text-[0.8125rem] font-semibold">捞取</span>
            </span>
          </Link>
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
      </section>

      {/* mood-filters：5 个标签；Demo 只作展示（不参与筛选） */}
      <section aria-labelledby="mood-heading" className="flex flex-col gap-[8px] md:gap-[12px]">
        <h2 id="mood-heading" className="sr-only">
          心情标签
        </h2>
        <ul className="flex flex-wrap items-center gap-[8px] md:gap-[12px]">
          {MOOD_TAGS.map((tag, index) => (
            <li key={tag}>
              <span
                className={
                  index === 0
                    ? 'flex h-[44px] items-center rounded-pill bg-peacock px-[12px] text-[0.8125rem] font-semibold text-wave-white md:px-[18px] md:text-[0.875rem]'
                    : 'flex h-[44px] items-center rounded-pill border border-driftline bg-transparent px-[12px] text-[0.8125rem] text-peacock md:px-[18px] md:text-[0.875rem]'
                }
              >
                {tag}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[0.8125rem] text-slate-current">
          心情标签这一版只作展示（Demo 不做推荐匹配）：等曲库与匹配上线后才参与筛选。
        </p>
      </section>
    </div>
  );
}
