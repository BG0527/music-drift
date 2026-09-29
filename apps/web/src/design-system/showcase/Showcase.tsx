import { useState } from 'react';
import {
  BottleMark,
  BottomNav,
  Button,
  Card,
  EmptyState,
  Glint,
  Groove,
  Icon,
  Input,
  Modal,
  Platter,
  Ripple,
  SidebarNav,
  Skeleton,
  Tabs,
  Toast,
  Waterline,
  colors,
  layout,
  motion,
  motif,
  radius,
  semanticTones,
  spacing,
  spring,
  zIndex,
  type NavItem,
} from '../index';
import '../index.css';

/**
 * 设计系统展示页 —— **仅开发用**（`npm run dev` 后访问 `/?design-system`）。
 *
 * record-v1（S2）：本页是**活文档**，三件事必须一眼可读 ——
 *   ① **母题装置库**（platter / glint / groove / waterline / ripple / bottleMark）各自"在编码什么"；
 *   ② **组件的新语态**（圆盘 + 外环 / coral 填充上的 ink 字 / 1px 细线 / 不用阴影造层次）；
 *   ③ **契约本身的数值**（色板 43 条、圆角、动效、装置强度）—— 每个数都来自 DESIGN.md。
 *
 * 本页不是产品页面，也不参与产品路由；文案只作示范（不含任何歌词正文、不使用外部图片）。
 */
const NAV: NavItem[] = [
  { key: 'river', label: '河道', href: '/river' },
  { key: 'sea', label: '公海', href: '/sea' },
  { key: 'mine', label: '我的', href: '/mine' },
  { key: 'settings', label: '设置', href: '/settings' },
];

/** DESIGN.md §Colors · 迁移别名：这 17 个名字会**撒谎**（S8 整批删除），组件层不许再用。 */
const LEGACY_ALIASES = new Set([
  'wave-white',
  'foam',
  'tide-pool',
  'mist',
  'driftline',
  'deep-current',
  'trench',
  'night-ink',
  'peacock',
  'peacock-deep',
  'peacock-active',
  'lagoon',
  'sea-glass',
  'abyss',
  'slate-current',
  'on-dark-muted',
  'coral-deep',
]);

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-b border-hairline pb-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-[1.5rem] font-bold text-paper">{title}</h2>
        {note === undefined ? null : <p className="text-[0.875rem] text-muted">{note}</p>}
      </header>
      {children}
    </section>
  );
}

/** 母题展厅：一块 isolate + overflow-hidden 的深水底，装置挂在里面（零布局高度）。 */
function MotifStage({
  motifName,
  title,
  encodes,
  height = 'h-[180px]',
  children,
}: {
  motifName: string;
  title: string;
  encodes: string;
  height?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        data-motif={motifName}
        className={`relative isolate ${height} overflow-hidden rounded-base border border-hairline bg-ink`}
      >
        {children}
      </div>
      <p className="text-[0.875rem] font-medium text-paper">{title}</p>
      <p className="text-[0.8125rem] leading-relaxed text-muted">{encodes}</p>
    </div>
  );
}

export function Showcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [destination, setDestination] = useState('relay');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink">
      <div className="flex flex-1">
        <SidebarNav items={NAV} current="river" />
        <main
          data-testid="showcase"
          className="flex w-full max-w-[var(--container-max-width)] flex-col gap-8 p-6 pb-16 md:pb-8"
        >
          {/* 页头：整面盘面 + 掠光（世界层）—— 与产品页面同一套公共层 */}
          <header className="relative isolate flex flex-col gap-2 overflow-hidden rounded-base border border-hairline px-6 py-8">
            <Platter />
            <Glint />
            <p className="relative text-[11px] font-medium tracking-[0.24em] text-muted">
              RECORD DRIFT · DESIGN SYSTEM
            </p>
            <h1 className="relative text-[2.25rem] font-bold text-paper">
              设计系统展示（开发用）
            </h1>
            <p className="relative max-w-[72ch] text-[1rem] text-muted">
              唯一实现源是 DESIGN.md（record-v1）。本页是活文档：母题装置、组件语态、契约数值都在这里
              逐一对照。图示均为装饰层（aria-hidden），不承载正文。
            </p>
          </header>

          <Section
            title="母题装置库（每页至多 2 个，且必须承担信息）"
            note="装置不是背景纹理：只画一颗大圆 = 失败。强度与周期全部来自契约（motif.*），样式层只引用 var(--motif-*)。"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <MotifStage
                motifName="platter"
                title="platter · 盘面"
                encodes="世界的底。同心沟槽（repeating-radial-gradient，周期取 textureLineGap）+ 径向内层 —— 「唱片落在水里」的那张盘。"
              >
                <Platter />
                <Glint />
              </MotifStage>

              <MotifStage
                motifName="glint"
                title="glint · 掠光"
                encodes="世界的「上方」、瓶子来的方向。101° 斜向光带，53%→55% 处一道硬边 —— 黑胶的材质来自反射有硬边。契约强度 0.065 极淡是故意的：它不照亮正文。"
              >
                {/* 上：契约强度的真实观感；下：同一道光放大后的形状示意（非契约值，只为看清带子的边） */}
                <Glint />
                <Glint className="opacity-100" />
                <p className="absolute inset-x-4 bottom-3 text-[11px] tracking-[0.16em] text-muted">
                  下：同一道光放大后的形状
                </p>
              </MotifStage>

              <MotifStage
                motifName="groove"
                title="groove · 沟槽 = 河道"
                encodes="被点亮的沟槽就是已录段位：两条 1px 细线夹出一条水道，灌进去的那一段 = 已经有人唱过了（冷 = 捞取侧 / 暖 = 投下侧）。"
                height="h-[180px]"
              >
                <Platter />
                <div className="absolute inset-x-6 top-8">
                  <p className="mb-1 text-[11px] tracking-[0.24em] text-muted">0 / 4 段</p>
                  <Groove progress={0} />
                </div>
                <div className="absolute inset-x-6 top-20">
                  <p className="mb-1 text-[11px] tracking-[0.24em] text-muted">2 / 4 段</p>
                  <Groove progress={0.5} />
                </div>
                <div className="absolute inset-x-6 top-32">
                  <p className="mb-1 text-[11px] tracking-[0.24em] text-muted">4 / 4 段（投下侧用暖光）</p>
                  <Groove progress={1} tone="warm" />
                </div>
              </MotifStage>

              <MotifStage
                motifName="waterline"
                title="waterline · 水线"
                encodes="分界：岸/水、线上（别人看得到）/线下（只有你知道）、浮上来（待处理）/沉下去（历史裁决）。全页只允许一条。"
              >
                <Platter />
                <p className="absolute inset-x-4 top-4 text-[0.8125rem] text-muted">岸 · 线上</p>
                <Waterline className="top-1/2" />
                <p className="absolute inset-x-4 bottom-4 text-[0.8125rem] text-muted">
                  水 · 线下
                </p>
              </MotifStage>

              <MotifStage
                motifName="ripple"
                title="ripple · 涟漪"
                encodes="刚刚发生过的事（落下 / 捞起 / 入海）。同心扁椭圆 —— 内圈断弧编码缺口：闭合环 = 四段都有人唱过。"
              >
                <Platter />
                <Ripple gaps={0} className="inset-x-4 top-8 h-[80px]" />
                <Ripple gaps={3} className="inset-x-4 bottom-8 h-[80px]" />
              </MotifStage>

              <MotifStage
                motifName="bottleMark"
                title="bottleMark · 漂流瓶"
                encodes="一支正在漂的作品：水位 = 已录段数（`filled` 0–4）。干瓶一眼就是「还没有人唱」。"
              >
                <Platter />
                <div className="absolute inset-x-0 top-8 flex items-end justify-center gap-3">
                  {[0, 1, 2, 3, 4].map((filled) => (
                    <span key={filled} className="flex flex-col items-center gap-1">
                      <BottleMark size={40} filled={filled} tone="sea-glass" />
                      <span className="text-[10px] tracking-[0.16em] text-muted">{filled} 段</span>
                    </span>
                  ))}
                </div>
              </MotifStage>
            </div>
          </Section>

          <Section
            title="按钮（盘 / 幽灵 / 圆盘）"
            note="主 CTA = coral 填充 + ink 文字（4.76:1）；幽灵 = 1px muted 细线 + coral 文字；圆盘 = 深色盘身 + 2~3 圈外环 + 冷/暖只在边缘微光。加载态用 shimmer，禁用 spinner。"
          >
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button>投瓶入海</Button>
                <Button variant="ghost">回河道</Button>
                <Button loading>接力提交中</Button>
                <Button disabled>不可用</Button>
                <Button icon={<Icon name="Waves" size={18} />}>捞取漂流瓶</Button>
              </div>
              {/* 圆盘的外环会向外伸 13 / 29 px ⇒ 展厅留出 40px 余量，否则环会压到邻居 */}
              <div className="flex flex-wrap items-center gap-16 px-10 py-10">
                <span data-demo="disc-button" className="flex flex-col items-center gap-2">
                  <Button shape="disc" variant="ghost" aria-label="捞取（圆盘）">
                    捞
                  </Button>
                  <span className="text-[0.75rem] text-muted">冷边 · 2 圈</span>
                </span>
                <span className="flex flex-col items-center gap-2">
                  <Button shape="disc" variant="ghost" tone="warm" aria-label="投下（圆盘）">
                    投
                  </Button>
                  <span className="text-[0.75rem] text-muted">暖边</span>
                </span>
                <span data-demo="disc-rings-3" className="flex flex-col items-center gap-2">
                  <Button shape="disc" variant="ghost" rings={3} aria-label="三圈外环">
                    3
                  </Button>
                  <span className="text-[0.75rem] text-muted">3 圈上限</span>
                </span>
                <span className="flex flex-col items-center gap-2">
                  <Button shape="disc" aria-label="主 CTA 圆盘">
                    投
                  </Button>
                  <span className="text-[0.75rem] text-muted">主 CTA（coral + ink 字）</span>
                </span>
              </div>
            </div>
          </Section>

          <Section
            title="表单"
            note="label 在上；底 water-void、1px muted 描边、paper 文字；focus ring = 2px coral + offset 2px；错误态给修正动作、文字用 danger（6.67:1）。"
          >
            <div className="grid grid-cols-1 gap-4 md:max-w-[36rem]">
              <Input
                label="接力代号"
                defaultValue="午夜歌手#042"
                hint="系统已为你随机安排一个充满浪潮气息的匿名昵称"
              />
              <Input label="用户名" error="用户名需 3–20 个字符，仅限字母、数字和下划线。" />
              <Input label="禁用的字段" defaultValue="不可编辑" disabled />
            </div>
          </Section>

          <Section
            title="卡片三档抬升"
            note="record-v1 不用阴影造层次：L1 卡片 = ink + 1px 细线；L2 浮动条 = water-void + 阴影；L4 深水区只用于沉浸式区块（不是深色模式）。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="漂流瓶 #0421">
                <p className="text-[0.9375rem] text-muted">
                  接力第 2 段 · 来自暖流河道 · 已有 3 段声音
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <BottleMark size={28} filled={3} tone="sea-glass" />
                  <span className="text-[0.875rem] text-muted">水位 = 已录段数</span>
                </div>
              </Card>
              <Card elevation="floating" title="播放条">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-coral text-ink">
                    <Icon name="Play" size={18} />
                  </span>
                  <div className="flex flex-1 flex-col gap-2">
                    <span className="text-[0.875rem] text-paper">第 2 段 · 00:18 / 00:24</span>
                    <Groove progress={0.75} />
                  </div>
                </div>
              </Card>
              <Card elevation="deep" title="沉浸式区块示例">
                <p className="text-[0.9375rem] text-muted">
                  深底上承载文字只允许 paper 与 muted（glass 只用于图标、线与装饰）。
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <BottleMark size={40} filled={4} tone="sea-glass" />
                  <span className="text-[0.875rem] text-paper">盘面 / 掠光 / 沟槽 / 水线 / 涟漪 / 漂流瓶</span>
                </div>
              </Card>
            </div>
          </Section>

          <Section
            title="加载与空态"
            note="骨架屏 shimmer 与目标同尺寸（底 water-void + glass 22% 掠光）；空态用中性色，不与错误态混淆。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div
                className="flex flex-col gap-3 rounded-base border border-hairline bg-ink p-4"
                aria-busy="true"
              >
                <Skeleton width="60%" height="1.25rem" />
                <Skeleton width="100%" height="0.875rem" />
                <Skeleton width="80%" height="0.875rem" />
                <span className="text-[0.8125rem] text-muted">加载中（无 spinner）</span>
              </div>
              <EmptyState
                icon="Waves"
                title="这一段河道暂时安静"
                description="还没有漂过来的瓶子。你可以先录一段，把声音交出去。"
                action={<Button icon={<Icon name="Mic" size={18} />}>去录制</Button>}
              />
            </div>
          </Section>

          <Section
            title="状态提示（语义色三件套）"
            note="每条状态都有图标 + 文案，颜色不是唯一信息载体（success 与 info 同属冷色相，只靠颜色分不出来）。"
          >
            <div className="flex flex-col gap-3">
              {(Object.keys(semanticTones) as Array<keyof typeof semanticTones>).map((tone) => (
                <Toast
                  key={tone}
                  tone={tone}
                  message={
                    tone === 'success'
                      ? '接力成功，等待下一位'
                      : tone === 'warning'
                        ? '录制时长接近上限（已 27 秒）'
                        : tone === 'danger'
                          ? '录制失败：麦克风没有采到声音，请检查设备后重试'
                          : '有人取走了你的瓶子，正在接力'
                  }
                />
              ))}
            </div>
          </Section>

          <Section
            title="标签组与河道沟槽"
            note="当前项用 coral 指示（1px 细线 + 字重 500），不是实心药丸；沟槽的点亮段 = 已录段位。"
          >
            <Tabs
              items={[
                {
                  key: 'assigned',
                  label: '指定接唱',
                  content: (
                    <div className="flex flex-col gap-3">
                      <p className="text-[0.9375rem] text-muted">等待你接唱的未完成作品。</p>
                      <Groove progress={0.5} />
                    </div>
                  ),
                },
                {
                  key: 'done',
                  label: '已完成的歌',
                  content: <p className="text-[0.9375rem] text-muted">已经入海的成品。</p>,
                },
                {
                  key: 'favorites',
                  label: '我的收藏',
                  content: <p className="text-[0.9375rem] text-muted">你收藏的声音。</p>,
                },
              ]}
            />
          </Section>

          <Section
            title="Modal（去向三选一）"
            note="遮罩 rgba(water-void,.78) + blur（z-overlay）/ 面板 ink + 细线 + 阴影（z-modal）；Esc 关闭，焦点进出可预期。"
          >
            <Button onClick={() => setModalOpen(true)}>打开去向选择</Button>
            <Modal
              open={modalOpen}
              title="选择声音去向"
              onClose={() => setModalOpen(false)}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>
                    取消并返回
                  </Button>
                  <Button onClick={() => setModalOpen(false)}>确认投递</Button>
                </>
              }
            >
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {[
                  { key: 'relay', label: '继续投河', desc: '让下一个人接着唱' },
                  { key: 'back', label: '回传', desc: '回到接唱者的上一棒' },
                  { key: 'sea', label: '入海', desc: '作为成品进入公海' },
                ].map((choice) => (
                  <li key={choice.key}>
                    <button
                      type="button"
                      onClick={() => setDestination(choice.key)}
                      aria-pressed={destination === choice.key}
                      className={`flex min-h-11 w-full flex-col items-start gap-2 rounded-base border p-4 text-left transition-colors duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] ${
                        destination === choice.key
                          ? 'border-coral bg-info-tint'
                          : 'border-muted bg-ink hover:border-water-mid'
                      }`}
                    >
                      <span className="text-[1rem] font-medium text-paper">{choice.label}</span>
                      <span className="text-[0.8125rem] text-muted">{choice.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Modal>
          </Section>

          <Section
            title="色板 token（43 条）"
            note="新名 26 条 + 过渡别名 17 条（别名会撒谎，只在迁移期存在，S8 整批删除；组件层已不许再用）。"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
              {Object.entries(colors).map(([name, hex]) => (
                <div
                  key={name}
                  className="flex flex-col gap-2 rounded-base border border-hairline bg-ink p-3"
                >
                  <span
                    className="h-[40px] w-full rounded-md border border-hairline"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-[0.8125rem] font-medium text-paper">{name}</span>
                  <span className="font-mono text-[0.75rem] text-muted">{hex}</span>
                  {LEGACY_ALIASES.has(name) ? (
                    <span className="text-[10px] tracking-[0.16em] text-warning">过渡别名</span>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="契约速查（机器可读值）"
            note="与 DESIGN.md 逐条一致；构建期与运行期共用同一份数值。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="布局 / 层级">
                <ul className="flex flex-col gap-1 text-[0.875rem] text-muted">
                  <li>
                    容器上限 {layout.containerMaxWidth}px · 侧边距 {layout.containerPaddingInline}
                  </li>
                  <li>
                    触控目标 ≥{layout.touchTargetMin}px · 折叠阈值 {layout.collapseBreakpoint}px
                  </li>
                  <li>
                    z-index: base {zIndex.base} / sticky {zIndex.sticky} / overlay {zIndex.overlay}{' '}
                    / modal {zIndex.modal} / toast {zIndex.toast}
                  </li>
                </ul>
              </Card>
              <Card title="动效 / 圆角 / 间距">
                <ul className="flex flex-col gap-1 text-[0.875rem] text-muted">
                  <li>
                    spring stiffness {spring.stiffness} / damping {spring.damping} · 入场{' '}
                    {motion.entryDuration}ms · 交错 {motion.stagger}ms
                  </li>
                  <li>
                    hover scale {motion.hoverScale} / {motion.hoverDuration}ms · 页面过渡{' '}
                    {motion.pageDuration}ms · 退场 {motion.exitDuration}ms · 只动{' '}
                    {motion.animatedProperties.join(' + ')}
                  </li>
                  <li>
                    圆角基准 {radius.base}px · 间距档 {Object.values(spacing).join(' / ')} px
                  </li>
                </ul>
              </Card>
              <Card title="母题装置强度（motif）">
                <ul className="flex flex-col gap-1 text-[0.875rem] text-muted">
                  <li>
                    platter α {motif.platterAlpha} · glint α {motif.glintAlpha} · 细线{' '}
                    {motif.hairlineMix}
                  </li>
                  <li>
                    沟槽点亮 {motif.grooveLitAlpha} · 涟漪环 {motif.rippleRingAlpha}
                  </li>
                  <li>
                    外环 {motif.ringAlpha} × 每圈 {motif.ringFalloff} · 偏移 {motif.ringInset} /{' '}
                    {motif.ringStep} · 盘身 {motif.discCoreAlpha} · 盘缘冷 {motif.discEdgeCoolAlpha}{' '}
                    / 暖 {motif.discEdgeWarmAlpha}
                  </li>
                </ul>
              </Card>
              <Card title="迁移状态（S2）">
                <ul className="flex flex-col gap-1 text-[0.875rem] text-muted">
                  <li>组件层已换到 record-v1 语言（17 个过渡别名在组件层被守卫禁用）。</li>
                  <li>pages/* 仍写着旧类名（S3+ 逐页迁移），因此 water.css 保留旧类作为别名。</li>
                  <li>已知坏组合：浅水光面 × 近白文字（foam × abyss = 1.01:1）只可能出现在未迁移的页面里。</li>
                </ul>
              </Card>
            </div>
          </Section>
        </main>
      </div>
      <BottomNav items={NAV} current="river" />
    </div>
  );
}
