/**
 * `BottleVessel` —— **捞起 / 抛下分镜里的那只漂流瓶**（t6 重绘，替换 18×54 的占位矩形）。
 *
 * ## 为什么是这些构件（照 record-v1 的物件语言画，不是剪贴画）
 * - **造型**：窄颈 + 收放的肩线 + 直筒瓶身 + 圆底（`path` 曲线剪影，不是圆角矩形）；
 *   颈口一圈**唇环**、上面一截**软木塞**（木纹 + 顶面高光 + 珊瑚色暗面）；
 * - **材质**：玻璃用对角渐变（冷高光 → 深水色 → 底部回光）、左侧长条镜面高光 + 右侧细高光 +
 *   底部内阴影 + 一圈发丝描边（1.25px）+ 瓶底与水面之间的**接触辉光**；
 * - **内容物**：瓶肚里一张**卷纸**（纸面 + 三道字迹 + 珊瑚系绳与绳结），微微侧转 6° ——
 *   它是"里面有一句话"的视觉证据；
 * - **色纪律**：材质色全部是 rgba 或 `var(--color-*)` 同源值，**源码零 hex**
 *   （design-system 不在 design-discipline 的扫描范围 ⇒ 由 `bottle-vessel.test` 自己守）。
 *
 * ## 动效纪律（motion-web）
 * 本组件**自己不动**：它是纯静态物件，位移/淡入由宿主（`river-motion.css` 的
 * `river-vessel-enter-*` / `-hold` / `-exit-*`）承担，因此只动 transform/opacity、
 * 参数只引 `--motion-*` token 的约束天然不被它破坏。
 *
 * 装饰零风险：`aria-hidden` + `pointer-events="none"`（不得挡住泊位按钮）。
 */
import { useId } from 'react';

/** 瓶体剪影（viewBox 88×216）：颈 32→56，肩线 C 收放到 x=8/80，圆底。 */
const BOTTLE_PATH =
  'M32 30 L32 66 C32 84 8 92 8 116 L8 196 Q8 211 23 211 L65 211 Q80 211 80 196 L80 116 C80 92 56 84 56 66 L56 30 Z';

export interface BottleVesselProps {
  /** 渲染宽度（px）；高按 88:216 等比。默认 56 —— 分镜里与收拢涟漪同量级。 */
  size?: number;
  className?: string;
}

export function BottleVessel({ size = 56, className }: BottleVesselProps) {
  // 渐变/裁剪的 id 必须逐实例唯一：同一屏出现两只瓶（分镜 + 空态）时不能互相串色。
  const uid = useId().replace(/:/g, '');
  const glass = `vesselGlass-${uid}`;
  const spec = `vesselSpec-${uid}`;
  const cork = `vesselCork-${uid}`;
  const paper = `vesselPaper-${uid}`;
  const inner = `vesselInner-${uid}`;
  const glow = `vesselGlow-${uid}`;
  const clip = `vesselClip-${uid}`;
  const shadow = `vesselShadow-${uid}`;

  return (
    <svg
      width={size}
      height={Math.round((size * 216) / 88)}
      viewBox="0 0 88 216"
      aria-hidden="true"
      focusable="false"
      pointerEvents="none"
      className={className}
      fill="none"
    >
      <defs>
        {/* 玻璃：左上冷高光 → 中部深水 → 底部回光（与水面同一族色） */}
        <linearGradient id={glass} x1="8" y1="34" x2="80" y2="211" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(203,238,246,.42)" />
          <stop offset=".2" stopColor="rgba(127,209,217,.18)" />
          <stop offset=".55" stopColor="rgba(6,26,35,.74)" />
          <stop offset=".84" stopColor="rgba(10,48,60,.5)" />
          <stop offset="1" stopColor="rgba(203,238,246,.32)" />
        </linearGradient>
        {/* 镜面高光：上亮下隐（玻璃的竖向拉丝） */}
        <linearGradient id={spec} x1="0" y1="40" x2="0" y2="204" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(243,249,250,.78)" />
          <stop offset=".55" stopColor="rgba(243,249,250,.34)" />
          <stop offset="1" stopColor="rgba(243,249,250,0)" />
        </linearGradient>
        {/* 软木塞：暖色受光面 → 珊瑚暗面（记录主题的唯一强调色只在暗部出现一点） */}
        <linearGradient id={cork} x1="33" y1="4" x2="55" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(246,215,154,.96)" />
          <stop offset=".46" stopColor="rgba(246,215,154,.78)" />
          <stop offset="1" stopColor="rgba(212,85,58,.5)" />
        </linearGradient>
        {/* 卷纸：纸白 → 暖黄（被玻璃里的光烤过） */}
        <linearGradient id={paper} x1="20" y1="136" x2="68" y2="176" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(243,249,250,.94)" />
          <stop offset=".62" stopColor="rgba(246,215,154,.72)" />
          <stop offset="1" stopColor="rgba(246,215,154,.44)" />
        </linearGradient>
        {/* 底部内阴影（沉在瓶底的暗） */}
        <linearGradient id={inner} x1="0" y1="150" x2="0" y2="212" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(2,8,12,0)" />
          <stop offset="1" stopColor="rgba(2,8,12,.62)" />
        </linearGradient>
        {/* 接触辉光：瓶子压在水皮上的一圈回光 */}
        <radialGradient id={glow} cx="44" cy="212" r="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="rgba(127,209,217,.36)" />
          <stop offset="1" stopColor="rgba(127,209,217,0)" />
        </radialGradient>
        <clipPath id={clip}>
          <path d={BOTTLE_PATH} />
        </clipPath>
        <filter id={shadow} x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="rgba(2,8,12,.55)" />
        </filter>
      </defs>

      {/* 瓶底的接触辉光（最底一层） */}
      <ellipse data-part="vessel-glow" cx="44" cy="212" rx="34" ry="7" fill={`url(#${glow})`} />

      <g filter={`url(#${shadow})`}>
        {/* 瓶身曲线剪影（玻璃本体） */}
        <path data-part="vessel-body" d={BOTTLE_PATH} fill={`url(#${glass})`} />

        {/* 瓶底内阴影 + 一点点沉水的暗（裁在剪影里） */}
        <g clipPath={`url(#${clip})`}>
          <rect data-part="vessel-inner-shade" x="0" y="150" width="88" height="62" fill={`url(#${inner})`} />
          {/* 折射的水纹：一道浅弧（玻璃里的光被水皮折了一下） */}
          <path
            d="M12 186 q14 -7 28 0 t28 0"
            fill="none"
            stroke="rgba(203,238,246,.3)"
            strokeWidth="1.2"
          />
        </g>

        {/* 发丝描边（record-v1 hairline） */}
        <path data-part="vessel-rim" d={BOTTLE_PATH} fill="none" stroke="rgba(203,238,246,.62)" strokeWidth="1.25" />
        <path d={BOTTLE_PATH} fill="none" stroke="rgba(3,17,23,.34)" strokeWidth="3.5" opacity=".35" transform="translate(1.5 1.5)" />

        {/* 卷纸：纸面 + 字迹 + 珊瑚系绳（微微侧转，像随手卷起来塞进去的） */}
        <g data-part="vessel-scroll" transform="rotate(-6 44 156)">
          <rect x="20" y="136" width="48" height="40" rx="4" fill={`url(#${paper})`} stroke="rgba(243,249,250,.6)" strokeWidth="1" />
          {/* 卷起的上下缘（纸有厚度） */}
          <path d="M20 141 q24 -6 48 0" fill="none" stroke="rgba(246,215,154,.72)" strokeWidth="1.4" />
          <path d="M20 171 q24 6 48 0" fill="none" stroke="rgba(10,48,60,.34)" strokeWidth="1.4" />
          <g data-part="vessel-scroll-ink">
            <rect x="27" y="149" width="34" height="2.4" rx="1.2" fill="rgba(10,48,60,.6)" />
            <rect x="27" y="156" width="27" height="2.4" rx="1.2" fill="rgba(10,48,60,.46)" />
            <rect x="27" y="163" width="31" height="2.4" rx="1.2" fill="rgba(10,48,60,.34)" />
          </g>
          <g data-part="vessel-scroll-thread">
            <rect x="41.5" y="134" width="3" height="44" rx="1.5" fill="rgba(212,85,58,.88)" />
            <circle cx="46.5" cy="176" r="3.2" fill="rgba(212,85,58,.92)" />
            <circle cx="46.5" cy="176" r="1.2" fill="rgba(246,215,154,.7)" />
          </g>
        </g>

        {/* 软木塞：木纹 + 顶面高光（塞进颈口里一截） */}
        <g data-part="vessel-cork">
          <rect x="33" y="4" width="22" height="32" rx="4" fill={`url(#${cork})`} />
          <rect x="34" y="5" width="20" height="5" rx="2.5" fill="rgba(243,249,250,.32)" />
          <path d="M38 10 v22 M44 8 v24 M50 11 v21" stroke="rgba(10,48,60,.3)" strokeWidth="1" />
          <rect x="33" y="27" width="22" height="2" fill="rgba(10,48,60,.34)" />
        </g>

        {/* 唇口（瓶颈环） */}
        <rect data-part="vessel-lip" x="29" y="21" width="30" height="9" rx="3" fill="rgba(216,243,246,.58)" stroke="rgba(203,238,246,.55)" strokeWidth="1" />

        {/* 高光三道：颈 / 左长条镜面 / 右细反光（玻璃通透感的来源） */}
        <g data-part="vessel-highlight">
          <path d="M40 36 v24" stroke={`url(#${spec})`} strokeWidth="3" strokeLinecap="round" />
          <path d="M15 122 C14 152 16 180 21 197" stroke={`url(#${spec})`} strokeWidth="5" strokeLinecap="round" />
          <path d="M73 126 v58" stroke="rgba(243,249,250,.3)" strokeWidth="2" strokeLinecap="round" />
          <path d="M24 98 C32 88 56 88 64 98" stroke="rgba(243,249,250,.22)" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}
