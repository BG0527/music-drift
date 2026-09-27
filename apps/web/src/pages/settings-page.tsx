/**
 * 设置页 —— 装置：**折页 + 水线切开「匿名的边界」**（record-v1；`docs/impl-plan-record-v1.md` §5.1）。
 *
 * 装置要**承担信息**：这一页是一张**内袋说明书**（折页：一条折线分成两栏），
 * 一条**水线横切整张纸**，把「匿名的边界」三条切开 ——
 * **线上两条是别人看得到的**（独立代号 / 你只被看到代号与声音），
 * **线下一条是只有你自己知道的**（账号只用于认领）。
 * 右栏的瓶子与它的倒影骑在同一条水线上：水上是「代号」，水下是「账号」。
 *
 * 响应式重排的有意差异（写明白，不藏）：
 * - 375 折成一页：折线收起，右栏（伴奏与授权 / 关于 / 瓶）排到左栏之后。
 *   此时那条水线**不再横过右栏**，所以瓶与倒影这一组用水里的"镜面"惯例自己表达
 *   （镜像 + 降透明 + 「倒影 · 账号与邮箱」）—— 水线全页只允许一条，不在右栏另画第二条。
 *   **左栏那条水线在任何宽度都横切三条边界**（这一条不妥协）。
 * - DOM 顺序 = 375 的阅读顺序（左上 → 水线 → 线下那条 → 右栏 → 倒影 → 当前身份）；
 *   桌面用**显式网格落位**把右栏提到水线以上，因此两种顺序不会互相牵制。
 *
 * 只做三件事：匿名说明 / 登出 / 关于（契约版本 + 运行环境）。
 */
import { useState } from 'react';
import { CONTRACT_VERSION } from '@music-drift/shared';
import { useLibraryMetadata } from '../features/api/queries';
import { useLogout } from '../features/api/mutations';
import { LibraryAttribution } from '../features/audio';
import { useSession } from '../features/session/session-context';
import { BottleMark, Button, Glint, Icon, Modal, Waterline, WaterTexture } from '../design-system';
import { useNavigate } from './shell/router-context';

/** 折页封面上的元信息（Figma 帧原文）。 */
const SHEET_META = '内袋说明书 · INNER SLEEVE INSERT';

/** 设计稿 `h2.block`：17px / 700 / 1.3 + 1px 下边框 + 11px 内距（不是 19px/600）。 */
const H2 = 'text-[1.0625rem] font-bold leading-[1.3] text-paper border-b border-line/13 pb-[11px]';

/** 稿 §3 水线反光短划（left px / top px / width px，1440 画布逐值）。 */
const WLINE_DASHES: readonly (readonly [number, number, number])[] = [
  [148, -1, 30],
  [402, 1, 14],
  [640, -1, 44],
  [872, 1, 10],
  [1010, -1, 24],
  [1300, 1, 18],
];

/** 稿 §4 声波 7 根（x 起点 / 高度；底对齐 y=44）。 */
const WAVE_BARS: readonly (readonly [number, number])[] = [
  [57, 10],
  [64, 22],
  [71, 38],
  [78, 16],
  [85, 30],
  [92, 12],
  [99, 6],
];

export function SettingsPage() {
  const session = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  /**
   * 伴奏署名（CC BY 4.0）—— t13 的授权义务，挂在本页履行。
   *
   * 关键取舍：**署名不依赖这个查询**。作者 / 来源 / 许可名 / 许可链接是编译期常量，
   * 只有"逐首曲名"来自 `library.json`；元数据读不到时**照样渲染署名块**
   * （组件会自己说明"曲目列表暂时读不到"），绝不因为接口挂掉而不显示署名。
   */
  const library = useLibraryMetadata();
  const [attributionOpen, setAttributionOpen] = useState(false);

  return (
    <div className="relative isolate">
      {/* 稿 §1 页面级背景层（.clip 内、纸的后面）：水线 y=520 ≈ 57.8% 分界；全部装饰 aria-hidden */}
      <span
        aria-hidden="true"
        data-device="sheet-platter"
        className="pointer-events-none absolute inset-0 bg-[repeating-radial-gradient(circle_at_1420px_960px,rgba(216,243,246,.055)_0_1.2px,transparent_1.2px_6.5px)]"
      />
      <span
        aria-hidden="true"
        data-device="sheet-air"
        className="pointer-events-none absolute inset-x-0 top-0 h-[57.8%] bg-[linear-gradient(180deg,rgba(127,209,217,.085)_0%,rgba(127,209,217,.022)_58%,rgba(127,209,217,0)_100%)]"
      />
      <span
        aria-hidden="true"
        data-device="sheet-sea"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[57.8%] bg-[linear-gradient(180deg,rgba(5,24,32,.5)_0%,rgba(4,16,22,.7)_52%,rgba(3,12,17,.8)_100%)]"
      />
      <span
        aria-hidden="true"
        data-device="sheet-shaft"
        className="pointer-events-none absolute inset-x-0 top-[57.8%] h-[42.2%] bg-[linear-gradient(99deg,transparent_0%,rgba(127,209,217,.085)_44%,transparent_92%)]"
      />
      <span
        aria-hidden="true"
        data-device="sheet-grooves"
        className="pointer-events-none absolute inset-x-0 bottom-0 top-[57.8%] bg-[repeating-radial-gradient(circle_at_1420px_960px,rgba(216,243,246,.085)_0_1.2px,transparent_1.2px_6.5px)]"
      />
      <span
        aria-hidden="true"
        data-device="sheet-surf"
        className="pointer-events-none absolute inset-x-0 top-[57.8%] h-[30px] bg-[linear-gradient(180deg,rgba(127,209,217,.09),transparent)]"
      />

      {/* 折页本体：一张纸。`isolate` 是必须的 —— 纸上的水线与水纹都是 `z-underlay`，
          没有 isolate 它们会落到纸的背景之下而完全看不见。 */}
      <div className="relative isolate border border-paper/15 px-4 py-5 [clip-path:polygon(30px_0,100%_0,100%_100%,0_100%,0_30px)] md:px-8 md:py-6">
        <WaterTexture drift />
        <Glint />
        {/* 纸的两半（设计稿 .leaf-dry/.leaf-wet）：干半几乎不透（背后的盘看不见），
            湿半泡透了（沟槽从纸背透出来）；湿半上再叠一层水膜（.film：glass/.07→0）。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[58.8%] bg-water-bed/90"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[41.2%] bg-water-bed/45"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[41.2%] bg-gradient-to-b from-glass/[0.07] to-transparent"
        />

        {/* 折页：两栏之间的折线（桌面才有；375 折成一页） */}
        <span
          data-device="fold"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-line/13 md:block"
        />
        {/* 折页：左上角被撕掉一角（`clip-path` 在折页本体上），这里是那道撕口的亮边 */}
        <svg
          aria-hidden="true"
          viewBox="0 0 42 42"
          className="pointer-events-none absolute left-0 top-0 h-[30px] w-[30px] text-water-mid/40"
        >
          <path d="M0 30 L30 0" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>

        <div className="relative flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-x-10 md:gap-y-0">
          {/* 左上：说明书页头 + 「匿名的边界」的**线上两条** */}
          <section className="enter-fade flex flex-col gap-5 md:col-start-1 md:row-start-1">
            <header className="flex flex-col gap-2">
              <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">{SHEET_META}</p>
              <h1 className="text-[1.625rem] font-bold leading-none tracking-[0.01em] text-paper md:text-[3.625rem]">
                设置
              </h1>
              <p className="max-w-[500px] text-[0.90625rem] leading-[1.85] text-muted">
                这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。
              </p>
              {/* 稿 §5.1 .rule：导语后 1px 分隔线（mt26） */}
              <span aria-hidden="true" className="mt-[26px] h-px bg-line/13" />
            </header>

            <h2 className={H2}>匿名的边界</h2>
            <ol
              data-device="anonymous-above"
              className="mt-[14px] flex flex-col [&>li+li]:border-t [&>li+li]:border-paper/[0.08]"
            >
              <li className="flex gap-3 py-3 text-[0.8125rem] leading-[1.85] text-paper md:py-[17px] md:text-[0.96875rem]">
                <span aria-hidden="true" className="text-[0.875rem] text-water-mid/50">
                  一
                </span>
                <span>每支瓶子一个独立代号（同一瓶里大家看到的是同一个）</span>
              </li>
              <li className="flex gap-3 py-3 text-[0.8125rem] leading-[1.85] text-paper md:py-[17px] md:text-[0.96875rem]">
                <span aria-hidden="true" className="text-[0.875rem] text-water-mid/50">
                  二
                </span>
                <span>别人拿不到你的账号，只能看到代号与你的声音</span>
              </li>
            </ol>
          </section>

          {/* 水线：横切整张纸 —— 线上的两条别人看得到、线下的那一条只有你知道 */}
          <div className="md:col-span-2 md:row-start-2">
            <p className="flex items-center gap-2 text-[0.6875rem] tracking-[0.24em] text-water-mid/[0.62]">
              <span aria-hidden="true" className="h-px w-[10px] bg-water-mid/50" />
              <span>水面之上 · 别人看得到的</span>
            </p>
          <div data-device="anonymous-waterline" className="relative h-px">
            <Waterline className="top-0" />
            {/* 稿 §3：水线内嵌 6 条反光短划（left/top/width 逐值，按 1440 画布换算 %） */}
            {WLINE_DASHES.map(([left, top, width]) => (
              <i
                key={`wline-dash-${left}`}
                data-part="wline-dash"
                aria-hidden="true"
                className="absolute h-px bg-[rgba(228,247,252,.32)]"
                style={{ left: `${(left / 1440) * 100}%`, top, width }}
              />
            ))}
          </div>
            {/* 水渍：湿纸前沿从这条线往纸里走（纸的下半是泡在水里的） */}
            <span
              aria-hidden="true"
              className="pointer-events-none block h-[12px] w-full bg-gradient-to-b from-water-void/50 to-transparent"
            />
            <p className="mt-3 flex items-center gap-2 text-[0.6875rem] tracking-[0.24em] text-muted/70">
              <span aria-hidden="true" className="h-px w-[10px] bg-paper/[0.28]" />
              <span>水面之下 · 只有你自己知道的</span>
            </p>
          </div>

          {/* 左下：**线下那一条**（账号只用于认领） */}
          <ol
            data-device="anonymous-below"
            className="flex flex-col [&>li+li]:border-t [&>li+li]:border-paper/[0.08] md:col-start-1 md:row-start-3"
          >
            <li className="flex gap-3 py-3 text-[0.8125rem] leading-[1.85] text-paper md:py-[12px] md:text-[0.96875rem]">
              <span aria-hidden="true" className="text-[0.875rem] text-paper/[0.36]">
                三
              </span>
              <span>账号只用于认领你自己的漂流瓶与漂流日志。</span>
            </li>
          </ol>

          {/* 右上：伴奏与授权 + 关于，以及**水面之上**的瓶（别人看到的只是代号） */}
          <div className="flex flex-col gap-6 md:col-start-2 md:row-start-1 md:flex-row md:items-end md:justify-between md:gap-8">
            <div className="flex flex-col gap-6">
              <section
                className="enter-fade flex flex-col gap-3"
                aria-labelledby="attribution-heading"
              >
                <h2 id="attribution-heading" className={H2}>
                  伴奏与授权
                </h2>
                <p className="max-w-[36rem] text-[0.84375rem] leading-[1.8] text-muted">
                  曲库伴奏为 CC BY 4.0 授权（署名义务），点开查看完整署名与许可条款。
                </p>
                <Button
                  variant="ghost"
                  data-anchor="settings-attribution"
                  className="self-start whitespace-nowrap"
                  onClick={() => {
                    setAttributionOpen(true);
                  }}
                >
                  查看署名与许可
                </Button>
              </section>

              <section
                className="enter-fade flex flex-col gap-2"
                aria-labelledby="about-heading"
              >
                <h2 id="about-heading" className={H2}>
                  关于
                </h2>
                <p className="flex items-baseline gap-3">
                  <span className="text-[0.6875rem] tracking-[0.24em] text-paper/50">契约版本</span>
                  <span className="text-[1.125rem] tracking-[0.04em] text-paper">
                    {CONTRACT_VERSION}
                  </span>
                </p>
                <p className="max-w-[36rem] text-[0.78125rem] leading-[1.75] text-muted">
                  录音只在 https 或 localhost 下可用（浏览器策略）；局域网 IP
                  访问时录不了音不是页面故障。
                </p>
              </section>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none flex items-end gap-3 md:flex-col md:items-center md:gap-1"
            >
              <span className="text-[0.6875rem] tracking-[0.16em] text-paper/50">你的声音</span>
              {/* 稿 §4 瓶子全构件：声波 7 根 → 瓶（塞/唇/颈/肩/身+两道高光）→ 接触水皮 + 两圈涟漪 */}
              <svg
                data-device="sheet-bottle"
                viewBox="0 0 160 252"
                className="block h-auto w-[160px]"
                fill="none"
              >
                <defs>
                  <linearGradient id="sheet-glass" x1="24" y1="0" x2="136" y2="0" gradientUnits="userSpaceOnUse">
                    <stop stopColor="rgba(127,209,217,.34)" />
                    <stop offset=".26" stopColor="rgba(127,209,217,.12)" />
                    <stop offset=".4" stopColor="rgba(228,247,252,.4)" />
                    <stop offset=".54" stopColor="rgba(127,209,217,.14)" />
                    <stop offset="1" stopColor="rgba(127,209,217,.3)" />
                  </linearGradient>
                  <linearGradient id="sheet-l1" x1="0" y1="144" x2="0" y2="240" gradientUnits="userSpaceOnUse">
                    <stop stopColor="rgba(228,247,252,.82)" />
                    <stop offset="1" stopColor="rgba(228,247,252,.14)" />
                  </linearGradient>
                  <linearGradient id="sheet-contact" x1="0" y1="240" x2="0" y2="247" gradientUnits="userSpaceOnUse">
                    <stop stopColor="rgba(203,238,246,.06)" />
                    <stop offset=".48" stopColor="rgba(203,238,246,.46)" />
                    <stop offset="1" stopColor="rgba(203,238,246,0)" />
                  </linearGradient>
                </defs>
                {/* 声波 7 根（稿 heights 10,22,38,16,30,12,6，底对齐 y=44） */}
                {WAVE_BARS.map(([x, h]) => (
                  <rect
                    key={`wave-bar-${x}`}
                    data-part="wave-bar"
                    x={x}
                    y={44 - h}
                    width="3"
                    height={h}
                    fill="rgba(127,209,217,.55)"
                  />
                ))}
                {/* 瓶：塞 → 唇 → 颈 → 肩 → 身 */}
                <rect data-part="bot-cork" x="58" y="56" width="44" height="14" rx="2" fill="rgba(246,215,154,.52)" stroke="rgba(246,215,154,.72)" />
                <rect x="54" y="70" width="52" height="10" rx="2" stroke="rgba(216,243,246,.62)" />
                <rect x="56" y="80" width="48" height="44" rx="2" stroke="rgba(216,243,246,.64)" />
                <polygon points="56,124 104,124 136,140 24,140" stroke="rgba(216,243,246,.66)" fill="rgba(127,209,217,.14)" />
                <rect x="24" y="140" width="112" height="104" rx="2 2 4 4" stroke="rgba(216,243,246,.68)" fill="url(#sheet-glass)" />
                <rect x="33" y="144" width="3" height="96" fill="url(#sheet-l1)" />
                <rect x="129" y="144" width="1" height="96" fill="rgba(228,247,252,.34)" />
                {/* 接触亮水皮 + 两圈涟漪（骑在水线上） */}
                <rect data-part="contact" x="24" y="240" width="112" height="7" fill="url(#sheet-contact)" />
                <ellipse data-part="rip" cx="80" cy="243" rx="75" ry="6.5" stroke="rgba(203,238,246,.32)" />
                <ellipse data-part="rip" cx="80" cy="244" rx="48" ry="4" stroke="rgba(203,238,246,.2)" />
              </svg>
              <span className="border border-warm/[0.55] bg-warm/[0.18] px-2 py-1 text-[0.78125rem] tracking-[0.18em] text-warm/95">
                代号
              </span>
            </div>
          </div>

          {/* 右下：**水面之下**的倒影（账号与邮箱）。
              375 折成一页后这一组排在右栏之后、不再被那条水线穿过 ⇒ 用「镜像 + 降透明 + 标签」
              把"同一个东西的两个视角"写清楚（水线全页只允许一条，不在这里再画第二条）。 */}
          <div className="flex flex-col gap-2 md:col-start-2 md:row-start-3 md:items-center">
            <span aria-hidden="true" className="pointer-events-none -scale-y-100 opacity-40">
              <BottleMark size={64} tone="sea-glass" />
            </span>
            <span className="border border-warm/[0.55] bg-warm/[0.18] px-2 py-1 text-[0.78125rem] tracking-[0.18em] text-warm/95">
              账号
            </span>
            <span className="text-[0.6875rem] tracking-[0.16em] text-paper/50">
              倒影 · 账号与邮箱
            </span>
          </div>

          {/* 末行：当前身份（登出）。放最后有两重理由：
              一 375 的第一个屏幕必须装得下 `settings-attribution` 锚点（机器判据）；
              二 「账号只用于认领」在三格之后落到具体的人身上，顺序本来就是"先规则、后自己"。 */}
          <section className="enter-fade flex flex-col gap-3 md:col-start-1 md:row-start-4">
            <h2 className={H2}>当前身份</h2>
            <p className="flex items-center text-[1.1875rem] font-bold text-paper">
              <i aria-hidden="true" className="mr-[11px] inline-block h-[19px] w-0.5 bg-coral" />
              {session.user === null
                ? '未登录'
                : `已登录：${session.user.handle}（${session.user.email}）`}
            </p>
            <p className="flex items-baseline gap-3">
              <span className="text-[0.6875rem] tracking-[0.24em] text-paper/[0.42]">已登录态</span>
              <span className="text-[0.78125rem] text-paper/[0.42]">已登录：代号（邮箱）</span>
            </p>
            {/* 稿 §5.4 .hr：登出区前 1px 分隔线（mt18） */}
            <span aria-hidden="true" className="mt-[18px] h-px bg-line/13" />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="ghost"
                loading={logout.isPending}
                icon={<Icon name="LogOut" size={18} />}
                onClick={() => {
                  void logout
                    .mutateAsync()
                    .then(() => {
                      navigate('/login');
                    })
                    .catch(() => undefined);
                }}
              >
                登出
              </Button>
              {/* §1.7-3 退出进行态：状态文字（enter-fade）+ aria-live —— 动效不是唯一反馈 */}
              {logout.isPending ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="enter-fade text-[0.78125rem] leading-[1.75] text-muted"
                >
                  正在退出…
                </span>
              ) : null}
              <span className="text-[0.78125rem] leading-[1.75] text-muted">
                登出只清掉这台设备上的会话，别人不会因此看到你的瓶子。
              </span>
            </div>
          </section>
        </div>

        <Modal
          open={attributionOpen}
          title="伴奏与授权"
          onClose={() => {
            setAttributionOpen(false);
          }}
        >
          <LibraryAttribution tracks={library.data?.tracks ?? []} />
        </Modal>
      </div>
    </div>
  );
}
