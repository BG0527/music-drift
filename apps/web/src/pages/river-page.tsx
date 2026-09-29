/**
 * 河道（`/river`；`/` 是它的旧入口，已规范化，见 `routes.ts` 的 `canonicalHref`）= 全站门面。
 *
 * ## 本轮：按定稿 `docs/ui-review/design-explore/f4-groove.html` 逐块落地
 * 唯一值源是块清单 `docs/review-river-blocks.md`（逐字文案 / SVG 参数 / 排版参数 / 差异预读）。
 * 稿是 1440×900 固定画布，这里是同一套语言的**流式重排** —— 允许的唯一翻译 =
 * 固定 px → 流体（1440 基准半径/沟距 ÷14.4 → vw；圆心 (1420,960) → 98.61% 106.67%）。
 * 色值纪律：**源码禁 hex** —— 旧珊瑚一律 `var(--color-coral)`，稿的叠层参数用 rgba 原样落地。
 *
 * 块序（稿 = 页面）：
 *  - B1 背景五层（稿 §5：底 `platter/body`、面 `center` 与 `field>i`、光 `light`）+ B2 唱片表面 SVG
 *    （稿 §4：圆族 / 河道 r900 六层水槽 / 擦痕弧 / 尘点 / 转向箭头「顺槽 · 33⅓」）——
 *    一个 `aria-hidden` 的 backdrop 宿主（`pointer-events-none absolute inset-0 z-0`，零信息零高度）；
 *  - B3 左上标题（cat 带 `· 0001` / h1 84px 档 / 副标题两行逐字）；
 *  - B4 右上信息（33⅓ + `RPM · 匿名接力` + 两行说明；稿右上没有「参与记录」链接 ⇒ 删）；
 *  - B5/B6 两枚**错落不等**的圆盘泊位（捞取 190×190 / 投下 150×150，固定 px → clamp 流体；
 *    captain 裁决：不再共用同一份尺寸定义，「等权」由同结构 + 同三圈外环 + 同盘身表达）；
 *  - B7 页脚 `<footer>`：心情 chips（aria-pressed 单选）+ 去公海链接。
 * 现页有稿无 ⇒ 删：波形带（CurrentLines h-48）、重试块（错误提示 + 重试出口）、右上「参与记录」链接。
 *
 * ## 必须存活的三件装置（本页测试「三件装置」一组盯着）
 * ① **被点亮的沟槽＝河道**：唱片 SVG 里 r900 一族的**六层水槽**（底槽 26 / 水面亮线 7 /
 *    下岸 887 / 上岸 913 / 两道错拍的水流虚线），挂在 `data-device="river"`；
 * ② 两枚错落圆盘泊位：盘身 `disc-core` **不填彩色**，冷/暖只在 `disc-edge-cool/warm` 与外环；
 * ③ **默认态没有漂流瓶**（用户第 ④ 条硬约束）：常驻层不出现瓶母题，瓶只在一次操作动效里现身。
 *
 * ## f0 三段分镜（`f0-sequence.html` + architecture §103.3，**本轮保留不动**）
 * 常驻装饰 `data-river-decor`（46s 漂移虚线 + 两圈错拍场景涟漪）仍在水体容器内；
 * 捞/投 = enter → ripple → exit 状态机，样式在 `river-motion.css`（只引用 `--motion-*` token）；
 * 动画播完再跳转，`prefers-reduced-motion` 下不起动画立即跳；同位 `aria-live` 文字状态全程可读。
 *
 * 契约：`DESIGN.md`（token）+ `docs/review-river-blocks.md`（稿参数）；机器守卫：本页测试。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import {
  BottleVessel,
  Ripple,
  RippleRing,
  cn,
  motion,
  prefersReducedMotion,
} from '../design-system';
import { toApiErrorView } from '../features/api/errors';
import { useDrawBottle, useInvalidateBottle } from '../features/api/mutations';
import { MoodChips } from '../features/bottle/mood-chips';
import { useSession } from '../features/session/session-context';
import { Link } from './shell/router';
import { useNavigate } from './shell/router-context';
import { interceptTarget } from './shell/routes';
import { TEXT_LINK } from './shell/link-styles';
import './river-motion.css';

/**
 * 两枚泊位**各自一份尺寸**（稿 §4.8：捞取 190×190、投下 150×150 —— 错落，小一档且更靠下；
 * captain 裁决：不再共用同一份尺寸定义）。固定 px → 流体：`clamp(下限, 1440 基准 vw, 稿值)`。
 * 焦点/边界装置**故意留在各自元素上**：`deep-surface-cta.test.ts` 要读到真实的 class。
 */
const PORT_DRAW_SIZE = 'h-[clamp(88px,13.194vw,190px)] w-[clamp(88px,13.194vw,190px)] rounded-full';
const PORT_CAST_SIZE = 'h-[clamp(72px,10.417vw,150px)] w-[clamp(72px,10.417vw,150px)] rounded-full';

/** 泊位盘身 + 3 圈外环（外环位移 13 / 29 / 45px 由 `--motif-ring-*` 定，页面不写死）。 */
function PortRings() {
  return (
    <>
      <span aria-hidden="true" data-ring="" className="disc-ring absolute" />
      <span aria-hidden="true" data-ring="" className="disc-ring-2 absolute" />
      <span aria-hidden="true" data-ring="" className="disc-ring-3 absolute" />
    </>
  );
}

/* ── B1 背景五层（稿 §5）──────────────────────────────────────────────────────
   稿的固定画布 px → 流体：圆心 (1420px, 960px) = 98.61% 106.67%（与设计系统 `.platter`
   同一口径），半径/沟距/遮罩一律 ÷14.4 → vw（1440 基准，整张盘等比缩放）。
   两档沟距：中心区 11px → 0.764vw（约 35 条沟的录音区）、外圈 land 4.4px → 0.306vw。 */
const RECORD_ORIGIN = 'circle at 98.61% 106.67%';

/** ① 底 · 台面：贴外缘的接触阴影（1276/1285/1366）+ 台面抬 2.2% 的底色。 */
const PLATTER_LAYER: CSSProperties = {
  opacity: 1,
  backgroundColor: 'rgba(127,209,217,0.022)',
  backgroundImage: `radial-gradient(${RECORD_ORIGIN}, transparent 0 88.611vw, rgba(2,9,13,0.52) 89.236vw, transparent 94.861vw)`,
};

/** ① 底 · 盘身：比台面亮一档（1210 → 1330）。 */
const BODY_LAYER: CSSProperties = {
  backgroundImage: `radial-gradient(${RECORD_ORIGIN}, rgba(127,209,217,0.055) 0 84.028vw, transparent 92.361vw)`,
};

/** ② 面 · 录音区：11px 档沟距（0.764vw）；遮罩只放行 340–790（23.611–54.861vw）那段圈。 */
const CENTER_LAYER: CSSProperties = {
  backgroundImage: `repeating-radial-gradient(${RECORD_ORIGIN}, rgba(216,243,246,0.07) 0 1.25px, transparent 1.25px 0.764vw)`,
  maskImage: `radial-gradient(${RECORD_ORIGIN}, transparent 0 23.611vw, white 27.778vw, white 54.861vw, transparent 61.111vw)`,
};

/** ② 面 · 外圈 land：遮罩只放行 930–1258（64.583–87.361vw）；830–930 是无沟 land，河道 r900 恰落其中。 */
const FIELD_LAYER: CSSProperties = {
  maskImage: `radial-gradient(${RECORD_ORIGIN}, transparent 0 64.583vw, white 68.75vw, white 87.361vw, transparent 90.278vw)`,
};

/** ② 面 · `field > i`：4.4px 档沟距（0.306vw）+ 按左上角衰减（字角安静）。 */
const FIELD_GROOVE_LAYER: CSSProperties = {
  backgroundImage: `repeating-radial-gradient(${RECORD_ORIGIN}, rgba(214,241,247,0.03) 0 1px, transparent 1px 0.306vw)`,
  maskImage: 'radial-gradient(circle at 0 0, transparent 0 23.611vw, white 56.944vw)',
};

/** ③ 光 · 掠光：环光（r980–1140）+ 101° 灯带（53%→55% 陡降 = 灯管被盘面切断的硬边）；screen 混合。 */
const LIGHT_LAYER: CSSProperties = {
  mixBlendMode: 'screen',
  backgroundImage: [
    `radial-gradient(${RECORD_ORIGIN}, transparent 0 68.056vw, rgba(210,240,246,0.034) 73.611vw, transparent 79.167vw)`,
    'linear-gradient(101deg, transparent 26%, rgba(210,240,246,0.03) 40%, rgba(210,240,246,0.058) 50%, rgba(210,240,246,0.05) 53%, rgba(210,240,246,0.012) 55%, rgba(210,240,246,0.006) 62%, transparent 74%)',
  ].join(', '),
  maskImage: `radial-gradient(${RECORD_ORIGIN}, white 0 87.361vw, transparent 90.278vw)`,
};

/** f0 三段的舞台：瓶子只在**一次操作**里出现（enter → ripple → exit），默认态没有它。 */
type FlowKind = 'draw' | 'cast';
type FlowStage = 'enter' | 'ripple' | 'exit';
interface FlowState {
  kind: FlowKind;
  stage: FlowStage;
}

/** 各段时长 = tokens.ts 的动效契约（`--motion-*` 的 JS 镜像）：入场 480 / 涟漪 2400 / 退场 240。 */
const STAGE_DURATION: Record<FlowStage, number> = {
  enter: motion.entryDuration,
  ripple: motion.rippleDuration,
  exit: motion.exitDuration,
};

/**
 * 分镜里的那只瓶子（t6 重绘：`design-system/BottleVessel` —— 瓶体曲线 / 软木塞 /
 * 卷纸与系绳 / 高光与发丝描边 / 接触辉光，取代原先 18×54 的占位矩形）。
 * 纯装饰（外层 `aria-hidden`）：色值一律 rgba 或 `var(--color-*)`，不写 hex。
 * 它**只在一次操作的动效里**出现（守卫③盯着），位移/淡入由 `river-motion.css` 承担。
 */
function FlowVessel() {
  return <BottleVessel size={56} />;
}

export function RiverPage() {
  const draw = useDrawBottle();
  const invalidate = useInvalidateBottle();
  const navigate = useNavigate();
  const session = useSession();
  const newHref =
    session.status === 'authed' ? '/new' : `/login?next=${encodeURIComponent('/new')}`;

  /** f0 三段状态机：瓶子只在一次操作里出现（null = 常驻态，只有水在流）。 */
  const [flow, setFlow] = useState<FlowState | null>(null);
  /** 同位 `aria-live` 文字状态（f0①-03：动效不是唯一反馈；§103.3：动画期间必须有可读状态）。 */
  const [drawStatus, setDrawStatus] = useState<string | null>(null);
  const [castStatus, setCastStatus] = useState<string | null>(null);
  const flowRef = useRef<FlowState | null>(null);
  /** 动画还没播完时先记下要去的地址；`finishFlow` 播完才真正跳（§103.3 用户裁决）。 */
  const pendingNavRef = useRef<string | null>(null);
  /** 同一拍内的重复点击（mutation 状态还没回到 React）挡在 ref 层。 */
  const busyRef = useRef(false);

  /** 稿无重试块：失败只给同位 aria-live 状态 + 这一块只读 alert（可读文案来自契约层）。 */
  const errorView = draw.isError ? toApiErrorView(draw.error) : null;

  const startFlow = (kind: FlowKind): void => {
    const next: FlowState = { kind, stage: 'enter' };
    flowRef.current = next;
    setFlow(next);
  };

  /** 三段播完：清舞台 + 补上被推迟的导航（reduced-motion 下这里通常没有待跳地址）。 */
  const finishFlow = useCallback(() => {
    flowRef.current = null;
    setFlow(null);
    const to = pendingNavRef.current;
    if (to !== null) {
      pendingNavRef.current = null;
      navigate(to);
    }
  }, [navigate]);

  const requestNav = (to: string): void => {
    // reduced-motion / 动画已播完：立即走（§103.3 兜底）；否则挂起等 finishFlow。
    if (flowRef.current === null) navigate(to);
    else pendingNavRef.current = to;
  };

  /**
   * 每段结束推进下一段；卸载/换段时清理计时器 —— 组件卸载后不再 setState。
   * 时长来自 STAGE_DURATION（= `--motion-*` 契约），不是这里拍脑袋的数字。
   */
  useEffect(() => {
    if (flow === null) return undefined;
    const timer = window.setTimeout(() => {
      if (flow.stage === 'exit') finishFlow();
      else setFlow({ kind: flow.kind, stage: flow.stage === 'enter' ? 'ripple' : 'exit' });
    }, STAGE_DURATION[flow.stage]);
    return () => window.clearTimeout(timer);
  }, [flow, finishFlow]);

  function onDraw(): void {
    if (busyRef.current) return;
    busyRef.current = true;
    pendingNavRef.current = null;
    setDrawStatus('正在打捞…');
    if (prefersReducedMotion()) {
      // reduce：不起动画、只留文字状态，成功后 requestNav 立即跳（§103.3 回归守卫）。
      flowRef.current = null;
      setFlow(null);
    } else {
      startFlow('draw');
    }
    // mutation 时序沿用原样：点击才发请求，点击前不预生成任何东西。
    void draw
      .mutateAsync()
      .then(async (response) => {
        await invalidate(response.bottle.id);
        setDrawStatus('捞到了，正在打开…');
        requestNav(`/bottles/${response.bottle.id}`);
      })
      .catch(() => {
        setDrawStatus('打捞失败，请看下面的说明。');
        // 失败没有「捞起」可确认 ⇒ 跳过收拢涟漪段，瓶子直接退场（feedback 不得说谎）。
        const current = flowRef.current;
        if (current?.kind === 'draw' && current.stage !== 'exit') {
          const exit: FlowState = { kind: 'draw', stage: 'exit' };
          flowRef.current = exit;
          setFlow(exit);
        }
      })
      .finally(() => {
        busyRef.current = false;
      });
  }

  function onCast(event: ReactMouseEvent<HTMLAnchorElement>): void {
    // `Link` 的 `{...rest}` 会覆盖它内部的 onClick —— 这里接管整条投下路径：
    // 先用与 `Link` 同一个 interceptTarget 判定「普通站内左键点击」，
    // 是 → preventDefault + f0③ 动画，播完（reduce 则立即）再 navigate（去向与原来完全一致）。
    const path = interceptTarget(event, { href: newHref, target: null, download: false });
    if (path === null) return;
    event.preventDefault();
    if (flowRef.current !== null) return;
    setCastStatus('瓶子落水了，正顺河而下…');
    if (prefersReducedMotion()) {
      navigate(path);
      return;
    }
    pendingNavRef.current = path;
    startFlow('cast');
  }

  return (
    // 页面自带 <main>（外壳不渲染，且外壳不给 padding ⇒ main 贴视口宽全出血，
    // 不得再写负外边距：-mx-6/md:-mx-12 曾把 scrollWidth 撑成 1488>1440 / 399>375）。
    // 唱片出血由 backdrop 的 absolute inset-0 承担；正文边距是 header/section/footer 各自的 px-6。
    // md+：一屏绝对定位（基准 river.css html/body overflow:hidden 同思路）——
    // 固定视口高 + 溢出裁切，header/页脚/错误块/泊位全部锚视口，内容永不把页面撑高。
    <main className="relative isolate flex min-h-[100dvh] flex-col gap-6 md:h-[100dvh] md:overflow-hidden">
      {/* ── B1 背景五层 + B2 唱片表面 SVG（稿 §5/§4）───────────────────────────
          一比一 v2：backdrop 与泊位共用**同一个 cover 场景几何**（art 恒 1440:900：
          宽=max(scene, H×1.6)、高=max(scene, W/1.6)，居中裁切）——
          SVG 与泊位从此同一坐标系，任何视口宽度都逐像素咬合（旧版 xMaxYMax 裁切 + 泊位挂
          river-body 局部 % ⇒ 两套坐标，宽屏下弧线与按钮必然脱节）。
          纯装饰：aria-hidden、pointer-events-none、绝对定位零布局高度。 */}
      <div
        aria-hidden="true"
        data-river-backdrop=""
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <div
          data-river-art=""
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: 'max(100%, calc(100dvh * 1.6))',
            height: 'max(100%, calc(100vw / 1.6))',
          }}
        >
        {/* ① 底：台面接触阴影 + 盘身亮一档 */}
        <div className="platter absolute inset-0" style={PLATTER_LAYER} />
        <div className="body absolute inset-0" style={BODY_LAYER} />
        {/* ② 面：两档沟距的同心纹理（遮罩分段 = 录音区 / 外圈 land / 左上角安静） */}
        <div className="center absolute inset-0" style={CENTER_LAYER} />
        <div className="field absolute inset-0" style={FIELD_LAYER}>
          <i className="absolute inset-0 block" style={FIELD_GROOVE_LAYER} />
        </div>
        {/* ③ 光：掠光（screen 混合，灯带 53%→55% 陡降 = 灯管被盘面切断的硬边） */}
        <div className="light absolute inset-0" style={LIGHT_LAYER} />

        {/* ── B2 唱片表面 SVG（稿 §4 全参数；画布 1440×900，viewBox 等比流体）────
            圆族圆心统一 (1420,960)（画布外右下）；装饰无交互，一整块 aria-hidden。 */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMaxYMax slice"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            {/* sheen：右下角的玻璃青掠光 */}
            <radialGradient id="river-sheen" cx="0.99" cy="1" r="0.42">
              <stop offset="0" style={{ stopColor: 'var(--color-glass)' }} stopOpacity={0.06} />
              <stop offset="0.4" style={{ stopColor: 'var(--color-glass)' }} stopOpacity={0} />
            </radialGradient>
            {/* label：平的纸标签（珊瑚 19% 平铺到 97%，不再填渐变） */}
            <radialGradient id="river-label" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0.97" style={{ stopColor: 'var(--color-coral)' }} stopOpacity={0.19} />
              <stop offset="1" style={{ stopColor: 'var(--color-coral)' }} stopOpacity={0} />
            </radialGradient>
            {/* rim：下半圈亮、上半圈隐的外缘 */}
            <linearGradient id="river-rim" gradientUnits="userSpaceOnUse" x1={0} y1={800} x2={0} y2={330}>
              <stop offset="0" stopColor="rgb(230,248,251)" stopOpacity={0.5} />
              <stop offset="0.5" stopColor="rgb(230,248,251)" stopOpacity={0.17} />
              <stop offset="1" stopColor="rgb(230,248,251)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <rect width={1440} height={900} fill="url(#river-sheen)" />

          {/* 标签盘面 + 硬边内圈 + 纸白外沿（稿 §4.2 前三行） */}
          <circle cx={1420} cy={960} r={268} fill="url(#river-label)" />
          <circle cx={1420} cy={960} r={262} fill="none" stroke="var(--color-coral)" strokeOpacity={0.52} strokeWidth={1.6} />
          <circle cx={1420} cy={960} r={275} fill="none" stroke="var(--color-paper)" strokeOpacity={0.2} strokeWidth={1} />
          {/* 录音区外界 lead-out（262–336 = 无沟平滑留白） */}
          <circle cx={1420} cy={960} r={336} fill="none" stroke="rgba(214,241,247,0.13)" strokeWidth={1} />
          {/* 外缘 rim + 倒角内线（14px 内补一条，双线 = 车削边唇） */}
          <circle cx={1420} cy={960} r={1276} fill="none" stroke="url(#river-rim)" strokeWidth={2} />
          <circle cx={1420} cy={960} r={1268} fill="none" stroke="rgba(214,241,247,0.14)" strokeWidth={1} />

          {/* ── 河道（稿 §4.3）：被点亮的沟槽 = r900 一族的**六层水槽**
              底槽(26) / 水面亮线(7) / 下岸(887) / 上岸(913) / 水流虚线 A(r900) / 虚线 B(r906)。
              830–930 是无沟 land，r900 恰落其中 ⇒ 河道不长在纹理上，是单独一条水槽。 */}
          <g data-device="river" fill="none">
            <circle cx={1420} cy={960} r={900} stroke="rgba(42,157,177,0.2)" strokeWidth={26} />
            <circle cx={1420} cy={960} r={900} stroke="rgba(159,230,237,0.42)" strokeWidth={7} />
            <circle cx={1420} cy={960} r={887} stroke="rgba(216,243,246,0.5)" strokeWidth={1.4} />
            <circle cx={1420} cy={960} r={913} stroke="rgba(216,243,246,0.44)" strokeWidth={1.4} />
            <circle cx={1420} cy={960} r={900} stroke="rgba(243,249,250,0.42)" strokeWidth={2} strokeDasharray="16 30" strokeLinecap="round" />
            <circle cx={1420} cy={960} r={906} stroke="rgba(243,249,250,0.2)" strokeWidth={1.6} strokeDasharray="10 40" strokeLinecap="round" />
          </g>

          {/* 擦痕弧（稿 §4.4）：顺槽方向的短弧，butt 端点，一条 dash 画一道 */}
          <g fill="none" stroke="rgb(230,247,251)" strokeLinecap="butt">
            <circle cx={1420} cy={960} r={1180} strokeWidth={1.1} strokeOpacity={0.17} strokeDasharray="126 9999" strokeDashoffset={-4120} />
            <circle cx={1420} cy={960} r={1214} strokeWidth={1} strokeOpacity={0.12} strokeDasharray="92 9999" strokeDashoffset={-4460} />
            <circle cx={1420} cy={960} r={1128} strokeWidth={1.2} strokeOpacity={0.14} strokeDasharray="158 9999" strokeDashoffset={-3700} />
            <circle cx={1420} cy={960} r={1246} strokeWidth={1} strokeOpacity={0.1} strokeDasharray="70 9999" strokeDashoffset={-4830} />
          </g>

          {/* 尘点（稿 §4.5）：4 颗聚一撮 */}
          <g fill="var(--color-foam)">
            <circle cx={556} cy={700} r={1.5} fillOpacity={0.26} />
            <circle cx={578} cy={712} r={1.1} fillOpacity={0.2} />
            <circle cx={540} cy={716} r={1.2} fillOpacity={0.22} />
            <circle cx={592} cy={698} r={1} fillOpacity={0.16} />
          </g>

          {/* 转向箭头（稿 §4.6）：河在往哪边流 */}
          <g opacity={0.8} fill="none" stroke="var(--color-coral)" strokeWidth={2} strokeLinecap="round">
            <path d="M1296 700 Q 1366 640 1442 674" strokeOpacity={0.55} />
            <path d="M1442 674 l -6 -15 l -15 6" strokeOpacity={0.55} />
          </g>
          <text
            x={1146}
            y={712}
            fill="var(--color-coral)"
            fillOpacity={0.62}
            fontFamily="ui-monospace, Consolas, monospace"
            fontSize={10}
            letterSpacing="1.6"
          >
            顺槽 · 33⅓
          </text>
        </svg>
        </div>
      </div>

      {/* ── B3/B4 岸（水线以上）：标题立在被压暗的盘面上 ─────────────────────── */}
      {/* md+：标题区锚视口一屏（基准 river.css .ov top:max(10.67%,--top-nav-h) 同思路；
          54px = 顶栏 top-10px + min-h-11(44px)，矮窗时标题让位顶栏；<md 用 64px 顶避让同理） */}
      <header className="relative z-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-6 pt-[64px] md:absolute md:inset-x-0 md:top-[max(10.67%,54px)] md:px-12 md:pt-0">
        {/* B3 左上：cat（带编号）→ h1（84px 档）→ 副标题两行（逐字照稿）
            t3 入场编排（continuity/guidance）：标题块先落位，RPM 块错拍 1 档跟上；
            参数全部经契约类（enter-rise / stagger-*，值在 motion.css 的 --motion-* token 上） */}
        <div className="enter-rise flex min-w-0 flex-col gap-2">
          <p className="font-latin text-[0.6875rem] tracking-[0.24em] text-paper/50">
            音乐共创 · 匿名接力 · 0001
          </p>
          <h1 id="river-title" className="text-[clamp(2.5rem,6vw,5.25rem)] font-bold leading-none text-paper">
            暖流河道
          </h1>
          <p className="text-[0.96875rem] leading-[1.9] text-muted">
            一条沟槽就是一条河。
            <br />
            唱一段，让它顺水去找下一个陌生人。
          </p>
        </div>
        {/* B4 右上：33⅓ → RPM · 匿名接力 → 两行说明（稿右上没有「参与记录」链接） */}
        {/* B4 右上：33⅓ → RPM · 匿名接力 → 两行说明（稿右上没有「参与记录」链接）。
            md:mt-4 = 基准 RPM 落点 12.44% − 标题 10.67% ≈ 16px@900（两块同排的基准高差） */}
        <div className="enter-rise stagger-1 flex flex-col items-start gap-2 md:mt-4 md:items-end md:text-right">
          {/* 26px = 字号阶梯的 h1 档（稿 .rpm 也是 26px，色 = --glass） */}
          <span className="font-latin text-[1.625rem] leading-none text-glass">33⅓</span>
          <p className="font-latin text-[0.6875rem] tracking-[0.24em] text-paper/50">
            RPM · 匿名接力
          </p>
          <p className="text-[0.6875rem] leading-[2] tracking-[0.06em] text-paper/[0.82]">
            唱一段，投进河里，让陌生人接棒
            <br />
            四段齐了入海，成为公共作品
          </p>
        </div>
      </header>

      {/* ── 水线以下：一整片水（水面光 / 水纹 / 水下光柱 / 常驻装饰）────────────
          两个泊位骑在这条河上 —— 它们**没有各自的背景、边框与阴影**，浮在同一片水上，
          这是"同一条河上的两个位置"的关键（`DESIGN.md` §Composition）。 */}
      {/* md+：水体容器锚满视口（inset-0、无 padding）⇒ 泊位/说明的 % = 视口 %（基准补丁口径） */}
      <section
        aria-labelledby="river-title"
        className="river-body relative isolate overflow-hidden bg-none px-6 pb-6 pt-16 md:absolute md:inset-0 md:p-0"
      >
        {/* 一比一复刻 v2（用户看图打回）：稿的下半是**纯暗盘面** ⇒ 上一版保留的
            WaterSheen / WaterTexture / LightShafts 与 .river-body 自带的 gradient-river
            大色块全部退场（bg-none 盖掉 DS 里的底），水感只由 backdrop 五层承担。 */}

        {/* ── f0① 常驻态「只有水在流」：两圈错拍的场景涟漪。
            装饰零信息 —— aria-hidden、pointer-events-none、绝对定位零布局高度。 */}
        <div aria-hidden="true" data-river-decor="" className="pointer-events-none absolute inset-0">
          <span className="absolute bottom-[20px] left-[30%] h-[56px] w-[160px]">
            <RippleRing />
          </span>
          <span className="absolute bottom-[12px] right-[24%] h-[34px] w-[96px]">
            <RippleRing className="river-scene-delay" />
          </span>
        </div>


        {/* ── f0②③ 操作动效：瓶子**只在一次操作里出现**（常驻态没有它，守卫③盯着）。 */}
        {flow !== null ? (
          <div
            aria-hidden="true"
            data-vessel-anchor=""
            className="pointer-events-none absolute left-1/2 top-[102px] md:top-[151px]"
          >
            <span className="absolute -translate-x-1/2 -translate-y-1/2">
              <span
                data-vessel=""
                className={cn(
                  'block',
                  flow.kind === 'draw' && flow.stage === 'enter' && 'river-vessel-enter-draw',
                  flow.kind === 'draw' && flow.stage === 'ripple' && 'river-vessel-hold',
                  flow.kind === 'draw' && flow.stage === 'exit' && 'river-vessel-exit-draw',
                  flow.kind === 'cast' && flow.stage === 'enter' && 'river-vessel-enter-cast',
                  flow.kind === 'cast' && flow.stage === 'ripple' && 'river-vessel-hold',
                  flow.kind === 'cast' && flow.stage === 'exit' && 'river-vessel-exit-cast',
                )}
              >
                <FlowVessel />
              </span>
            </span>
            {flow.stage === 'ripple' ? (
              /* 收拢涟漪 = feedback / confirmation，与瓶子同位、只播一次（iteration 在 CSS 里 = 1） */
              <span
                data-gather=""
                className="absolute left-1/2 top-0 h-[100px] w-[300px] -translate-x-1/2 -translate-y-1/2"
              >
                <span className="river-gather absolute inset-0 block">
                  <Ripple className="inset-0" />
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        {/* t2 锚视口（基准 river.css 补丁口径）：cover 场景盒退场 —— md:contents 让两枚泊位
            直接以 river-body（md: absolute inset-0 = 视口）为 containing block，% 即视口 %，
            宽扁视口不再有「盒高于视口」的溢出；<md 维持流式单列。 */}
        <div className="relative z-10 grid gap-4 md:contents">
          {/* B5 · 下游 · 捞取（稿画布 60,400 → 4.1667%,44.444%；190×190） */}
          <section
            data-anchor="river-draw"
            aria-labelledby="draw-heading"
            className="flex items-start gap-4 md:absolute md:left-[4.1667%] md:top-[44.444%] md:pointer-events-auto md:gap-6 enter-rise stagger-2"
          >
            <div data-port="draw" className={cn(PORT_DRAW_SIZE, 'relative shrink-0')}>
              <PortRings />
              {/* 盘身用本地元素而不是设计系统的 `Button`：`Button` 的基类会填一层彩色底
                  （`bg-*`），而 `cn()` 不做冲突合并 —— 泊位的盘身必须是 `disc-core`（不填彩色）。 */}
              <button
                type="button"
                aria-label="捞一个漂流瓶"
                className={cn(
                  'focus-visible:ring-offset-deep-current absolute inset-0 z-10 flex items-center justify-center rounded-full ring-2 ring-foam',
                  'focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2',
                  'transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                  'motion-safe:hover:scale-[var(--motion-hover-scale)] motion-safe:active:translate-y-[-1px]',
                  // 打捞中：按钮不可点，且必须与可用态有**形态差异**（DESIGN.md §Interaction States）
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                aria-busy={draw.isPending ? true : undefined}
                disabled={draw.isPending || flow?.kind === 'draw'}
                onClick={onDraw}
              >
                <span aria-hidden="true" className="disc-core absolute inset-0 rounded-full" />
                <span aria-hidden="true" className="disc-edge-cool absolute inset-0 rounded-full" />
                <span className="relative flex flex-col items-center gap-[3px]">
                  <span className="text-[clamp(1rem,1.39vw,1.25rem)] font-bold tracking-[0.12em]">
                    捞取
                  </span>
                  <span lang="en" className="font-latin text-[0.625rem] font-normal tracking-[0.28em] opacity-70">
                    DRAW
                  </span>
                </span>
              </button>
            </div>

            {/* B5 cap（基准补丁：相对盘 left 121% / top 21%，随泊位半径缩放；标题即 section 的 h2） */}
            <div data-cap="draw" className="flex min-w-0 flex-col gap-[6px] md:absolute md:left-[121%] md:top-[21%] md:w-[clamp(200px,16.667vw,240px)]">
              <h2 id="draw-heading" className="block text-[0.9375rem] font-normal text-paper">捞一个漂流瓶</h2>
              <p className="text-[0.78125rem] leading-[1.75] text-muted">
                捞到别人的半句，接下一句。捞到即持有：同一时刻只有你拿着它。
              </p>
              {/* 同位 aria-live 状态（f0①-03）：待 → 成功 / 失败都在这一格里换字，
                  动效永远不是唯一反馈。 */}
              {drawStatus !== null ? (
                <p role="status" aria-live="polite" className="enter-fade text-[0.9375rem] font-semibold text-paper">
                  {drawStatus}
                </p>
              ) : null}
            </div>
          </section>

          {/* B6 · 上游 · 投下（基准补丁：视口 26.39%,60% —— 稿 64.444% 被补丁裁到 60%；150²） */}
          <section
            data-anchor="river-drop"
            aria-labelledby="cast-heading"
            className="mt-4 md:mt-0 flex flex-row-reverse items-start gap-4 md:absolute md:left-[26.389%] md:top-[60%] md:pointer-events-auto md:gap-6 enter-rise stagger-3"
          >
            <div data-port="cast" className={cn(PORT_CAST_SIZE, 'relative shrink-0')}>
              <PortRings />
              <Link
                to={newHref}
                aria-label="投下一支漂流瓶"
                className={cn(
                  'focus-visible:ring-offset-deep-current absolute inset-0 z-10 flex min-h-11 items-center justify-center rounded-full ring-2 ring-foam',
                  'focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2',
                  'transition-transform duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)]',
                  'motion-safe:hover:scale-[var(--motion-hover-scale)] motion-safe:active:translate-y-[-1px]',
                )}
                onClick={onCast}
              >
                <span aria-hidden="true" className="disc-core absolute inset-0 rounded-full" />
                <span aria-hidden="true" className="disc-edge-warm absolute inset-0 rounded-full" />
                <span className="relative flex flex-col items-center gap-[3px]">
                  <span className="text-[clamp(1rem,1.39vw,1.25rem)] font-bold tracking-[0.12em]">
                    投下
                  </span>
                  <span lang="en" className="font-latin text-[0.625rem] font-normal tracking-[0.28em] opacity-70">
                    CAST
                  </span>
                </span>
              </Link>
            </div>

            {/* B6 cap（基准补丁：相对盘 left -120%（= 稿 -180/150）/ top 110%（= 稿 165/150），
                随泊位半径缩放 ⇒ 宽扁视口下沿不越界；标题即 section 的 h2） */}
            <div data-cap="cast" className="flex min-w-0 flex-col gap-[6px] md:absolute md:left-[-120%] md:top-[110%] md:w-[clamp(240px,20.833vw,300px)]">
              <h2 id="cast-heading" className="block text-[0.9375rem] font-normal text-paper">投下一支漂流瓶</h2>
              <p className="text-[0.78125rem] leading-[1.75] text-muted">
                选一首歌，录下第 1 段，投进河道，等一个陌生人接棒。
              </p>
              {castStatus !== null ? (
                <p role="status" aria-live="polite" className="enter-fade text-[0.9375rem] font-semibold text-paper">
                  {castStatus}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {/* 稿无重试块：失败只留这一块只读 alert + 上面的 aria-live（不再渲染带重试出口的错误提示）。 */}
      {errorView !== null ? (
        <div
          role="alert"
          className="enter-fade relative z-10 mx-6 flex max-w-[46rem] flex-col gap-1 rounded-base border border-warning-border bg-warning-tint px-4 py-4 text-warning md:absolute md:inset-x-0 md:bottom-[calc(3.33%_+_64px)] md:mx-12"
        >
          <p className="text-[0.9375rem] font-semibold">{errorView.title}</p>
          <p className="text-[0.875rem] leading-[1.6]">{errorView.detail}</p>
        </div>
      ) : null}

      {/* B7 页脚：心情 chips 停在岸上；出口链接右挂。
          md+ 锚视口底部（基准 footer bottom 3.33%），一屏布局不参与文档流。
          t3：enter-fade 只淡入不位移 —— 锚在视口底缘的元素零溢出风险（guidance：收尾落位）。 */}
      <footer className="enter-fade relative z-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-4 px-6 md:absolute md:inset-x-0 md:bottom-[3.33%] md:px-12">
        <MoodChips />
        <Link to="/sea" className={TEXT_LINK}>
          先去公海听听已经完成的作品
        </Link>
      </footer>
    </main>
  );
}
