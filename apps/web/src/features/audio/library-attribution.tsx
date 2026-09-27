/**
 * CC BY 4.0 署名块（t13 第 4 条）。
 *
 * 义务（`apps/web/public/library/LICENSES.md` 原文）：CC BY 4.0 允许再分发与改编，
 * **唯一义务是署名**。本组件就是履行方式：
 * - 作者（Kevin MacLeod）+ 来源（incompetech.com）+ 许可名 + 许可链接；
 * - 逐首列出曲目标题（"指名道姓"到具体作品）；
 * - **改编(remix) 标注**：成品在伴奏上叠加了用户人声。
 *
 * 挂载位置：`设置 / 关于` 页（页面组装归 frontend-flow；本组件只负责内容与语义）。
 * 视觉：卡片 + 正文色，禁 emoji、禁外链图片（§18.2 明确"不建议依赖专辑封面"）。
 */
import {
  LIBRARY_ATTRIBUTION_TEXT,
  LIBRARY_LICENSE,
  type LibraryTrack,
} from '@music-drift/shared/audio';
import { Icon, cn } from '../../design-system';

export interface LibraryAttributionProps {
  /**
   * 曲库曲目（用于逐首列出）。**可选**：作者/来源/许可/链接是编译期常量，
   * 只有"逐首曲名"依赖元数据；接口挂掉时署名义务仍须完整渲染（CC BY 的唯一义务是署名）。
   */
  tracks?: readonly LibraryTrack[];
  className?: string;
}

export function LibraryAttribution({ tracks = [], className }: LibraryAttributionProps) {
  return (
    <div
      className={cn(
        // record-v1：署名块 = 唱片**内袋**（`rounded-lg` + `ink` 底 + 1px 细线，无阴影）
        'flex flex-col gap-3 rounded-lg border border-line/20 bg-ink p-4',
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-[1.125rem] font-semibold text-paper">
        <Icon name="Info" size={18} />
        伴奏音乐署名（CC BY 4.0）
      </h3>

      <p className="whitespace-pre-line text-[0.875rem] leading-[1.6] text-muted">
        {LIBRARY_ATTRIBUTION_TEXT}
      </p>

      {tracks.length === 0 ? (
        <p className="text-[0.875rem] leading-[1.6] text-muted">
          曲目列表暂时读不到（元数据未加载）；署名与许可义务不受影响。
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-[0.875rem] leading-[1.6] text-muted">
          {tracks.map((track) => (
            <li key={track.songId}>
              {track.title} · {LIBRARY_LICENSE.author}（{LIBRARY_LICENSE.sourceName}）
            </li>
          ))}
        </ul>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[0.875rem]">
        <span className="text-muted">{LIBRARY_LICENSE.licenseName}</span>
        <a
          href={LIBRARY_LICENSE.licenseUrl}
          target="_blank"
          rel="license noreferrer"
          className="inline-flex min-h-11 items-center rounded-base text-coral underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          查看许可条款（CC BY 4.0）
        </a>
        <a
          href={LIBRARY_LICENSE.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-base text-coral underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
        >
          来源：{LIBRARY_LICENSE.sourceName}
        </a>
      </p>
    </div>
  );
}
