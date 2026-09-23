import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LIBRARY_LICENSE, LIBRARY_METADATA_URL } from '@music-drift/shared/audio';
import { USER_A } from '../../test/fixtures';
import { renderWithProviders } from '../../test/harness';
import { SettingsPage } from '../settings-page';

/**
 * t12 第 0️⃣ 项：设置页挂 **CC BY 4.0 署名**（t13 的授权义务）。
 *
 * 两条纪律：
 * 1. 署名**不依赖接口**：作者 / 来源 / 许可名 / 许可链接是编译期常量，
 *    元数据读不到时**义务必须照旧渲染**（CC BY 4.0 的唯一义务就是署名）；
 * 2. 元数据用**真资产**（`public/library/library.json`）当桩，顺带证明这个文件过 `LibraryMetadataSchema`。
 */
const METADATA = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'library', 'library.json'), 'utf8'),
) as { tracks: Array<{ title: string }> };

const SESSION = {
  user: { id: USER_A, handle: '午夜歌手', email: 'a@example.com', role: 'USER' },
  expiresAt: '2026-10-23T00:00:00.000Z',
};

function handlers(respond: () => { status?: number; body?: unknown }) {
  return [
    { path: '/api/auth/me', respond: () => ({ body: SESSION }) },
    { path: '/api/me/anonymous-codes', respond: () => ({ body: [] }) },
    { path: LIBRARY_METADATA_URL, respond },
  ];
}

describe('设置页 · 伴奏署名（CC BY 4.0）', () => {
  it('元数据可读时逐首列出曲名，并给出作者 / 来源 / 许可链接', async () => {
    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({ body: METADATA })),
    });

    // §46.2：声明式内容不占首屏 → 先点开入口，署名在弹窗里（义务不因收进弹窗而消失）
    fireEvent.click(await screen.findByRole('button', { name: '查看署名与许可' }));
    const heading = await screen.findByRole('heading', { name: '伴奏音乐署名（CC BY 4.0）' });
    expect(heading).toBeInTheDocument();

    // 逐首曲名（"指名道姓"到具体作品）
    for (const track of METADATA.tracks) {
      expect(await screen.findByText(new RegExp(track.title))).toBeInTheDocument();
    }

    // 署名三要素 + 许可链接（新窗口 + rel 安全属性由音频层组件保证）
    const section = heading.closest('section') ?? heading.parentElement;
    expect(section).not.toBeNull();
    // 署名三要素（作者 / 来源 / 许可名）在文本里恒在；逐曲名会重复出现作者，所以用 textContent 断言
    expect((section as HTMLElement).textContent).toContain('Kevin MacLeod');
    expect((section as HTMLElement).textContent).toContain('incompetech.com');
    expect((section as HTMLElement).textContent).toContain('Creative Commons Attribution 4.0');
    const licenseLink = within(section as HTMLElement).getByRole('link', {
      name: /查看许可条款/,
    });
    expect(licenseLink).toHaveAttribute('href', LIBRARY_LICENSE.licenseUrl);
    expect(licenseLink).toHaveAttribute('rel', 'license noreferrer');
    expect(licenseLink).toHaveAttribute('target', '_blank');
  });

  it('元数据读不到时**不隐藏署名义务**：作者 / 来源 / 许可链接仍在，并说明列表暂时读不到', async () => {
    renderWithProviders(<SettingsPage />, {
      route: '/settings',
      handlers: handlers(() => ({
        status: 500,
        body: { error: { message: '服务器出了点问题，请稍后再试。', violations: [] } },
      })),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看署名与许可' }));
    const heading = await screen.findByRole('heading', { name: '伴奏音乐署名（CC BY 4.0）' });
    const section = (heading.closest('section') ?? heading.parentElement) as HTMLElement;

    expect(section.textContent).toContain('Kevin MacLeod');
    expect(section.textContent).toContain('incompetech.com');
    expect(section.textContent).toContain('Creative Commons Attribution 4.0');
    expect(within(section).getByRole('link', { name: /查看许可条款/ })).toHaveAttribute(
      'href',
      LIBRARY_LICENSE.licenseUrl,
    );
    expect(within(section).getByText(/曲目列表暂时读不到/)).toBeInTheDocument();
  });
});
