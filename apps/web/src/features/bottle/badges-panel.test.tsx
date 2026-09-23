/**
 * 徽章弹窗单测（CONTEXT §10 / ADR-014 裁决 #1：徽章**派生不落库**）。
 *
 * 这里要钉住的正是"派生"这件事：
 * 1. 徽章**只来自服务端响应**（`GET /api/me/badges`，`BadgeAward[]`），
 *    组件**不缓存、不写 localStorage、不往任何地方存徽章状态** —— 作品被撤下徽章就该消失；
 * 2. 两种徽章（回传完成 / 漂流参与者）各要有可读的中文说明与出处（哪支作品给它的）；
 * 3. 属于次要内容（§46.2）⇒ 弹窗内展示。
 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BadgesPanel } from './badges-panel';
import { renderWithProviders } from '../../test/harness';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOTTLE_ID = '22222222-2222-4222-8222-222222222222';

function setup(items: unknown[]) {
  return renderWithProviders(<BadgesPanel open onClose={() => undefined} />, {
    handlers: [{ path: '/api/me/badges', respond: () => ({ body: items }) }],
  });
}

describe('徽章', () => {
  it('按类型展示，并说明是哪支作品给的', async () => {
    setup([
      { userId: USER_ID, kind: 'RETURN_COMPLETED', bottleId: BOTTLE_ID, grantedAt: '2026-09-23T04:00:00.000Z' },
      { userId: USER_ID, kind: 'DRIFT_PARTICIPANT', bottleId: BOTTLE_ID, grantedAt: '2026-09-23T04:00:00.000Z' },
    ]);

    expect(await screen.findByText(/回传完成/)).toBeInTheDocument();
    expect(screen.getByText(/漂流参与者/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /这支作品/ }).length).toBeGreaterThan(0);
  });

  it('徽章是派生的：界面明说"不落库、作品被撤下就消失"', async () => {
    setup([]);

    expect(await screen.findByText(/派生/)).toBeInTheDocument();
  });

  it('不把徽章写进任何本地存储（派生不落库，前端也不留副本）', async () => {
    setup([
      { userId: USER_ID, kind: 'RETURN_COMPLETED', bottleId: BOTTLE_ID, grantedAt: '2026-09-23T04:00:00.000Z' },
    ]);

    expect(await screen.findByText(/回传完成/)).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
