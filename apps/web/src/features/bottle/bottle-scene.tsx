/**
 * 瓶身剖面场景（`site/bottle.html` 的 `svg.scene` 逐值移植，数据驱动）。
 *
 * 画布 1440×900、水面 y=430（`site/patches/bottle.css` 头注：场景与标注整块按 --u 缩放）：
 * - **玻璃瓶**：`bottleShape`（左圆底、右肩线接瓶颈/瓶口）+ 内壁厚度线 + 瓶底弧；
 * - **水**：只画到「从第 1 段起连续录满」的前沿（参考 `renderWater` 同款
 *   `M60 430 H{frontX} Q… 592 H60 Z`）；没有一段录满时整片水不画（瓶子是干的）；
 * - **纸卷**＝已录的声音：前沿内每段一卷（半沉半露浮在水位上，参考 `renderRolls` 同款显隐）；
 * - **格位**：分隔刻线（308..592 通高只到倒数第二条）+ 瓶壁上的短刻线（312..328）；
 * - **瓶塞**（HELD 才画）与**水面引线**（把「河道水面」接到水线上）。
 *
 * 纯装饰：`aria-hidden`、零高度（绝对定位），对一屏门禁零贡献。
 * 颜色**只走 DESIGN token**（`design-discipline` 禁内联 hex）：参考 hex 逐一映射同值 token ——
 * `#eafcff→water-light`、`#cbeef6→water-mid`、`#e4f7fc→water-deep`、`#031117→water-void`、
 * `#0a303c→water-bed`、`#f3f9fa→paper`、`#a9c7cf→muted`、`#7fd1d9→glass`、`#d4553a→coral`、
 * `#f6d79a→warm`、`#050f14→ink`（#dbeef2/#8a6a34 无同值 token ⇒ 用 paper / warm×ink 混色）。
 */
export interface BottleSceneProps {
  /** 歌的分段数（决定格位宽度：76 → 1000 等分）。 */
  totalSegments: number;
  /** 连续录满的前沿段数（0 = 干瓶，不画水）。 */
  waterFront: number;
  /** 瓶塞：服务端状态 HELD 才画（我们不照抄参考"永远画"的笔误）。 */
  showCork: boolean;
}

const PROFILE_LEFT = 76;
const PROFILE_RIGHT = 1000;
const WATER_SLANT_X = 93;
const WATER_SLANT_CONTROL_X = 71;

/** 第 `index`（1-based）格的设计坐标。 */
function cellSlot(index: number, total: number): { left: number; width: number } {
  const width = (PROFILE_RIGHT - PROFILE_LEFT) / total;
  return { left: PROFILE_LEFT + (index - 1) * width, width };
}

export function BottleScene({ totalSegments, waterFront, showCork }: BottleSceneProps) {
  const count = Math.max(1, totalSegments);
  const frontX = PROFILE_LEFT + waterFront * cellSlot(1, count).width;
  const bottomX = frontX + WATER_SLANT_X;
  const controlX = frontX + WATER_SLANT_CONTROL_X;
  const drawWater = waterFront > 0;

  // 格位分隔：刻线每条边界都有；通高线只到倒数第二条（定稿画法）
  const boundaries = Array.from({ length: Math.max(0, count - 1) }, (_u, offset) => offset + 1);
  // 纸卷：前沿内每段一卷，横向贴格位中心
  const rolls = Array.from({ length: waterFront }, (_u, offset) => {
    const slot = cellSlot(offset + 1, count);
    return {
      key: offset + 1,
      x: slot.left + (slot.width - 110) / 2,
      scale: Math.min(1, (slot.width - 12) / 110),
    };
  });

  return (
    <svg className="scene" viewBox="0 0 1440 900" aria-hidden="true" focusable="false">
      <defs>
        <path
          id="bp-bottle-shape"
          d="M226 300 H1000 L1090 390 H1310 L1340 382 V518 L1310 510 H1090 L1000 600 H226 A150 150 0 0 1 226 300 Z"
        />
        <clipPath id="bp-cp-bottle">
          <use href="#bp-bottle-shape" />
        </clipPath>
        <linearGradient id="bp-g-glass" x1="0" y1="300" x2="0" y2="600" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-water-mid)" stopOpacity=".075" />
          <stop offset=".42" stopColor="var(--color-water-bed)" stopOpacity=".20" />
          <stop offset="1" stopColor="var(--color-water-void)" stopOpacity=".52" />
        </linearGradient>
        <linearGradient id="bp-g-water" x1="0" y1="430" x2="0" y2="592" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-glass)" stopOpacity=".22" />
          <stop offset="1" stopColor="var(--color-glass)" stopOpacity=".06" />
        </linearGradient>
        <linearGradient id="bp-g-paper" x1="0" y1="402" x2="0" y2="448" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-paper)" stopOpacity=".92" />
          <stop offset=".55" stopColor="var(--color-paper)" stopOpacity=".8" />
          <stop offset="1" stopColor="var(--color-muted)" stopOpacity=".62" />
        </linearGradient>
        <linearGradient id="bp-g-cork" x1="0" y1="-12" x2="0" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--color-warm)" stopOpacity=".5" />
          <stop offset="1" stopColor="color-mix(in srgb, var(--color-warm), var(--color-ink))" stopOpacity=".62" />
        </linearGradient>
        <linearGradient id="bp-g-sheen" x1="0" y1="900" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset=".28" stopColor="var(--color-water-deep)" stopOpacity="0" />
          <stop offset=".47" stopColor="var(--color-water-deep)" stopOpacity=".07" />
          <stop offset=".52" stopColor="var(--color-water-deep)" stopOpacity=".1" />
          <stop offset=".68" stopColor="var(--color-water-deep)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 河道水面：一条横贯全页的线，穿过玻璃，也在瓶里当水位 */}
      <line x1="0" y1="430" x2="1440" y2="430" stroke="var(--color-water-light)" strokeOpacity=".08" strokeWidth="4" />
      <line x1="0" y1="430" x2="1440" y2="430" stroke="var(--color-water-light)" strokeOpacity=".3" />

      {/* 玻璃 */}
      <use href="#bp-bottle-shape" fill="url(#bp-g-glass)" stroke="var(--color-water-deep)" strokeOpacity=".4" />

      <g clipPath="url(#bp-cp-bottle)">
        {drawWater ? (
          <>
            <path d={`M60 430 H${frontX} Q${controlX} 468 ${bottomX} 592 H60 Z`} fill="url(#bp-g-water)" />
            <rect x="60" y="430" width={frontX - 60} height="24" fill="var(--color-water-mid)" fillOpacity=".05" />
            <path
              d={`M${frontX} 430 Q${controlX} 468 ${bottomX} 592`}
              fill="none"
              stroke="var(--color-water-light)"
              strokeOpacity=".5"
              strokeWidth="1.2"
            />
            <line x1="60" y1="430" x2={frontX} y2="430" stroke="var(--color-water-light)" strokeOpacity=".4" />
          </>
        ) : null}
        {/* 水面在玻璃上打出的折光 */}
        <rect x="90" y="406" width="820" height="6" fill="var(--color-water-mid)" fillOpacity=".045" />
        <rect x="150" y="420" width="700" height="4" fill="var(--color-water-mid)" fillOpacity=".03" />
        {/* 格位通高线（到倒数第二条） */}
        {boundaries.slice(0, -1).map((boundary) => {
          const x = PROFILE_LEFT + boundary * cellSlot(1, count).width;
          return <line key={boundary} x1={x} y1="308" x2={x} y2="592" stroke="var(--color-paper)" strokeOpacity=".13" />;
        })}
        {/* 水里更深的折光与气泡 */}
        <path d="M110 552 q40 -7 80 0 t80 0 t80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="var(--color-water-light)" strokeOpacity=".09" />
        <path d="M200 578 q40 -6 80 0 t80 0 t80 0 t80 0 t80 0" fill="none" stroke="var(--color-water-light)" strokeOpacity=".06" />
        <circle cx="140" cy="536" r="2.5" fill="none" stroke="var(--color-water-light)" strokeOpacity=".3" />
        <circle cx="252" cy="512" r="2" fill="none" stroke="var(--color-water-light)" strokeOpacity=".24" />
        <circle cx="430" cy="566" r="3" fill="none" stroke="var(--color-water-light)" strokeOpacity=".26" />
        <circle cx="640" cy="542" r="2" fill="none" stroke="var(--color-water-light)" strokeOpacity=".24" />
        {/* 玻璃上的掠光 */}
        <path d="M0 0 H1440 V900 H0 Z" fill="url(#bp-g-sheen)" />
      </g>

      {/* 瓶壁厚度与瓶底：让它读起来是玻璃瓶，不是一条管子 */}
      <g fill="none" stroke="var(--color-water-deep)" strokeOpacity=".13">
        <path d="M239 310 H995 L1085 398 H1300" />
        <path d="M239 590 H995 L1085 502 H1300" />
      </g>
      <path d="M226 309 A141 141 0 0 0 226 591" fill="none" stroke="var(--color-water-light)" strokeOpacity=".2" strokeWidth="2" />
      {/* 瓶颈的箍与瓶口的口沿 */}
      <rect x="1088" y="390" width="9" height="120" fill="var(--color-water-deep)" fillOpacity=".06" />
      <line x1="1092" y1="390" x2="1092" y2="510" stroke="var(--color-water-deep)" strokeOpacity=".3" />
      <rect x="1310" y="382" width="30" height="136" fill="var(--color-water-deep)" fillOpacity=".05" />
      <line x1="1312" y1="382" x2="1312" y2="518" stroke="var(--color-water-deep)" strokeOpacity=".26" />
      <line x1="1338" y1="382" x2="1338" y2="518" stroke="var(--color-water-deep)" strokeOpacity=".26" />
      {/* 水面被瓶身破开的两圈涟漪 */}
      <path d="M60 432 A16 16 0 0 0 60 428" fill="none" stroke="var(--color-water-light)" strokeOpacity=".3" />
      <path d="M40 434 A28 28 0 0 0 40 426" fill="none" stroke="var(--color-water-light)" strokeOpacity=".18" />
      {/* 格位短刻线（挂标注用的刻度） */}
      <g stroke="var(--color-water-deep)" strokeOpacity=".18">
        {boundaries.map((boundary) => {
          const x = PROFILE_LEFT + boundary * cellSlot(1, count).width;
          return <line key={boundary} x1={x} y1="312" x2={x} y2="328" />;
        })}
      </g>

      {/* 纸卷声音：浮在水位上（半沉半露）——前沿内每段一卷 */}
      {rolls.map((roll) => (
        <g key={roll.key} transform={`translate(${roll.x} 402) scale(${roll.scale})`}>
          <rect width="110" height="46" rx="23" fill="url(#bp-g-paper)" stroke="var(--color-paper)" strokeOpacity=".5" />
          <path d="M22 2 A21 21 0 0 0 22 44" fill="none" stroke="var(--color-ink)" strokeOpacity=".34" />
          <path d="M10 5 A18 18 0 0 0 10 41" fill="none" stroke="var(--color-ink)" strokeOpacity=".2" />
          <circle cx="22" cy="23" r="4" fill="none" stroke="var(--color-ink)" strokeOpacity=".34" />
        </g>
      ))}

      {/* 瓶塞被取下：塞子在谁手里，瓶子就在谁手里（仅 HELD） */}
      {showCork ? (
        <g transform="translate(1392 428) rotate(-14)">
          <rect x="-28" y="-12" width="56" height="24" rx="12" fill="url(#bp-g-cork)" stroke="var(--color-warm)" strokeOpacity=".5" />
          <line x1="-9" y1="-10" x2="-9" y2="10" stroke="var(--color-ink)" strokeOpacity=".2" />
          <line x1="9" y1="-10" x2="9" y2="10" stroke="var(--color-ink)" strokeOpacity=".2" />
        </g>
      ) : null}

      {/* 水面引线（把「河道水面」接到水线上） */}
      <line x1="1120" y1="336" x2="1120" y2="430" stroke="var(--color-muted)" strokeOpacity=".34" />

      {/* 水里的气泡 + 水下更远的水流 */}
      <circle cx="133" cy="692" r="3" fill="none" stroke="var(--color-water-light)" strokeOpacity=".3" />
      <circle cx="203" cy="762" r="2" fill="none" stroke="var(--color-water-light)" strokeOpacity=".26" />
      <circle cx="306" cy="655" r="2.5" fill="none" stroke="var(--color-water-light)" strokeOpacity=".28" />
      <circle cx="1180" cy="618" r="2" fill="none" stroke="var(--color-water-light)" strokeOpacity=".24" />
      <circle cx="1332" cy="700" r="3" fill="none" stroke="var(--color-water-light)" strokeOpacity=".22" />
      <circle cx="430" cy="842" r="2" fill="none" stroke="var(--color-water-light)" strokeOpacity=".22" />
      <line x1="0" y1="700" x2="1440" y2="700" stroke="var(--color-water-light)" strokeOpacity=".05" />
      <line x1="0" y1="820" x2="1440" y2="820" stroke="var(--color-water-light)" strokeOpacity=".04" />
      <path d="M-20 648 q 240 -14 480 0 t 480 0 t 480 0" fill="none" stroke="var(--color-water-light)" strokeOpacity=".06" />
      <path d="M-20 742 q 300 -12 600 0 t 600 0" fill="none" stroke="var(--color-water-light)" strokeOpacity=".045" />
    </svg>
  );
}
