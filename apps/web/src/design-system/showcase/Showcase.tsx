import { useState } from 'react';
import {
  BottomNav,
  BottleMark,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  RiverLine,
  RippleRing,
  SidebarNav,
  Skeleton,
  Tabs,
  Toast,
  WaveDivider,
  colors,
  layout,
  motion,
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
 * 用途：验收 DESIGN.md 的 token 与 10 个基础组件（状态、尺寸、语义色、无障碍）。
 * 本页不是产品页面，也不参与产品路由；文案只作示范（不含任何歌词正文、不使用外部图片）。
 */
const NAV: NavItem[] = [
  { key: 'river', label: '河道', href: '/river' },
  { key: 'sea', label: '公海', href: '/sea' },
  { key: 'mine', label: '我的', href: '/mine' },
  { key: 'settings', label: '设置', href: '/settings' },
];

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
    <section className="flex flex-col gap-4 border-b border-mist pb-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-[1.5rem] font-bold">{title}</h2>
        {note === undefined ? null : <p className="text-[0.875rem] text-slate-current">{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function Showcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [destination, setDestination] = useState('relay');

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="flex flex-1">
        <SidebarNav items={NAV} current="river" />
        <main
          data-testid="showcase"
          className="flex w-full max-w-[var(--container-max-width)] flex-col gap-8 p-6 pb-24 md:pb-8"
        >
          <header className="flex flex-col gap-2">
            <p className="text-[0.875rem] font-medium tracking-wide text-peacock">
              Ocean Drift · Design System
            </p>
            <h1 className="text-[2.25rem] font-bold">设计系统展示（开发用）</h1>
            <p className="max-w-[72ch] text-[1rem] text-slate-current">
              唯一实现源是 DESIGN.md。Figma 侧实测 0 组件 / 0 已发布样式，本页不存在「对齐 Figma
              组件」的说法。
            </p>
            <WaveDivider />
          </header>

          <Section
            title="色板 token"
            note="30 个语义色；正文对比度 ≥4.5:1，饱和度 ≤80%（最高 79% = peacock）。"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
              {Object.entries(colors).map(([name, hex]) => (
                <div
                  key={name}
                  className="flex flex-col gap-2 rounded-base border border-mist bg-foam p-3"
                >
                  <span
                    className="h-10 w-full rounded-md border border-mist"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="text-[0.8125rem] font-medium">{name}</span>
                  <span className="font-mono text-[0.75rem] text-slate-current">{hex}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="按钮"
            note="主按钮 peacock / hover 8% darken + scale(1.03) / active -1px；加载态用 shimmer，禁用 spinner。"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button>投瓶入海</Button>
              <Button variant="ghost">放回海中，继续漂流</Button>
              <Button loading>接力提交中</Button>
              <Button disabled>不可用</Button>
              <Button icon={<Icon name="Waves" size={18} />}>捞取漂流瓶</Button>
            </div>
          </Section>

          <Section
            title="表单"
            note="label 在上；focus ring = 2px peacock + offset 2px；错误态给修正动作。"
          >
            <div className="grid max-w-[36rem] grid-cols-1 gap-5">
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
            note="L1 卡片 / L2 浮动条 / L4 深水区（深水仅用于沉浸式区块，不是深色模式）。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="漂流瓶 #0421">
                <p className="text-[0.9375rem] text-slate-current">
                  接力第 2 段 · 来自暖流河道 · 已有 3 段声音
                </p>
                <footer className="mt-3 flex items-center gap-2 text-[0.875rem] text-slate-current">
                  <Icon name="Clock" size={16} /> 剩余可接段位 2
                </footer>
              </Card>
              <Card elevation="floating" title="播放条">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-peacock text-wave-white">
                    <Icon name="Play" size={18} />
                    <RippleRing />
                  </span>
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-[0.875rem]">第 2 段 · 00:18 / 00:24</span>
                    <span className="h-2 w-full rounded-pill bg-tide-pool">
                      <span className="block h-full w-3/4 rounded-pill bg-peacock" />
                    </span>
                  </div>
                </div>
              </Card>
              <Card elevation="deep" title="沉浸式区块示例">
                <p className="text-[0.9375rem] text-on-dark-muted">
                  深底上承载文字只允许 wave-white 与 on-dark-muted。
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <BottleMark size={40} />
                  <span className="text-[0.875rem]">水波 / 河道 / 漂流瓶母题</span>
                </div>
              </Card>
            </div>
          </Section>

          <Section
            title="加载与空态"
            note="骨架屏 shimmer 与目标同尺寸；空态用中性色，不与错误态混淆。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div
                className="flex flex-col gap-3 rounded-base border border-mist bg-foam p-4"
                aria-busy="true"
              >
                <Skeleton width="60%" height="1.25rem" />
                <Skeleton width="100%" height="0.875rem" />
                <Skeleton width="80%" height="0.875rem" />
                <span className="text-[0.8125rem] text-slate-current">加载中（无 spinner）</span>
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
            note="每条状态都有图标 + 文案，颜色不是唯一信息载体。"
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
            title="标签组与河道导引"
            note="公海三入口用 tablist；河道导引线用 2px 描边，已完成段 peacock。"
          >
            <div className="flex gap-6">
              <div className="flex-1">
                <Tabs
                  items={[
                    {
                      key: 'assigned',
                      label: '指定接唱',
                      content: <p className="text-[0.9375rem]">等待你接唱的未完成作品。</p>,
                    },
                    {
                      key: 'done',
                      label: '已完成的歌',
                      content: <p className="text-[0.9375rem]">已经入海的成品。</p>,
                    },
                    {
                      key: 'favorites',
                      label: '我的收藏',
                      content: <p className="text-[0.9375rem]">你收藏的声音。</p>,
                    },
                  ]}
                />
              </div>
              <div className="hidden h-40 items-stretch gap-3 lg:flex">
                <RiverLine progress={0.55} />
                <div className="flex flex-col justify-between text-[0.8125rem] text-slate-current">
                  {[
                    '第 1 段 · 已完成',
                    '第 2 段 · 已完成',
                    '第 3 段 · 等待接力',
                    '第 4 段 · 未开始',
                  ].map((label, index) => (
                    <span key={label} className="flex items-center gap-2">
                      <span
                        className={`h-3 w-3 rounded-full ${index < 2 ? 'bg-peacock' : 'bg-mist'}`}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Modal（去向三选一）"
            note="遮罩 z-overlay / 内容 z-modal；Esc 关闭，焦点进出可预期。"
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
                      className={`flex min-h-11 w-full flex-col items-start gap-2 rounded-base border p-4 text-left ${
                        destination === choice.key
                          ? 'border-peacock bg-info-tint'
                          : 'border-mist bg-wave-white'
                      }`}
                    >
                      <span className="text-[1rem] font-medium">{choice.label}</span>
                      <span className="text-[0.8125rem] text-slate-current">{choice.desc}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Modal>
          </Section>

          <Section
            title="契约速查（机器可读值）"
            note="与 DESIGN.md 逐条一致；构建期与运行期共用同一份数值。"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title="布局 / 层级">
                <ul className="flex flex-col gap-1 text-[0.875rem] text-slate-current">
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
                <ul className="flex flex-col gap-1 text-[0.875rem] text-slate-current">
                  <li>
                    spring stiffness {spring.stiffness} / damping {spring.damping} · 入场{' '}
                    {motion.entryDuration}ms · 交错 {motion.stagger}ms
                  </li>
                  <li>
                    hover scale {motion.hoverScale} / {motion.hoverDuration}ms · 页面过渡{' '}
                    {motion.pageDuration}ms · 只动 {motion.animatedProperties.join(' + ')}
                  </li>
                  <li>
                    圆角基准 {radius.base}px · 间距档 {Object.values(spacing).join(' / ')} px
                  </li>
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
