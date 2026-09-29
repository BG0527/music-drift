/**
 * 离线态（W18.5 · C4）。
 *
 * 缺口：全站此前**零** `navigator.onLine` 处理（grep = 0 命中），
 * 只有一句兜底文案「NETWORK｜网络没有接通」。于是在录音、上传、投票这些
 * 场景里，断网的表现是"点了没反应"或"过一会儿才报错"——
 * 而录音是最不能接受这种不确定性的场景（用户会以为录上了，其实没有）。
 *
 * 三条设计决定（用户裁决：横幅 + 禁用危险操作，录音继续可录）：
 *   1. **横幅位置**：顶栏下方 sticky 细条（z-index 走 `sticky` 契约层）。
 *      选它而不是底部浮条，是因为断网是**全局状态**、不是某页的事 ——
 *      放顶栏下方意味着任何页面一断网立刻知道，而不用先滚到底部去找。
 *   2. **禁用范围**：只禁「会把数据丢在网络请求上」的操作
 *      （上传 / 投票 / 放回 / 发评论 / 提交录音）。**录音不禁** ——
 *      音频录在本地内存里，断网照样能录，恢复了再上传；禁掉它等于
 *      "因为没网所以连录都不敢录"，那是更差的体验。
 *   3. **不静默**：横幅走 `role="status"`，读屏能听到；恢复时自动撤掉。
 */

import { useEffect, useState } from 'react';
import { Icon } from './icon';
import { cn } from './utils';

/** 订阅 online/offline；SSR/测试环境下退化为"在线"。 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const goOnline = (): void => {
      setOnline(true);
    };
    const goOffline = (): void => {
      setOnline(false);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/**
 * 断网横幅：顶栏下方的 sticky 细条。
 * `role="status"` + `aria-live="polite"`：断网/恢复都要被读屏播报
 * （DESIGN §Accessibility「状态变化必须同时有文案或图标」）。
 */
export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      className={cn(
        'sticky top-[62px] z-sticky mx-3 flex items-center gap-2 rounded-base',
        'border border-warning-border bg-warning-tint px-3 py-2',
        'text-[0.8125rem] leading-[1.6] text-warning',
      )}
    >
      <Icon name="AlertTriangle" size={16} />
      <span>
        网络没有接通。可以继续录音，接通后会自动上传；投票与评论要等网络回来。
      </span>
    </p>
  );
}

/**
 * 危险操作闸门：断网时把「依赖网络请求」的操作禁用，并说明原因。
 *
 * 注意**不要**用它包录音 —— 录音在本地，见文件头的设计决定第 2 条。
 */
export function useNetworkGuard(): { online: boolean; guard: (needsNetwork: boolean) => boolean } {
  const online = useOnline();
  return { online, guard: (needsNetwork: boolean) => needsNetwork && !online };
}
