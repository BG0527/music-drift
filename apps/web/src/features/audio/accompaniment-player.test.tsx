import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LibraryMetadataSchema, type LibraryTrack } from '@music-drift/shared/audio';
import { AccompanimentPlayer } from './accompaniment-player';
import type { AudioElementLike } from './use-accompaniment';

const metadata = LibraryMetadataSchema.parse(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/library/library.json'), 'utf8')) as unknown,
);

function track(title: string): LibraryTrack {
  const found = metadata.tracks.find((item) => item.title === title);
  if (found === undefined) throw new Error(`缺少曲目 ${title}`);
  return found;
}

class FakeAudio implements AudioElementLike {
  src = '';
  currentTime = 0;
  paused = true;
  private listeners = new Map<string, Set<() => void>>();
  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });

  addEventListener(type: string, handler: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(handler);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler());
  }

  seekTo(positionMs: number): void {
    this.currentTime = positionMs / 1000;
    this.emit('timeupdate');
  }
}

describe('AccompanimentPlayer：录音 K 歌歌词', () => {
  it('用伴奏媒体事件产生的全曲绝对 positionMs 驱动当前段歌词', () => {
    const element = new FakeAudio();
    render(
      <AccompanimentPlayer
        environment={{ createElement: () => element, applyGain: vi.fn() }}
        segmentIndex={2}
        track={track('Immersed')}
      />,
    );

    act(() => {
      element.seekTo(32_000);
    });

    expect(screen.getByText('陌生的旋律靠近身旁')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('karaoke-current-line')).toHaveAttribute(
      'data-progress',
      expect.stringMatching(/^0\.[0-9]{3}$/),
    );
  });
});
