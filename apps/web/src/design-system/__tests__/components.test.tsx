import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import {
  BottomNav,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  SidebarNav,
  Skeleton,
  Tabs,
  Toast,
  type IconName,
} from '../index';

const NAV_ITEMS = [
  { key: 'river', label: '河道', href: '/river' },
  { key: 'sea', label: '公海', href: '/sea' },
  { key: 'mine', label: '我的', href: '/mine' },
  { key: 'settings', label: '设置', href: '/settings' },
];

/** 触控目标 ≥44px：DESIGN.md §Layout/§Accessibility 的移动端硬底线。 */
const TOUCH = /min-h-11|min-h-\[44px\]/;

describe('Button（主 CTA 盘 / 幽灵按钮 / 圆盘）', () => {
  it('主 CTA 用 coral 实心填充 + ink 文字（双向 4.76:1），且触控高度 ≥44px', () => {
    render(<Button variant="primary">投瓶</Button>);
    const btn = screen.getByRole('button', { name: '投瓶' });
    expect(btn.className).toMatch(/bg-coral/);
    // record-v1：coral 填充上的文字**一律用 ink**（纸白字只有 3.83:1，不合格）
    expect(btn.className).toMatch(/text-ink/);
    expect(btn.className).not.toMatch(/text-paper|text-wave-white/);
    expect(btn.className).toMatch(TOUCH);
  });

  it('幽灵按钮用 1px 细线 + coral 文字，不使用实心底', () => {
    render(<Button variant="ghost">回河道</Button>);
    const btn = screen.getByRole('button', { name: '回河道' });
    expect(btn.className).toMatch(/border/);
    expect(btn.className).toMatch(/text-coral/);
    expect(btn.className).not.toMatch(/bg-coral/);
  });

  it('盘身不填彩色：只有主 CTA 填 coral，其余盘面是深水底', () => {
    const ghost = render(<Button variant="ghost">放回</Button>).getByRole('button');
    expect(ghost.className).not.toMatch(/bg-(?:coral|warm|glass|peacock)/);
  });

  it('圆盘：rounded-full + 2~3 圈外环 + 深色盘身 + 冷/暖只在边缘微光', () => {
    const { container } = render(
      <Button shape="disc" variant="ghost">
        捞
      </Button>,
    );
    const disc = screen.getByRole('button', { name: '捞' });
    expect(disc.className).toMatch(/rounded-full/);
    // 盘身：深水径向内层（不是色板之外的填充，也不填彩色）
    expect(container.querySelector('.disc-core')).not.toBeNull();
    expect(disc.className).not.toMatch(/bg-(?:coral|warm|glass)/);
    // 外环 2~3 圈（默认 2 圈）——4 圈及以上会让盘身淹没在环里
    const rings = container.querySelectorAll('.disc-ring');
    expect(rings.length).toBeGreaterThanOrEqual(2);
    expect(rings.length).toBeLessThanOrEqual(3);
    for (const ring of rings) expect(ring.getAttribute('aria-hidden')).toBe('true');
    // 默认冷边
    expect(container.querySelector('.disc-edge-cool')).not.toBeNull();
  });

  it('圆盘上的文字用 paper（盘身 ≈ water-bed，coral 压上去只有 3.44:1，不够 4.5）', () => {
    render(
      <Button shape="disc" variant="ghost">
        捞
      </Button>,
    );
    const disc = screen.getByRole('button', { name: '捞' });
    expect(disc.className).toMatch(/text-paper/);
    expect(disc.className, 'coral 文字在深水盘身上不达标').not.toMatch(/text-coral/);
  });

  it('主 CTA 圆盘 = coral 标签盘：填充 coral、文字 ink，且不叠深水盘身', () => {
    const { container } = render(<Button shape="disc">投</Button>);
    const disc = screen.getByRole('button', { name: '投' });
    expect(disc.className).toMatch(/bg-coral/);
    expect(disc.className).toMatch(/text-ink/);
    expect(container.querySelector('.disc-core')).toBeNull();
  });

  it('圆盘的暖边可切换（投下 = 暖，捞取 = 冷），且冷暖不同时出现', () => {
    const { container } = render(
      <Button shape="disc" tone="warm">
        投
      </Button>,
    );
    expect(container.querySelector('.disc-edge-warm')).not.toBeNull();
    expect(container.querySelector('.disc-edge-cool')).toBeNull();
  });

  it('外环可以收到 3 圈（上限），但请求更多圈时不得超出上限', () => {
    const { container } = render(
      <Button shape="disc" rings={3}>
        投
      </Button>,
    );
    expect(container.querySelectorAll('.disc-ring')).toHaveLength(3);
    expect(container.querySelector('.disc-ring-3')).not.toBeNull();
  });

  it('focus ring 是 2px coral + offset 2px，且在 ink 底上（4.76:1 ≥3:1）', () => {
    render(<Button>继续</Button>);
    const btn = screen.getByRole('button', { name: '继续' });
    expect(btn.className).toMatch(/focus-visible:ring-2/);
    expect(btn.className).toMatch(/focus-visible:ring-coral/);
    expect(btn.className).toMatch(/focus-visible:ring-offset-2/);
    expect(btn.className).toMatch(/focus-visible:ring-offset-ink/);
  });

  it('hover 只做 scale(1.03)（动效纪律：不改布局属性）', () => {
    render(<Button>继续</Button>);
    const className = screen.getByRole('button', { name: '继续' }).className;
    // 抬升走 `.hover-lift`：transform + ::after 的 opacity 交叉（详见 motion-contract.test.tsx）
    expect(className).toMatch(/hover-lift/);
    // 不得直接过渡/设置 box-shadow：§3 只允许动 transform 与 opacity（box-shadow 的尺寸位置是明文禁止）
    expect(className).not.toMatch(/hover:shadow-lift/);
    expect(className).not.toMatch(/transition-\[[^\]]*box-shadow/);
  });

  it('disabled 时不可点、且不是靠透明度敷衍（用 water-void 底 + muted 文字）', () => {
    render(<Button disabled>不可用</Button>);
    const btn = screen.getByRole('button', { name: '不可用' });
    expect(btn).toBeDisabled();
    expect(btn.className).toMatch(/bg-water-void/);
    expect(btn.className).toMatch(/text-muted/);
  });

  it('loading 态保持文字与宽度、右侧用 shimmer 条而不是 spinner', () => {
    render(<Button loading>投瓶</Button>);
    const btn = screen.getByRole('button', { name: /投瓶/ });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn.querySelector('[data-testid="shimmer"]')).not.toBeNull();
    expect(btn.querySelector('[role="progressbar"]')).toBeNull();
    expect(btn.className).not.toMatch(/animate-spin/);
  });
});

describe('Input（label 在上 + 错误态）', () => {
  it('label 与控件显式关联', () => {
    render(<Input label="接力代号" />);
    const input = screen.getByLabelText('接力代号');
    expect(input.tagName).toBe('INPUT');
  });

  it('错误态给 aria-invalid 与 aria-describedby，并把说明渲染在下方', () => {
    render(<Input label="接力代号" error="代号需 3–20 个字符" />);
    const input = screen.getByLabelText('接力代号');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(screen.getByText('代号需 3–20 个字符')).toHaveAttribute('id', describedBy);
  });

  it('focus ring 为 2px coral + offset 2px（DESIGN.md §Components 原文要求）', () => {
    render(<Input label="接力代号" />);
    expect(screen.getByLabelText('接力代号').className).toMatch(/focus-visible:ring-2/);
    expect(screen.getByLabelText('接力代号').className).toMatch(/focus-visible:ring-coral/);
  });

  it('输入区高度 ≥44px（移动端可用性底线）', () => {
    render(<Input label="接力代号" />);
    expect(screen.getByLabelText('接力代号').className).toMatch(TOUCH);
  });

  it('深底输入框：water-void 底 + muted 描边 + paper 文字 + 2px 圆角', () => {
    render(<Input label="接力代号" />);
    const input = screen.getByLabelText('接力代号');
    expect(input.className).toMatch(/bg-water-void/);
    expect(input.className).toMatch(/border-muted/);
    expect(input.className).toMatch(/text-paper/);
    expect(input.className).toMatch(/rounded-md/);
  });

  it('字段级错误用 danger 文字 + coral 描边（错误文字 6.67:1）', () => {
    render(<Input label="接力代号" error="代号需 3–20 个字符" />);
    const input = screen.getByLabelText('接力代号');
    expect(input.className).toMatch(/border-coral/);
    expect(screen.getByText('代号需 3–20 个字符').className).toMatch(/text-danger/);
  });
});

describe('Card', () => {
  it('L1 卡片：ink 底 + 1px 细线 + 2px 圆角，且**不用阴影造层次**', () => {
    render(
      <Card>
        <p>漂流瓶</p>
      </Card>,
    );
    const card = screen.getByText('漂流瓶').closest('section') as HTMLElement;
    expect(card.className).toMatch(/bg-ink/);
    expect(card.className).toMatch(/border-hairline/);
    expect(card.className).toMatch(/rounded-base/);
    expect(card.className, 'record-v1 用亮度差与细线造层次，卡片不用阴影').not.toMatch(/shadow-/);
  });

  it('L2 浮动条：water-void 底 + 阴影（阴影只给浮层）', () => {
    render(
      <Card elevation="floating">
        <p>播放条</p>
      </Card>,
    );
    const card = screen.getByText('播放条').closest('section') as HTMLElement;
    expect(card.className).toMatch(/bg-water-void/);
    expect(card.className).toMatch(/shadow-floating/);
  });

  it('L4 深水沉浸区：water-body 底（不是"深色模式"，只有沉浸式区块用）', () => {
    render(
      <Card elevation="deep">
        <p>沉浸区</p>
      </Card>,
    );
    const card = screen.getByText('沉浸区').closest('section') as HTMLElement;
    expect(card.className).toMatch(/bg-water-body/);
    expect(card.className).toMatch(/text-paper/);
  });
});

describe('导航（桌面侧栏 / 移动底栏）', () => {
  it('桌面侧栏渲染四入口，当前项用 aria-current 标记', () => {
    render(<SidebarNav items={NAV_ITEMS} current="river" />);
    const nav = screen.getByRole('navigation', { name: '主导航' });
    expect(nav).toBeInTheDocument();
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: '河道' })).toHaveAttribute('aria-current', 'page');
  });

  it('侧栏包含「设置」入口（避免入口死链）', () => {
    render(<SidebarNav items={NAV_ITEMS} current="river" />);
    expect(screen.getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings');
  });

  it('移动底栏四项且每项触控目标 ≥44px', () => {
    render(<BottomNav items={NAV_ITEMS} current="sea" />);
    const nav = screen.getByRole('navigation', { name: '底部导航' });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.className, `${link.textContent} 触控目标不足`).toMatch(TOUCH);
    }
    expect(nav.className).toMatch(/bg-ink/);
    expect(screen.getByRole('link', { name: '公海' })).toHaveAttribute('aria-current', 'page');
  });

  it('底栏预留安全区与固定定位层级（sticky/z-index 契约）', () => {
    render(<BottomNav items={NAV_ITEMS} current="river" />);
    const nav = screen.getByRole('navigation', { name: '底部导航' });
    expect(nav.className).toMatch(/fixed/);
    expect(nav.className).toMatch(/z-sticky/);
    expect(nav.className).toMatch(/safe-area-inset-bottom|pb-\[env/);
  });

  it('导航条是 ink 底 + 1px 细线（不是浅底卡片）', () => {
    const { container } = render(<SidebarNav items={NAV_ITEMS} current="river" />);
    const nav = container.querySelector('nav') as HTMLElement;
    expect(nav.className).toMatch(/bg-ink/);
    expect(nav.className).toMatch(/border-hairline/);
  });

  it('当前项用 coral 指示：1px 竖线 + 字重 500（不只靠颜色）', () => {
    const { container } = render(<SidebarNav items={NAV_ITEMS} current="river" />);
    const active = screen.getByRole('link', { name: '河道' });
    expect(active.className).toMatch(/text-coral/);
    expect(active.className).toMatch(/font-medium/);
    // 竖线是独立的一根 1px 条（w-px + bg-coral），对读屏隐藏
    const bar = container.querySelector('a[aria-current="page"] span[aria-hidden="true"]');
    expect(bar, '缺 1px 竖线指示').not.toBeNull();
    expect(bar?.className).toMatch(/w-px/);
    expect(bar?.className).toMatch(/bg-coral/);
  });
});

describe('Skeleton（shimmer，非 spinner）', () => {
  it('渲染 shimmer 元素且不带 progressbar / spin 动画', () => {
    render(<Skeleton data-testid="sk" />);
    const el = screen.getByTestId('sk');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.querySelector('[data-testid="shimmer"]')).not.toBeNull();
    expect(el.querySelector('[role="progressbar"]')).toBeNull();
    expect(el.className).not.toMatch(/animate-spin/);
  });

  it('作为加载占位时可被无障碍忽略但父级可标 aria-busy', () => {
    render(
      <div aria-busy="true">
        <Skeleton />
      </div>,
    );
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('骨架底用 water-void（与目标组件同色系，加载完不跳色）', () => {
    render(<Skeleton data-testid="sk" />);
    expect(screen.getByTestId('sk').className).toMatch(/bg-water-void/);
  });
});

describe('EmptyState', () => {
  it('由图标 + 说明文字 + 行动按钮组成，图标对读屏隐藏', () => {
    render(
      <EmptyState
        icon="Waves"
        title="这一带还没有瓶子"
        description="等一会儿再来捞"
        action={<Button>去录制</Button>}
      />,
    );
    expect(screen.getByText('这一带还没有瓶子')).toBeInTheDocument();
    expect(screen.getByText('等一会儿再来捞')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去录制' })).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('空态是中性色、无填充底（不与错误态混淆）', () => {
    const { container } = render(<EmptyState icon="Waves" title="这一带还没有瓶子" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/bg-(?:coral|danger|warning|foam|water-light)/);
  });
});

describe('Icon（Lucide 唯一来源）', () => {
  it('图标名大小写不敏感：waves 与 Waves 都能解析', () => {
    render(<Icon name={'waves' as unknown as IconName} />);
    expect(document.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('提供 label 时成为可访问图像，而不是被读屏忽略', () => {
    render(<Icon name="Flag" label="举报" />);
    expect(screen.getByRole('img', { name: '举报' })).toBeInTheDocument();
  });

  it('不存在的图标名必须抛错，禁止用 emoji 或自绘图标兜底', () => {
    expect(() => render(<Icon name={'NotARealIcon' as unknown as IconName} />)).toThrow(
      /Lucide 图标不存在/,
    );
  });
});

describe('Toast', () => {
  it('是 polite 的 live region（接力状态可被播报）', () => {
    render(<Toast tone="info" message="接力成功，等待下一位" />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
    expect(toast).toHaveTextContent('接力成功，等待下一位');
    expect(toast.className).toMatch(/z-toast/);
  });

  it('语义色 tone 用 tint 底 + border + 语义文字色，不使用未定义颜色', () => {
    render(<Toast tone="danger" message="录制失败" />);
    const toast = screen.getByRole('status');
    expect(toast.className).toMatch(/bg-danger-tint/);
    expect(toast.className).toMatch(/border-danger-border/);
    expect(toast.className).toMatch(/text-danger/);
  });

  it('四种 tone 都用各自的语义文字色（success/info 不许退化成同一个）', () => {
    const { container } = render(
      <>
        <Toast tone="success" message="接力成功" />
        <Toast tone="warning" message="接近上限" />
        <Toast tone="info" message="有人取走了你的瓶子" />
      </>,
    );
    const [success, warning, info] = [...container.querySelectorAll('[role="status"]')];
    expect(success?.className).toMatch(/text-success/);
    expect(warning?.className).toMatch(/text-warning/);
    expect(info?.className).toMatch(/text-info/);
  });
});

describe('Modal（去向三选一）', () => {
  it('通过 portal 挂到 document.body 直属层，遮罩可点击关闭', () => {
    const onClose = vi.fn();
    const { container } = render(
      <div data-testid="page-stacking-context">
        <Modal open title="录第 3 段" onClose={onClose}>
          <button type="button">开始录制</button>
        </Modal>
      </div>,
    );

    const dialog = screen.getByRole('dialog', { name: '录第 3 段' });
    const modalRoot = dialog.parentElement;
    expect(container.contains(dialog), '弹窗不得留在页面层叠上下文里').toBe(false);
    expect(modalRoot?.parentElement).toBe(document.body);

    const backdrop = modalRoot?.querySelector('[data-modal-backdrop]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('720px 矮屏下面板有视口高度上限，长内容在面板内滚动', () => {
    render(<Modal open title="长内容" onClose={() => {}}><div>内容</div></Modal>);
    const dialog = screen.getByRole('dialog', { name: '长内容' });
    expect(dialog.className).toContain('max-h-[calc(100dvh-3rem)]');
    expect(dialog.className).toContain('overflow-y-auto');
  });

  it('打开时使背景 inert/aria-hidden，Tab 和 Shift+Tab 都不会逃出面板', () => {
    const { container } = render(
      <div>
        <button type="button">背景按钮</button>
        <Modal open title="焦点闭环" onClose={() => {}}>
          <button type="button">第一项</button>
          <button type="button">最后一项</button>
        </Modal>
      </div>,
    );
    const pageRoot = container;
    expect(pageRoot).toHaveAttribute('inert');
    expect(pageRoot).toHaveAttribute('aria-hidden', 'true');

    const dialog = screen.getByRole('dialog', { name: '焦点闭环' });
    const buttons = within(dialog).getAllByRole('button');
    const first = buttons[0]!;
    const last = buttons.at(-1)!;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('audio controls 是焦点闭环中的原生可聚焦项', () => {
    render(
      <Modal open title="录音失败复核" onClose={() => {}}>
        <button type="button">重试上传</button>
        <audio controls aria-label="本地录音" />
      </Modal>,
    );

    const audio = screen.getByLabelText('本地录音');
    // jsdom 不把 controls 媒体算作原生 tabbable；先借临时 tabindex 建立真实焦点，再移除，
    // 让断言验证 Modal 自己的原生媒体 selector，而不是被通用 [tabindex] 假通过。
    audio.setAttribute('tabindex', '0');
    audio.focus();
    audio.removeAttribute('tabindex');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
  });

  it('Tab 可进入音频，并在 video/contenteditable 间正反向循环', () => {
    render(
      <Modal open title="媒体焦点顺序" onClose={() => {}}>
        <button type="button">重试上传</button>
        <audio controls tabIndex={0} aria-label="本地录音" />
        <video controls tabIndex={0} aria-label="本地视频" />
        <div contentEditable tabIndex={0} aria-label="可编辑说明" />
      </Modal>,
    );

    const retry = screen.getByRole('button', { name: '重试上传' });
    const audio = screen.getByLabelText('本地录音');
    const video = screen.getByLabelText('本地视频');
    const editable = screen.getByLabelText('可编辑说明');
    retry.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(audio).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(video).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(editable).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(video).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(audio).toHaveFocus();
  });

  it('是 dialog + aria-modal，并带标题关联', () => {
    render(
      <Modal open title="选择声音去向" onClose={() => {}}>
        <p>继续投河 / 回传 / 入海</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('选择声音去向');
  });

  it('Esc 触发 onClose，且遮罩层级用 z-overlay / 内容用 z-modal', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="选择声音去向" onClose={onClose}>
        <p>内容</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.z-overlay')).not.toBeNull();
    expect(screen.getByRole('dialog').className).toMatch(/z-modal/);
  });

  it('不可关闭态会锁住 Esc、遮罩与关闭按钮', () => {
    const onClose = vi.fn();
    render(
      <Modal open title="正在上传" onClose={onClose} dismissible={false}>
        <p>正在保存录音</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('[data-modal-backdrop]')!);
    const close = screen.getByRole('button', { name: '关闭' });
    expect(close).toBeDisabled();
    fireEvent.click(close);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('关闭时不渲染（不留下不可见但可聚焦的节点）', () => {
    render(
      <Modal open={false} title="选择声音去向" onClose={() => {}}>
        <p>内容</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('关闭后保留 240ms 退场画面，再卸载并立即恢复背景与焦点', async () => {
    vi.useFakeTimers();
    try {
      const onExited = vi.fn();
      const opener = document.createElement('button');
      document.body.append(opener);
      opener.focus();
      const { container, rerender } = render(
        <Modal open title="带退场的弹窗" onClose={() => {}} onExited={onExited}>
          <button type="button">弹窗动作</button>
        </Modal>,
      );

      rerender(
        <Modal open={false} title="带退场的弹窗" onClose={() => {}} onExited={onExited}>
          <button type="button">弹窗动作</button>
        </Modal>,
      );

      expect(document.querySelector('[data-modal-root]')).toHaveClass('exit-fade');
      expect(container).toHaveAttribute('inert');
      expect(opener).not.toHaveFocus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(239);
      });
      expect(document.querySelector('[data-modal-root]')).not.toBeNull();
      expect(onExited).not.toHaveBeenCalled();
      expect(container).toHaveAttribute('inert');
      expect(opener).not.toHaveFocus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(document.querySelector('[data-modal-root]')).toBeNull();
      expect(onExited).toHaveBeenCalledTimes(1);
      expect(container).not.toHaveAttribute('inert');
      expect(opener).toHaveFocus();
      opener.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('浮层才允许用阴影（遮罩 water-void + 面板 ink 细线）', () => {
    render(
      <Modal open title="选择声音去向" onClose={() => {}}>
        <p>内容</p>
      </Modal>,
    );
    expect(document.querySelector('.z-overlay')?.className).toMatch(/bg-water-void/);
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/bg-ink/);
    expect(dialog.className).toMatch(/shadow-floating/);
  });
});

describe('Tabs（公海三入口）', () => {
  it('tablist / tab / tabpanel 角色与 aria-selected 正确', () => {
    render(
      <Tabs
        items={[
          { key: 'assigned', label: '指定接唱' },
          { key: 'done', label: '已完成的歌' },
          { key: 'favorites', label: '我的收藏' },
        ]}
      />,
    );
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });

  it('方向键可切换选中项（键盘可达）', () => {
    render(
      <Tabs
        items={[
          { key: 'assigned', label: '指定接唱' },
          { key: 'done', label: '已完成的歌' },
        ]}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    tabs[0]?.focus();
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('tab 触控高度 ≥44px', () => {
    render(<Tabs items={[{ key: 'a', label: '指定接唱' }]} />);
    expect(screen.getByRole('tab').className).toMatch(TOUCH);
  });

  it('当前项用 coral 指示 + 1px 下划线（不是实心药丸；圆角纪律 ≤4px）', () => {
    render(
      <Tabs
        items={[
          { key: 'a', label: '完整作品' },
          { key: 'b', label: '等待接力' },
        ]}
      />,
    );
    const [first, second] = screen.getAllByRole('tab');
    expect(first?.className).toMatch(/text-coral/);
    expect(first?.className).toMatch(/border-b/);
    expect(first?.className).toMatch(/border-coral/);
    expect(first?.className, 'record-v1 不用胶囊药丸表示选中').not.toMatch(/rounded-pill/);
    expect(second?.className).toMatch(/text-muted/);
  });
});
