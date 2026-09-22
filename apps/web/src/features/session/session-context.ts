/**
 * 会话上下文与读取入口（**只有 hook 与类型**；Provider 在 `session.tsx`）。
 *
 * 为什么拆开：Vite 的 Fast Refresh 只在"文件只导出组件"时可靠 ——
 * 一个文件同时导出 Provider 与 hook 会让热更新整页刷新（lint 也这么要求）。
 */
import { createContext, useContext } from 'react';
import type { AuthUser, SessionResponse } from '@music-drift/shared';

export type SessionStatus = 'loading' | 'guest' | 'authed';

export interface SessionValue {
  status: SessionStatus;
  user: AuthUser | null;
  session: SessionResponse | null;
  isAdmin: boolean;
  /**
   * 会话接口本身挂了（5xx / 网络），而不是"确实没登录"。
   * 这两种情况必须分开：否则服务器故障会被说成"你需要登录"，用户会白登录一次。
   */
  unavailable: boolean;
}

export const ANONYMOUS_SESSION: SessionValue = {
  status: 'loading',
  user: null,
  session: null,
  isAdmin: false,
  unavailable: false,
};

export const SessionContext = createContext<SessionValue>(ANONYMOUS_SESSION);

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
