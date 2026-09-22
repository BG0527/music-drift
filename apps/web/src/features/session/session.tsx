/**
 * 会话 Provider：`GET /api/auth/me` → 当前身份。
 *
 * - 会话是 **httpOnly cookie**（ADR-008），前端只能通过这个接口知道"我是谁"；
 * - **未登录不是错误**：匿名也能浏览公海 / 选歌，只有"写"操作才需要身份；
 * - 登录/注册成功后把会话写进 query 缓存，避免一次多余往返。
 *
 * hook 与上下文在 `session-context.ts`（Fast Refresh 要求一个文件只导出组件）。
 */
import { useMemo, type ReactNode } from 'react';
import { useMeQuery } from '../api/queries';
import { SessionContext, type SessionStatus, type SessionValue } from './session-context';

export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useMeQuery();
  const value = useMemo<SessionValue>(() => {
    const session = query.data ?? null;
    const status: SessionStatus = query.isPending
      ? 'loading'
      : session === null
        ? 'guest'
        : 'authed';
    return {
      status,
      user: session?.user ?? null,
      session,
      isAdmin: session?.user.role === 'ADMIN',
      unavailable: query.isError,
    };
  }, [query.data, query.isError, query.isPending]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
