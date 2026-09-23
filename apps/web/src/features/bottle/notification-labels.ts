/**
 * 通知 → 中文文案（纯函数）。
 *
 * 纪律：
 * - `type` 在契约里是**自由字符串**（`NotificationSchema.type: z.string()`），
 *   所以这里必须给未知类型兜底 —— 服务端将来加类型，页面不许崩、也不许把码漏给用户；
 * - 文案只陈述事实：`BOTTLE_COMPLETED` 的 payload 带内核算出的 `isComplete`，
 *   未完成时**绝不**说"已完成"（与写入侧同一口径）。
 */
export interface NotificationLike {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: string | null;
}

export interface NotificationView {
  label: string;
  detail: string;
  /** 语义色（DESIGN.md §Semantic & Status Colors）。 */
  tone: 'info' | 'success' | 'warning' | 'danger';
  /** 相关页面的站内链接；无法定位时为 null。 */
  href: string | null;
}

function payloadString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** 「《深海鲸落》」；没有曲名时返回空串（不显示空书名号）。 */
function titled(songTitle: string | null): string {
  return songTitle === null ? '' : `《${songTitle}》`;
}

export function describeNotification(notification: NotificationLike): NotificationView {
  const bottleId = payloadString(notification.payload, 'bottleId');
  const songTitle = payloadString(notification.payload, 'songTitle');

  switch (notification.type) {
    case 'MESSAGE_DELIVERED':
      return {
        label: '收到一条私密留言',
        detail: `${titled(songTitle) || '你的漂流瓶'}回传到发起者手里了，留言已送达，去发起者那边可以看到。`,
        tone: 'info',
        href: bottleId === null ? null : `/bottles/${bottleId}`,
      };
    case 'MESSAGE_UNDELIVERED':
      return {
        label: '你的留言未送达',
        detail: `${titled(songTitle) || '这支漂流瓶'}在中途进了公海，留言没能交到发起者手里。下次可以再录一段带上一句话。`,
        tone: 'warning',
        href: bottleId === null ? null : `/bottles/${bottleId}`,
      };
    case 'BOTTLE_COMPLETED': {
      const complete = notification.payload['isComplete'] === true;
      return {
        label: complete ? '你参与的作品已完成' : '你参与的作品有新进展',
        detail: complete
          ? `${titled(songTitle) || '你参与的这支作品'}已经补齐所有段位并进入公海，可以回听完整接力链。`
          : `${titled(songTitle) || '你参与的这支作品'}还在公海等待接力。`,
        tone: complete ? 'success' : 'info',
        href: bottleId === null ? null : complete ? `/sea/${bottleId}` : `/bottles/${bottleId}`,
      };
    }
    default:
      return {
        label: '有一条新的动态',
        detail: '这条消息来自漂流瓶的新动态，具体内容以后续版本为准。',
        tone: 'info',
        href: bottleId === null ? null : `/bottles/${bottleId}`,
      };
  }
}
