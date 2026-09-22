/**
 * 错误 → 用户可读文案（**唯一**出口）。
 *
 * 两条来自 `docs/api.md` 的硬约束：
 * 1. §1 / §2.8：**传输层错误（400/401/403/404/501）的 envelope 里没有 code**（`violations: []`），
 *    只能按 HTTP 状态分支；只有业务规则违反（409/422）才有稳定码。所以这里的判别顺序是
 *    「状态优先、码兜底」，绝不 `switch (body.error.code)` 处理传输层问题。
 * 2. 文案必须给出**修正动作**（DESIGN.md §Error States）；409 接力冲突必须给**两个出口动作**，
 *    不许静默失败或只弹一个 toast。
 *
 * 中文文案口径：陈述发生了什么 + 下一步怎么做；不使用感叹号堆叠、不使用 AI 陈词。
 */

import { ApiError } from './client';

export type ApiErrorKind =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'CONFLICT'
  | 'EMPTY_RIVER'
  | 'RULE_VIOLATION'
  | 'SERVER'
  | 'NETWORK'
  | 'CONTRACT'
  | 'UNKNOWN';

/** 出口动作的**语义键**：页面负责把它翻译成具体链接（因为有的要带瓶子 id）。 */
export type ApiExitKey =
  'login' | 'switchBottle' | 'viewLog' | 'retry' | 'sea' | 'backHome' | 'pickSong';

export interface ApiErrorExit {
  key: ApiExitKey;
  label: string;
}

export interface ApiErrorView {
  kind: ApiErrorKind;
  title: string;
  detail: string;
  code: string | null;
  canRetry: boolean;
  needsLogin: boolean;
  exits: readonly ApiErrorExit[];
}

export interface ApiErrorInput {
  /** `null` = 请求没有到达服务端（网络层失败）。 */
  status: number | null;
  code?: string | null | undefined;
  message?: string | null | undefined;
}

/** 常见的 422 规则码兜底文案（服务端 message 缺失时才用；不得把码本身当文案给用户看）。 */
const RULE_FALLBACK_MESSAGES: Record<string, string> = {
  BOTTLE_DAMAGED: '这个作品已损坏，不再继续漂流。',
  BOTTLE_ALREADY_COMPLETE: '这个作品已经录满了，现在只能选择去向。',
  RESOLUTION_NOT_AVAILABLE: '当前阶段不能选择这个去向。',
  CANNOT_RECORD_TWICE_IN_BOTTLE: '同一个漂流瓶里不能接唱两次。',
  ALREADY_SANG_IN_BOTTLE: '你参与过的瓶子不会再漂回你手上。',
  CANNOT_DRAW_OWN_BOTTLE: '不能接自己投出的瓶子。',
  DRAW_COOLDOWN_ACTIVE: '你刚放回了这个瓶子，短时间内不会再捞到它。',
  LISTEN_RATIO_TOO_LOW: '听满 80% 才能点踩。',
  DISLIKE_ALREADY_CAST: '同一段只能踩一次。',
  LIKE_ALREADY_CAST: '同一段只能点一次赞。',
  CANNOT_DISLIKE_OWN_SEGMENT: '不能踩自己的段。',
  SEGMENT_ALREADY_CUT: '这一段已经被斩浪删除了。',
  COLLECTION_REQUIRES_FINISHED_WORK: '只有完成的作品才能收藏。',
  AUDIO_MISSING: '没有收到音频数据，请重新录制。',
  AUDIO_TOO_LARGE: '录音文件超过体积上限，请重新录制。',
  AUDIO_FORMAT_UNSUPPORTED: '这个音频格式不被支持，请用浏览器直接录制。',
  AUDIO_CONTAINER_MISMATCH: '音频内容与声明的格式不一致，请重新录制。',
  AUDIO_DURATION_OUT_OF_RANGE: '每段录音需在 15–30 秒之间，请重新录制。',
  EMAIL_TAKEN: '这个邮箱已经注册过了，直接登录试试？',
  HANDLE_TAKEN: '这个名字已经有人用了，换一个吧。',
  INVALID_CREDENTIALS: '账号或口令不正确。',
  WEAK_PASSWORD: '口令太弱了：至少 8 位，且要同时包含字母和数字。',
};

const LOGIN_EXIT: ApiErrorExit = { key: 'login', label: '去登录' };

function conflictExits(): readonly ApiErrorExit[] {
  return [
    { key: 'switchBottle', label: '换一段继续' },
    { key: 'viewLog', label: '看一眼漂流日志' },
  ];
}

function view(
  input: Partial<ApiErrorView> & Pick<ApiErrorView, 'kind' | 'title' | 'detail'>,
): ApiErrorView {
  return {
    code: null,
    canRetry: false,
    needsLogin: false,
    exits: [],
    ...input,
  };
}

export function describeApiError(input: ApiErrorInput): ApiErrorView {
  const { status } = input;
  const code = typeof input.code === 'string' && input.code.length > 0 ? input.code : null;
  const message =
    typeof input.message === 'string' && input.message.trim().length > 0
      ? input.message.trim()
      : null;

  // ① 客户端自己发现的契约不符（不是服务端返回的码）
  if (code === 'CONTRACT_VIOLATION') {
    return view({
      kind: 'CONTRACT',
      title: '页面和服务器对不上',
      detail:
        '服务端返回的数据不符合约定，这一版页面可能过期了。刷新页面再试；你录好的内容还在本机。',
      code,
    });
  }

  // ② 请求没有到达服务端
  if (status === null) {
    return view({
      kind: 'NETWORK',
      title: '网络没有接通',
      detail: '检查网络后再试一次。你录好的内容还在本机，不会丢。',
      canRetry: true,
      exits: [{ key: 'retry', label: '重试' }],
    });
  }

  // ③ 传输层：按状态分支（这些状态没有 code）
  if (status === 401) {
    return view({
      kind: 'AUTH_REQUIRED',
      title: '需要先登录',
      detail: message ?? '登录状态已过期，重新登录就回到刚才那一步。',
      needsLogin: true,
      exits: [LOGIN_EXIT],
    });
  }
  if (status === 403) {
    return view({
      kind: 'FORBIDDEN',
      title: '你没有权限做这件事',
      detail: message ?? '这个操作只对特定角色开放；如果你觉得不对，把漂流瓶链接发给管理员复核。',
      canRetry: false,
    });
  }
  if (status === 404) {
    return view({
      kind: 'NOT_FOUND',
      title: '这个漂流瓶不在这里',
      detail: message ?? '它可能已经被别人接走、已经进了公海，或者链接写错了。',
      exits: [
        { key: 'sea', label: '去公海大厅' },
        { key: 'retry', label: '重新加载' },
      ],
    });
  }
  if (status === 400) {
    return view({
      kind: 'INVALID_REQUEST',
      title: '请求内容不合法',
      detail: message ?? '刷新页面后再试一次；如果还是这样，说明这一版页面与服务端不一致。',
      canRetry: true,
      exits: [{ key: 'retry', label: '重试' }],
    });
  }

  // ④ 业务冲突 / 规则违反：有稳定码
  if (status === 409) {
    if (code === 'NO_BOTTLE_AVAILABLE') {
      return view({
        kind: 'EMPTY_RIVER',
        title: '河道里暂时没有可以捞的瓶子',
        detail: '河道只能随机打捞，没有搜索。等一会儿再试，或者先去公海听听已经完成的作品。',
        code,
        exits: [
          { key: 'retry', label: '再捞一次' },
          { key: 'sea', label: '去公海大厅' },
        ],
      });
    }
    const takenByOther =
      code === 'HOLDING_ALREADY_TAKEN' || code === 'NOT_HOLDER' || code === 'BOTTLE_NOT_IN_RIVER';
    return view({
      kind: 'CONFLICT',
      title: takenByOther ? '这一段已被别人接走' : '这一步和别人撞上了',
      detail:
        message ??
        (takenByOther
          ? '同一条河道上，同一时刻只有一个人拿着它。你录好的内容还在本机。'
          : '这个操作和另一个人的操作同时发生，换一个动作再试。'),
      code,
      exits: conflictExits(),
    });
  }
  if (status === 422) {
    return view({
      kind: 'RULE_VIOLATION',
      title: '这一步现在做不了',
      detail:
        message ??
        (code === null
          ? '当前状态不满足这个操作的条件。'
          : (RULE_FALLBACK_MESSAGES[code] ?? '当前状态不满足这个操作的条件。')),
      code,
    });
  }

  // ⑤ 服务端故障与未知情况
  if (status >= 500) {
    return view({
      kind: 'SERVER',
      title: '服务器暂时不可用',
      detail: message ?? '过一会儿再试一次。你录好的内容还在本机，不会丢。',
      code,
      canRetry: true,
      exits: [{ key: 'retry', label: '重试' }],
    });
  }

  return view({
    kind: 'UNKNOWN',
    title: '这一步没有完成',
    detail: message ?? '刷新页面后再试一次；如果反复出现，把漂流瓶链接发给管理员。',
    code,
    canRetry: true,
    exits: [{ key: 'retry', label: '重试' }],
  });
}

/**
 * 任意错误 → 可读视图（把 `ApiError` 的 status/code/message 摊平；非 ApiError 一律按网络失败处理）。
 * 放在这里而不是组件文件里：组件文件只导出组件（Fast Refresh），工具函数归契约层。
 */
export function toApiErrorView(error: unknown): ApiErrorView {
  if (error instanceof ApiError) {
    return describeApiError({ status: error.status, code: error.code, message: error.message });
  }
  return describeApiError({
    status: null,
    code: null,
    message: error instanceof Error ? error.message : null,
  });
}
