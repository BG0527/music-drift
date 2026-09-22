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
import { Card, Icon, cn } from '../../design-system';

export interface LibraryAttributionProps {
  /** 曲库曲目（用于逐首列出）。 */
  tracks: readonly LibraryTrack[];
  className?: string;
}

export function LibraryAttribution({ tracks, className }: LibraryAttributionProps) {
  return (
    <Card className={cn('flex flex-col gap-3 rounded-xl', className)}>
      <h3 className="flex items-center gap-2 text-[1.125rem] font-semibold text-abyss">
        <Icon name="Info" size={18} />
        伴奏音乐署名（CC BY 4.0）
      </h3>

      <p className="whitespace-pre-line text-[0.875rem] leading-[1.6] text-slate-current">
        {LIBRARY_ATTRIBUTION_TEXT}
      </p>

      <ul className="flex flex-col gap-1 text-[0.875rem] leading-[1.6] text-slate-current">
        {tracks.map((track) => (
          <li key={track.songId}>
            {track.title} · {LIBRARY_LICENSE.author}（{LIBRARY_LICENSE.sourceName}）
          </li>
        ))}
      </ul>

      <p className="flex flex-wrap items-center gap-2 text-[0.875rem]">
        <span className="text-slate-current">{LIBRARY_LICENSE.licenseName}</span>
        <a
          href={LIBRARY_LICENSE.licenseUrl}
          target="_blank"
          rel="license noreferrer"
          className="inline-flex min-h-11 items-center rounded-base text-peacock underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2"
        >
          查看许可条款（CC BY 4.0）
        </a>
        <a
          href={LIBRARY_LICENSE.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-base text-peacock underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2"
        >
          来源：{LIBRARY_LICENSE.sourceName}
        </a>
      </p>
    </Card>
  );
}
