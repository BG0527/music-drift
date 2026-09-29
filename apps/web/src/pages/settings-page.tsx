/**
 * 设置页 —— t5：按 `site/settings.html` + `site/patches/settings.css` **逐值复刻**。
 *
 * 装置（与定稿同一套坐标系，样式全部在 `settings-page.css`）：
 * - 一根水线 `--wl = 520 * --u` 同时驱动**空气/水体分界、纸的干湿分界、画出来的水线、
 *   瓶子接触水皮、倒影顶边** ⇒ 三线对齐 0px（t3 审计 §3.1 的三套坐标不复存在）；
 * - 折页 `.set-leaf` 104,52 → 1232×796：四周留白、右上「水线以上」、右下「水线以下」，
 *   中缝 `crease-shl/shr/crease` + 毛细 `wick` + 模切指孔 `hole` + 折角 `dogear`；
 * - 瓶装置 7 件（shoulder/neck/body/lip/cork + 两道高光）骑在水线上，`slip`「代号」在瓶肚里，
 *   水下 `.set-refl` 是**同构镜像**（同 x、同宽、顶边贴 --wl），外加 `wav`×3 / `bub`×3。
 *
 * 响应式（参考稿是 1440 固定画布 + fit.js，没有移动档）：
 * - md+：整页切到画布绝对坐标（文字层 `max(92*--u, 顶栏高)` 让位顶栏），
 *   「水下那条边界」与「当前身份」走 grid 两行 auto ⇒ 内容换行时自动顺排、不互压；
 * - <768：流式单列（纸与水线照常，**瓶装置收起** —— 它是 aria-hidden 装饰件，
 *   三条边界与两侧图例都在正文里，信息一条不少）。
 *
 * 只做三件事：匿名说明 / 登出 / 关于（契约版本 + 运行环境）。
 */
import { useState } from 'react';
import { CONTRACT_VERSION } from '@music-drift/shared';
import { useLibraryMetadata } from '../features/api/queries';
import { useLogout } from '../features/api/mutations';
import { LibraryAttribution } from '../features/audio';
import { useSession } from '../features/session/session-context';
import { Button, Glint, Icon, Modal, WaterTexture } from '../design-system';
import { useNavigate } from './shell/router-context';
import './settings-page.css';

/** 折页封面上的元信息（定稿原文）。 */
const SHEET_META = '内袋说明书 · INNER SLEEVE INSERT';

/** 设计稿 `h2.block`：17px / 700 / 1.3 + 1px 下边框 + 11px 内距（不是 19px/600）。 */
const H2 = 'text-[1.0625rem] font-bold leading-[1.3] text-paper border-b border-line/13 pb-[11px]';

/** 稿 §3 水线反光短划（x / ±1px 错位 / 宽，1440 画布 → 用 `--ux` 换算）。 */
const WLINE_DASHES: ReadonlyArray<readonly [number, number, number]> = [
  [148, -1, 30],
  [402, 1, 14],
  [640, -1, 44],
  [872, 1, 10],
  [1010, -1, 24],
  [1300, 1, 18],
];

/** 稿 §4 声波：七根柱子（位置与高度由 `settings-page.css` 与瓶子同一把尺给出）。 */
const WAVE_BARS = [0, 1, 2, 3, 4, 5, 6] as const;

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
    <main className="set-page relative isolate md:h-[100dvh] md:overflow-hidden">
      {/* ── 装饰层（稿 .clip）：背景十件 → 折页 → 瓶装置 → 倒影 → 水下波纹气泡 ── */}
      <div className="set-clip" aria-hidden="true">
        <span data-device="sheet-platter" className="set-platter" />
        <WaterTexture drift />
        <Glint />
        <span data-device="sheet-air" className="set-air" />
        <span data-device="sheet-sea" className="set-sea" />
        <span data-device="sheet-shaft" className="set-shaft" />
        <span data-device="sheet-grooves" className="set-grooves" />
        <span data-device="sheet-surf" className="set-surf" />

        {/* 折页：上半干燥、下半泡在水里（干湿分界 = --wl，接缝 0px） */}
        <div className="set-leaf">
          <span className="set-leaf-dry h-[58.8%] bg-water-bed/90" />
          <span className="set-leaf-wet h-[41.2%] bg-water-bed/45" />
          <span className="set-film bg-gradient-to-b from-glass/[0.07] to-transparent" />
          <span className="set-tide" />
          <span className="set-leaf-top" />
          <span className="set-dogear" />
          {/* 对折的中缝：桌面才有（375 折成一页）—— 1px 亮线 + 两侧明暗差 */}
          <span data-device="fold" aria-hidden="true" className="set-crease hidden md:block" />
          <span className="set-crease-shl" />
          <span className="set-crease-shr" />
          <span className="set-crease-soak" />
          <span className="set-wick set-wick-mid" />
          <span className="set-wick set-wick-lf" />
          <span className="set-wick set-wick-rt" />
          <span className="set-hole">
            <i />
          </span>
        </div>

        {/* 水面上的那只瓶子 = 别人看得到的（7 件 + 声波 + 接触水皮 + 两圈涟漪 + 纸条） */}
        <div data-device="sheet-bottle" className="set-bot">
          <span className="set-wave">
            {WAVE_BARS.map((bar) => (
              <i key={`wave-bar-${String(bar)}`} data-part="wave-bar" />
            ))}
          </span>
          <span data-part="bot-cork" className="set-bot-cork" />
          <span className="set-bot-lip" />
          <span className="set-bot-neck" />
          <span className="set-bot-shoulder" />
          <span className="set-bot-body" />
          <span className="set-bot-l1" />
          <span className="set-bot-l2" />
          <span className="set-slip border border-warm/[0.55] bg-warm/[0.18] text-[0.78125rem] tracking-[0.18em] text-warm/95">
            代号
          </span>
          <span data-part="contact" className="set-contact" />
          <span data-part="rip" className="set-rip set-rip-a" />
          <span data-part="rip" className="set-rip set-rip-b" />
          <span className="set-tiny set-tiny-a text-[0.6875rem] tracking-[0.16em] text-paper/50">
            你的声音
          </span>
        </div>

        {/* 水下的倒影：同一只瓶子的镜像（同 x / 同宽 / 顶边贴水线 ⇒ 与瓶 0px 断开） */}
        <div className="set-refl">
          <span className="rb" />
          <span className="rs" />
          <span className="rn" />
          <span className="rl" />
          <span className="rc" />
          <span className="rslip border border-warm/[0.55] bg-warm/[0.18] text-[0.78125rem] tracking-[0.18em] text-warm/95">
            账号
          </span>
        </div>

        <span className="set-wav set-wav-1" />
        <span className="set-wav set-wav-2" />
        <span className="set-wav set-wav-3" />
        <span className="set-bub set-bub-1" />
        <span className="set-bub set-bub-2" />
        <span className="set-bub set-bub-3" />
        <span className="set-tiny set-tiny-b text-[0.6875rem] tracking-[0.16em] text-paper/50">
          倒影 · 你的账号
        </span>
      </div>

      {/* ── 左上（干区）：说明书页头 + 「匿名的边界」线上两条 ─────────────── */}
      <section className="set-ldry enter-fade">
        <p className="text-[0.6875rem] tracking-[0.24em] text-paper/50">{SHEET_META}</p>
        <h1 className="set-h1 text-[1.625rem] font-bold leading-none tracking-[0.01em] text-paper md:text-[3.625rem]">
          设置
        </h1>
        <p className="set-standfirst max-w-[500px] text-[0.90625rem] leading-[1.85] text-muted">
          这一版只保留最小设置：看看匿名规则、退出登录、确认页面版本。
        </p>
        {/* 稿 §5.1 .rule：导语后 1px 分隔线 */}
        <span aria-hidden="true" className="set-rule mt-[26px] h-px bg-line/13" />
        <h2 className={H2}>匿名的边界</h2>
        <ol
          data-device="anonymous-above"
          className="set-rows flex flex-col [&>li+li]:border-t [&>li+li]:border-paper/[0.08]"
        >
          <li className="set-row flex gap-3 text-[0.8125rem] leading-[1.85] text-paper md:text-[0.96875rem]">
            <span aria-hidden="true" className="text-[0.875rem] text-water-mid/50">
              一
            </span>
            <span>每支瓶子一个独立代号（同一瓶里大家看到的是同一个）</span>
          </li>
          <li className="set-row flex gap-3 text-[0.8125rem] leading-[1.85] text-paper md:text-[0.96875rem]">
            <span aria-hidden="true" className="text-[0.875rem] text-water-mid/50">
              二
            </span>
            <span>接唱使用匿名代号；公开评论显示账号。</span>
          </li>
        </ol>
      </section>

      {/*
        水线两侧的图例 + 水线本体：md+ 整块锚在 `--wl`（线 y=--wl、上图例 -32、下图例 +20，
        稿值）；<768 随文档流落在「线上两条」与「线下一条」之间 —— 同一段 DOM、两种落位。
      */}
      <div className="set-water" data-device="anonymous-waterline">
        <p className="set-cap set-cap-up flex items-center gap-2 text-[0.6875rem] tracking-[0.24em] text-water-mid/[0.62]">
          <span aria-hidden="true" className="h-px w-[10px] bg-water-mid/50" />
          <span>水面之上 · 别人看得到的</span>
        </p>
        <div className="set-wline">
          {WLINE_DASHES.map(([left, top, width]) => (
            <i
              key={`wline-dash-${String(left)}`}
              data-part="wline-dash"
              aria-hidden="true"
              style={{
                left: `calc(${String(left)} * var(--ux))`,
                top,
                width: `calc(${String(width)} * var(--ux))`,
              }}
            />
          ))}
        </div>
        <p className="set-cap set-cap-dn flex items-center gap-2 text-[0.6875rem] tracking-[0.24em] text-muted/70">
          <span aria-hidden="true" className="h-px w-[10px] bg-paper/[0.28]" />
          <span>水面之下 · 只有你自己知道的</span>
        </p>
      </div>

      {/* 线下那一条（账号只用于认领）：md+ 起点 = --wl + 32px（稿 .l-wet），与「当前身份」同列顺排 */}
      <ol
        data-device="anonymous-below"
        className="set-below flex flex-col [&>li+li]:border-t [&>li+li]:border-paper/[0.08]"
      >
        <li className="set-row flex gap-3 text-[0.8125rem] leading-[1.85] text-paper md:text-[0.96875rem]">
          <span aria-hidden="true" className="text-[0.875rem] text-paper/[0.36]">
            三
          </span>
          <span>私密留言送达后，仅发送者与接收者互见账号。</span>
        </li>
      </ol>

      {/* ── 右上（干区）：伴奏与授权 + 关于（稿 .r-dry，left 760 / width 380） ── */}
      <div className="set-rdry">
        <section className="enter-fade" aria-labelledby="attribution-heading">
          <h2 id="attribution-heading" className={H2}>
            伴奏与授权
          </h2>
          <p className="set-body max-w-[36rem] text-[0.84375rem] leading-[1.8] text-muted">
            曲库伴奏为 CC BY 4.0 授权（署名义务），点开查看完整署名与许可条款。
          </p>
          <Button
            variant="ghost"
            data-anchor="settings-attribution"
            className="set-btn self-start whitespace-nowrap"
            onClick={() => {
              setAttributionOpen(true);
            }}
          >
            查看署名与许可
          </Button>
        </section>

        <section className="enter-fade" aria-labelledby="about-heading">
          <h2 id="about-heading" className={`${H2} set-after`}>
            关于
          </h2>
          <p className="set-ver flex items-baseline gap-3">
            <span className="text-[0.6875rem] tracking-[0.24em] text-paper/50">契约版本</span>
            <span className="text-[1.125rem] tracking-[0.04em] text-paper">{CONTRACT_VERSION}</span>
          </p>
          <p className="set-env max-w-[36rem] text-[0.78125rem] leading-[1.75] text-muted">
            录音只在 https 或 localhost 下可用（浏览器策略）；局域网 IP
            访问时录不了音不是页面故障。
          </p>
        </section>
      </div>

      {/* ── 线下：当前身份（登出）。DOM 排在右栏之后 ⇒ 375 的首屏先给署名锚点让位 ── */}
      <section className="set-who enter-fade">
        <h2 className={`${H2} set-after`}>当前身份</h2>
        <p className="set-who-line flex items-center text-[1.1875rem] font-bold text-paper">
          <i aria-hidden="true" className="mr-[11px] inline-block h-[19px] w-0.5 bg-coral" />
          {/* 稿 .who 只显代号（账号在下面的 .alt 行里说明）—— 逐值对齐 site/settings.html */}
          {session.user === null ? '未登录' : session.user.handle}
        </p>
        <p className="set-alt flex items-baseline gap-3">
          <span className="text-[0.6875rem] tracking-[0.24em] text-paper/[0.42]">已登录态</span>
          <span className="text-[0.78125rem] text-paper/[0.42]">用账号认领你的接唱与收藏</span>
        </p>
        {/* 稿 §5.4 .hr：登出区前 1px 分隔线 */}
        <span aria-hidden="true" className="set-hr mt-[18px] h-px bg-line/13" />
        <div className="set-act flex flex-wrap items-center gap-3">
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

      <Modal
        open={attributionOpen}
        title="伴奏与授权"
        onClose={() => {
          setAttributionOpen(false);
        }}
      >
        <LibraryAttribution tracks={library.data?.tracks ?? []} />
      </Modal>
    </main>
  );
}
