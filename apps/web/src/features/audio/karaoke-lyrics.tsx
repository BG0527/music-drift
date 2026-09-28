import type { SongLyricLine } from '@music-drift/shared';

export interface KaraokeLyricsProps {
  /** HTMLMediaElement.currentTime，单位秒。组件自身不计时。 */
  currentTime: number;
  lines: readonly SongLyricLine[];
  /** 测试/宿主已解析媒体查询时可显式声明；未声明时仍由 CSS media query 降级。 */
  reducedMotion?: boolean;
}

function activeLineIndex(lines: readonly SongLyricLine[], currentTimeMs: number): number {
  if (lines.length === 0) return -1;
  const found = lines.findIndex(
    (line) => currentTimeMs >= line.startMs && currentTimeMs < line.endMs,
  );
  if (found >= 0) return found;
  return currentTimeMs < (lines[0]?.startMs ?? 0) ? 0 : lines.length - 1;
}

function lineProgress(line: SongLyricLine, currentTimeMs: number): number {
  const duration = line.endMs - line.startMs;
  if (duration <= 0) return 0;
  return Math.min(1, Math.max(0, (currentTimeMs - line.startMs) / duration));
}

export function KaraokeLyrics({ currentTime, lines, reducedMotion = false }: KaraokeLyricsProps) {
  const currentTimeMs = Math.max(0, Number.isFinite(currentTime) ? currentTime : 0) * 1000;
  const currentIndex = activeLineIndex(lines, currentTimeMs);
  const visibleLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => Math.abs(index - currentIndex) <= 1);

  return (
    <div aria-label="同步歌词" className="grid overflow-hidden py-8 text-center">
      {visibleLines.map(({ line, index }) => {
        const current = index === currentIndex;
        const progress = current ? lineProgress(line, currentTimeMs) : 0;
        const characters = Array.from(line.text);
        const positionClass =
          index < currentIndex
            ? '-translate-y-full opacity-100'
            : index > currentIndex
              ? 'translate-y-full opacity-100'
              : 'translate-y-0 opacity-100';
        const lineMotionClass = reducedMotion
          ? 'transition-none'
          : 'transition-[transform,opacity] duration-[var(--motion-page-duration)] ease-[var(--motion-entry-easing)] motion-reduce:transition-none';
        const characterMotionClass = reducedMotion
          ? 'transition-none'
          : 'transition-opacity duration-[var(--motion-hover-duration)] ease-[var(--motion-entry-easing)] motion-reduce:transition-none';
        return (
          <p
            aria-current={current ? 'true' : undefined}
            className={`relative col-start-1 row-start-1 ${lineMotionClass} ${positionClass}`}
            data-progress={progress.toFixed(3)}
            data-testid={current ? 'karaoke-current-line' : undefined}
            key={`${line.startMs}-${line.text}`}
          >
            <span aria-current={current ? 'true' : undefined} className="text-muted">
              {line.text}
            </span>
            <span aria-hidden="true" className="absolute inset-0 text-coral">
              {characters.map((character, characterIndex) => {
                const opacity = Math.min(1, Math.max(0, progress * characters.length - characterIndex));
                return (
                  <span
                    className={characterMotionClass}
                    data-karaoke-character=""
                    key={`${String(characterIndex)}-${character}`}
                    style={{ opacity }}
                  >
                    {character}
                  </span>
                );
              })}
            </span>
          </p>
        );
      })}
    </div>
  );
}
