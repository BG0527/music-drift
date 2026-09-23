/**
 * 审核台（`/admin`，`CONTEXT.md` §8.3）。
 *
 * 权限口径：**服务端判定**（非管理员访问接口得 403）。页面这一层做两件事：
 * - 不是管理员时**不渲染队列**（也不去打接口），给一段说明 + 回首页；
 * - 是管理员时给两个视图：待处理队列 / 历史裁决（历史里的「恢复这一段」是覆盖自动斩杀的入口）。
 *
 * 视觉：`DESIGN.md` 没有这一页的帧（Figma 也没有 admin 状态帧），所以按 token 自建：
 * 一屏一件事（先看队列再裁决），表格形态用卡片列表而不是密集表格（移动端不横向溢出）。
 */
import { useState } from 'react';
import { EmptyState, Tabs } from '../design-system';
import { ReportQueue } from '../features/admin/report-queue';
import { useSession } from '../features/session/session-context';
import { TEXT_LINK_STRONG } from './shell/link-styles';
import { Link } from './shell/router';

export function AdminPage() {
  const session = useSession();
  const [view, setView] = useState<'PENDING' | 'REVIEWED'>('PENDING');

  if (session.status === 'loading') {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="h-[36px] w-[160px] rounded-base bg-tide-pool" />
        <div className="h-[96px] w-full rounded-base bg-tide-pool" />
      </div>
    );
  }

  if (!session.isAdmin) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="审核台只对管理员开放"
        description="这一个入口需要管理员角色。权限由服务端判定 —— 藏在界面里不算权限，所以即使直接打开这个地址，接口也会拒绝。"
        action={
          <Link to="/" className={TEXT_LINK_STRONG}>
            回首页
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[1.75rem] font-bold text-abyss">审核台</h1>
        <p className="max-w-[46rem] text-[1rem] leading-[1.6] text-slate-current">
          人工审核是最终决定权（CONTEXT §8）：可以驳回、删段、删瓶下架、封禁作者。
          自动斩杀只负责"把可疑的段先拿下来"，误斩可以在历史里用「恢复这一段」还回去。
        </p>
      </header>

      <Tabs
        items={[
          { key: 'PENDING', label: '待处理' },
          { key: 'REVIEWED', label: '历史裁决' },
        ]}
        value={view}
        onChange={(key) => {
          setView(key === 'REVIEWED' ? 'REVIEWED' : 'PENDING');
        }}
      />

      <ReportQueue status={view} />
    </div>
  );
}
