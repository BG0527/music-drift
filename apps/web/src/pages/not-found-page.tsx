/**
 * 404：**划伤跳针**（record-v1 装置；`docs/impl-plan-record-v1.md` §5.1，
 * 逐值对照 `docs/ui-review/design-explore/p-404-record.html`）。
 *
 * 装置要**承担信息**，不是贴纸 —— 这一页是一张**被划开、水从断口漏干的母版**：
 * - 上半页是**灌着水的水路**，下半页是**干河床**（水位痕还在，水没了）；
 * - 水在页面中间**到头**：一条横贯的亮水线，**把标题切成两半**
 *   （上半抬升 7px、下半下沉 5px 并压暗 —— 划痕是从字形中间穿过去的，不是标题下面画了根线）；
 * - 断口处**母版被彻底撕开**：一块锯齿状的豁口，里面写着「这条水路不存在」；
 * - 右下**唱针压上来**，针尖落在豁口里（跳针）；
 * - 右上那只**已经被人接走的瓶**顺水漂出画外，只剩尾迹与散开的涟漪。
 *
 * 纪律：装饰一律 `aria-hidden` + `pointer-events-none` + 绝对定位（零布局高度 ⇒ 不会顶破
 * 「桌面一屏」）；出血层包在 `overflow-hidden` 里（否则撑大 `scrollWidth`）。
 * **豁口不是装饰**：它是真内容，读屏必须读得到，所以它在流里、不在装饰层里。
 */
import { BottleMark, Glint, Platter } from '../design-system';
import { Link } from './shell/router';

/** 元信息行（11px + .24em；设计稿 `.cat` = paper/.5）。 */
const META = 'text-[0.6875rem] tracking-[0.24em] text-paper/50';
/** 次级文字链接：`glass` = 冷光（DESIGN.md 把"链接"归给它），且 ≥44px 可点目标。
    名字里的 `TEXT_LINK_` 前缀是**故意的**：`design-discipline.test.ts` 用它与 `min-h-11`
    作为"这条链接是可点目标"的静态判据（同 `pages/shell/link-styles.ts` 的两个常量）。 */
const TEXT_LINK_COOL =
  'inline-flex min-h-11 items-center gap-2 whitespace-nowrap text-glass underline underline-offset-5';

/**
 * 稿 §1-4 水路纹理组（review-404-blocks；坐标按 1440 画布换算，纵偏移相对水线 y=355）。
 * 全部装饰：aria-hidden + 绝对定位 ⇒ 零布局高度。
 */
/** 水面短波：left% / 相对水线偏移(px) / width% / alpha */
const FLOWS = [
  ['40.83%', -53, '14.31%', 0.22],
  ['60.56%', -29, '20.83%', 0.24],
  ['12.5%', -25, '15.97%', 0.16],
  ['84.44%', -43, '13.89%', 0.2],
] as const;
/** 断口漏滴：left% / 顶偏移(px) / 长度(px) / 是否带水珠（稿第 5 道无珠） */
const DRIPS = [
  ['13.61%', 5, 62, true],
  ['29.86%', 7, 44, true],
  ['39.31%', 5, 78, true],
  ['49.03%', 7, 50, true],
  ['57.78%', 7, 36, false],
  ['70.28%', 7, 68, true],
  ['86.94%', 9, 48, true],
] as const;
/** 干裂纹：left% / 顶偏移(px) / 宽(px) / 旋转角（稿登记角 ≤1.6°） */
const CRACKS = [
  ['62.64%', 151, 214, -1.6],
  ['73.89%', 189, 236, 1.4],
  ['65.14%', 241, 160, -1],
  ['80.28%', 283, 196, 1.1],
  ['60.28%', 79, 170, -1.2],
  ['86.11%', 117, 150, 1.3],
  ['7.78%', 393, 196, -1.1],
  ['27.5%', 421, 154, 1.2],
] as const;
/** 划痕（= 水线的断口两侧）：同一根线，被豁口切开。 */
const SCRATCH = 'absolute inset-y-0 bg-water-mid';

export function NotFoundPage() {
  return (
    <div className="enter-fade relative isolate flex flex-col gap-6 overflow-hidden">
      {/* 世界的底与上方：盘面沟槽（划痕刻在一张盘上）+ 掠光 */}
      <Platter />
      <Glint />

      <div className="relative flex items-baseline justify-between gap-4">
        <span className={META}>SIDE ? · 跳针</span>
        <span aria-hidden="true" className="font-latin text-[2.125rem] leading-none text-muted/85">
          404
        </span>
      </div>

      {/* 顺水漂出画外的那只瓶：尾迹（断续）+ 散开的涟漪 + 一句话（装饰层，说明在正文里也有） */}
      <div
        data-device="drifted-bottle"
        aria-hidden="true"
        className="pointer-events-none flex flex-wrap items-center justify-end gap-x-3 gap-y-1 md:absolute md:right-[96px] md:top-[150px] md:flex-col md:items-end md:gap-2"
      >
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 190 44" className="h-[36px] w-[150px] text-water-mid/40" fill="none">
            <path
              d="M2 22 C 60 16, 120 8, 188 4"
              stroke="currentColor"
              strokeDasharray="7 9"
              strokeWidth="1"
            />
            <path
              d="M34 30 C 96 26, 140 18, 188 12"
              stroke="currentColor"
              strokeOpacity="0.5"
              strokeDasharray="5 12"
              strokeWidth="1"
            />
            <ellipse cx="120" cy="30" rx="28" ry="7" stroke="currentColor" strokeOpacity="0.7" />
            <ellipse cx="120" cy="30" rx="48" ry="12" stroke="currentColor" strokeOpacity="0.35" />
          </svg>
          <BottleMark size={54} tone="sea-glass" />
        </span>
        <span className="text-[0.78125rem] tracking-[0.06em] text-muted">瓶子已经被别人接走</span>
      </div>

      {/* 划痕与标题共用同一个行盒 —— 「横断」是结构，不是巧合 */}
      <div className="relative py-6" data-device="scratch-row" data-anchor="notfound-scratch">
        {/* 之上：灌着水的水路（越靠近断口越亮 —— 光在水面上攒住，然后断掉） */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-1/2 top-[-200vh] bg-gradient-to-b from-glass/[0.05] via-glass/[0.1] to-water-mid/[0.24]"
        />
        {/* 之下：干河床（水没了，只剩一道晒干的水位痕） */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[200vh] bg-gradient-to-b from-warm/[0.07] to-transparent"
        />

        {/* 水线：全页唯一一条横线。它在这里**到头**，所以它同时就是那道划痕
            （两段亮度取设计稿 `.surface` 渐变：左段均值 ≈.3、右段 ≈.55，不是实心亮线） */}
        <span
          data-device="scratch"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2"
        >
          <span
            data-device="scratch-before"
            className={`${SCRATCH} left-0 w-[58%] opacity-[0.3]`}
          />
          <span
            data-device="scratch-after"
            className={`${SCRATCH} right-0 w-[24%] opacity-[0.55]`}
          />
        </span>
        {/* 断口前攒光（稿 .lip：线下 42px 带渐亮）+ 水面短波 4 条（稿 .flows） */}
        <span
          data-device="water-lip"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[calc(50%-42px)] h-[42px] bg-[linear-gradient(180deg,transparent,rgba(203,238,246,0.14)_62%,rgba(203,238,246,0.28))]"
        />
        <span data-device="water-flows" aria-hidden="true" className="pointer-events-none absolute inset-0">
          {FLOWS.map(([left, offset, width, alpha]) => (
            <i
              key={`flow-${left}`}
              className="absolute block h-px"
              style={{
                left,
                top: `calc(50% + ${String(offset)}px)`,
                width,
                background: `rgba(203,238,246,${String(alpha)})`,
              }}
            />
          ))}
        </span>

        {/* 伤口压暗（稿 .edge：线下 22px）+ 干河床沟槽残影（稿 .ghost） */}
        <span
          data-device="water-edge"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[22px] bg-[linear-gradient(180deg,transparent,rgba(2,8,11,0.72))]"
        />
        <span
          data-device="water-ghost"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-[160px]"
          style={{
            background:
              'repeating-radial-gradient(circle at 1500px 1400px, rgba(216,243,246,0.09) 0 1px, transparent 1px 15px)',
            maskImage: 'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.08) 62%, rgba(255,255,255,0))',
            WebkitMaskImage:
              'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.08) 62%, rgba(255,255,255,0))',
          }}
        />

        {/* 断口往下漏的细流 + 水珠（稿 .drips：7 道、6 颗珠） */}
        <span data-device="water-drips" aria-hidden="true" className="pointer-events-none absolute inset-0">
          {DRIPS.map(([left, offset, height]) => (
            <span key={`drip-${left}`} className="absolute block w-px" style={{
              left,
              top: `calc(50% + ${String(offset)}px)`,
              height,
              background: 'linear-gradient(180deg, rgba(203,238,246,0.5), rgba(203,238,246,0))',
            }} />
          ))}
          {DRIPS.filter((drip) => drip[3]).map(([left, offset, height]) => (
            <i key={`droplet-${left}`} className="absolute block h-[3px] w-[3px] rounded-full" style={{
              left,
              top: `calc(50% + ${String(offset + height + 6)}px)`,
              background: 'rgba(203,238,246,0.34)',
            }} />
          ))}
        </span>

        {/* 干裂纹 8 条（稿 .crack，登记角 ≤1.6°，落在下半的干河床里） */}
        <span data-device="water-cracks" aria-hidden="true" className="pointer-events-none absolute inset-0">
          {CRACKS.map(([left, offset, width, rotate]) => (
            <i
              key={`crack-${left}-${String(offset)}`}
              className="absolute block h-px"
              style={{
                left,
                top: `calc(50% + ${String(offset)}px)`,
                width,
                transform: `rotate(${String(rotate)}deg)`,
                background: 'rgba(216,243,246,0.2)',
              }}
            />
          ))}
        </span>

        {/* 干裂的水位痕：曾经有水的地方，现在只剩一道白印 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[86%] h-px bg-warm/20"
        />

        <div className="relative">
          {/* 标题被那道划痕切断：上半抬升 + 下半下沉，中间是母版被划开的空档 */}
          <h1 className="relative w-fit text-[1.625rem] font-bold leading-[1] text-paper md:text-[3.875rem]">
            <span className="block translate-x-[7px] [clip-path:inset(0_0_45.5%_0)]">
              找不到这一页
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-0 block translate-x-[-5px] text-paper/[0.84] [clip-path:inset(61%_0_0_0)]"
            >
              找不到这一页
            </span>
          </h1>

          {/* 豁口：母版在这一段被彻底撕开，撕开的地方写着"这条水路不存在" */}
          <span
            data-device="scratch-notch"
            className="absolute right-0 top-1/2 flex h-[42px] w-[9.5rem] -translate-y-1/2 items-center justify-center md:right-[220px] md:h-[52px] md:w-[20rem]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 322 53"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <path
                d="M0 20 L14 3 L40 16 L66 5 L94 13 L126 0 L154 12 L186 2 L212 15 L244 3 L270 14 L298 6 L322 22 L322 48 L292 40 L262 51 L230 40 L200 53 L168 41 L136 52 L104 40 L72 51 L42 39 L14 46 L0 31 Z"
                fill="var(--color-water-void)"
                stroke="var(--color-line)"
                strokeOpacity="0.18"
              />
            </svg>
            <span className="relative text-[0.96875rem] tracking-[0.12em] text-muted">
              这条水路不存在
            </span>
          </span>
        </div>
      </div>

      {/* 唱针：从右下压上来，针尖落在豁口里（跳针）。绝对定位 ⇒ 零布局高度 */}
      <span
        data-device="stylus"
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-[34%] w-[120px] md:top-[38%] md:w-[210px]"
      >
        <svg viewBox="0 0 260 570" className="block h-auto w-full text-water-light/50" fill="none">
          <path d="M250 560 L34 16" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.4" />
          <rect
            x="16"
            y="2"
            width="34"
            height="9"
            rx="2"
            transform="rotate(-30 33 6)"
            fill="currentColor"
            fillOpacity="0.14"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <path d="M32 12 L38 22" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" />
          <circle cx="215" cy="490" r="9" stroke="currentColor" strokeOpacity="0.34" />
          <circle
            cx="215"
            cy="490"
            r="3.5"
            fill="var(--color-water-void)"
            stroke="currentColor"
            strokeOpacity="0.34"
          />
        </svg>
        <span className="absolute right-0 top-[8%] text-[0.6875rem] tracking-[0.24em] text-paper/50">
          跳针
        </span>
      </span>

      <p className="max-w-[540px] text-[0.96875rem] leading-[1.9] text-muted">
        这个地址可能是旧的，或者瓶子已经被别人接走、链接失效了。
      </p>

      <Link
        to="/"
        className="inline-flex min-h-11 items-center whitespace-nowrap self-start border-b border-coral pb-[5px] text-[1.0625rem] text-paper"
      >
        回首页
      </Link>

      <span aria-hidden="true" className="h-px w-full max-w-[42.75rem] bg-line/13" />

      <div className="flex flex-col gap-1">
        <p className="text-[0.90625rem] text-muted">也可以换个入口继续：</p>
        <nav aria-label="换个入口" className="flex flex-wrap items-center gap-x-11">
          <span className="flex items-center gap-3">
            <i aria-hidden="true" className="block h-3 w-px bg-glass/45" />
            <Link to="/river" className={TEXT_LINK_COOL}>
              去河道捞一个漂流瓶
            </Link>
          </span>
          <span className="flex items-center gap-3">
            <i aria-hidden="true" className="block h-3 w-px bg-glass/45" />
            <Link to="/sea" className={TEXT_LINK_COOL}>
              去公海听完成的作品
            </Link>
          </span>
        </nav>
      </div>
    </div>
  );
}
