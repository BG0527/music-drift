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

/**
 * 用户裁决："我希望能播放伴奏的同时进行录制，而不是单独分开功能。"
 * 这条把"伴奏"从独立按钮变成**跟随录音生命周期**的同步信号：
 * `autoPlaySignal.play` 变 true ⇒ 从本段开头起播；变 false ⇒ 停下并回到段首。
 */
describe('AccompanimentPlayer：与录音同步的自动起播', () => {
  it('play 变 true 自动起播本段、变 false 停回段首；token 递增让重录从头再来', () => {
    const element = new FakeAudio();
    const { rerender } = render(
      <AccompanimentPlayer
        environment={{ createElement: () => element, applyGain: vi.fn() }}
        segmentIndex={2}
        track={track('Immersed')}
        autoPlaySignal={{ play: false, token: 0 }}
      />,
    );
    expect(element.play, '初始不该自动播（还没开录）').not.toHaveBeenCalled();

    // 开录 ⇒ 自动起播
    rerender(
      <AccompanimentPlayer
        environment={{ createElement: () => element, applyGain: vi.fn() }}
        segmentIndex={2}
        track={track('Immersed')}
        autoPlaySignal={{ play: true, token: 1 }}
      />,
    );
    expect(element.play, '开录应自动起播伴奏').toHaveBeenCalledTimes(1);
    expect(element.paused).toBe(false);

    // 停录 ⇒ 停下
    rerender(
      <AccompanimentPlayer
        environment={{ createElement: () => element, applyGain: vi.fn() }}
        segmentIndex={2}
        track={track('Immersed')}
        autoPlaySignal={{ play: false, token: 1 }}
      />,
    );
    expect(element.pause, '停录应停伴奏').toHaveBeenCalled();
    expect(element.paused).toBe(true);

    // 重录一次（token 2，play 再次为 true）⇒ 从头再起播
    element.play.mockClear();
    rerender(
      <AccompanimentPlayer
        environment={{ createElement: () => element, applyGain: vi.fn() }}
        segmentIndex={2}
        track={track('Immersed')}
        autoPlaySignal={{ play: true, token: 2 }}
      />,
    );
    expect(element.play, '重录应重新起播（不靠沿用上次的尾）').toHaveBeenCalledTimes(1);
  });
});
