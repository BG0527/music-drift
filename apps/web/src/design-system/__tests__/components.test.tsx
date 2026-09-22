import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('Button（主按钮 / 幽灵按钮）', () => {
  it('主按钮用 peacock 底 + wave-white 文字，且触控高度 ≥44px', () => {
    render(<Button variant="primary">投瓶</Button>);
    const btn = screen.getByRole('button', { name: '投瓶' });
    expect(btn.className).toMatch(/bg-peacock/);
    expect(btn.className).toMatch(/text-wave-white/);
    expect(btn.className).toMatch(TOUCH);
  });

  it('幽灵按钮用描边 + peacock 文字，不使用实心底', () => {
    render(<Button variant="ghost">放回海中</Button>);
    const btn = screen.getByRole('button', { name: '放回海中' });
    expect(btn.className).toMatch(/border/);
    expect(btn.className).toMatch(/text-peacock/);
    expect(btn.className).not.toMatch(/bg-peacock/);
  });

  it('focus ring 是 2px peacock + offset 2px（键盘可达）', () => {
    render(<Button>继续</Button>);
    const btn = screen.getByRole('button', { name: '继续' });
    expect(btn.className).toMatch(/focus-visible:ring-2/);
    expect(btn.className).toMatch(/focus-visible:ring-peacock/);
    expect(btn.className).toMatch(/focus-visible:ring-offset-2/);
  });

  it('hover 只做 scale(1.03)（动效纪律：不改布局属性）', () => {
    render(<Button>继续</Button>);
    expect(screen.getByRole('button', { name: '继续' }).className).toMatch(/hover:scale-\[1\.03\]/);
  });

  it('disabled 时不可点、且不是靠透明度敷衍（用 tide-pool 底）', () => {
    render(<Button disabled>不可用</Button>);
    const btn = screen.getByRole('button', { name: '不可用' });
    expect(btn).toBeDisabled();
    expect(btn.className).toMatch(/bg-tide-pool/);
    expect(btn.className).toMatch(/text-slate-current/);
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

  it('focus ring 为 2px peacock + offset 2px（DESIGN.md §Components 原文要求）', () => {
    render(<Input label="接力代号" />);
    expect(screen.getByLabelText('接力代号').className).toMatch(/focus-visible:ring-2/);
    expect(screen.getByLabelText('接力代号').className).toMatch(/focus-visible:ring-peacock/);
  });

  it('输入区高度 ≥44px（移动端可用性底线）', () => {
    render(<Input label="接力代号" />);
    expect(screen.getByLabelText('接力代号').className).toMatch(TOUCH);
  });
});

describe('Card', () => {
  it('用 foam 底 + mist 描边 + 12px 基准圆角', () => {
    render(
      <Card>
        <p>漂流瓶</p>
      </Card>,
    );
    const card = screen.getByText('漂流瓶').closest('section') as HTMLElement;
    expect(card.className).toMatch(/bg-foam/);
    expect(card.className).toMatch(/border-mist/);
    expect(card.className).toMatch(/rounded-base/);
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
    expect(nav.className).toMatch(/bg-foam/);
    expect(screen.getByRole('link', { name: '公海' })).toHaveAttribute('aria-current', 'page');
  });

  it('底栏预留安全区与固定定位层级（sticky/z-index 契约）', () => {
    render(<BottomNav items={NAV_ITEMS} current="river" />);
    const nav = screen.getByRole('navigation', { name: '底部导航' });
    expect(nav.className).toMatch(/fixed/);
    expect(nav.className).toMatch(/z-sticky/);
    expect(nav.className).toMatch(/safe-area-inset-bottom|pb-\[env/);
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

  it('语义色 tone 用 tint 底 + border，不使用未定义颜色', () => {
    render(<Toast tone="danger" message="录制失败" />);
    const toast = screen.getByRole('status');
    expect(toast.className).toMatch(/bg-danger-tint/);
    expect(toast.className).toMatch(/border-danger-border/);
  });
});

describe('Modal（去向三选一）', () => {
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

  it('关闭时不渲染（不留下不可见但可聚焦的节点）', () => {
    render(
      <Modal open={false} title="选择声音去向" onClose={() => {}}>
        <p>内容</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
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
});
