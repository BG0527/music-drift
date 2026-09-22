/**
 * 伴奏播放条 + CC BY 4.0 署名组件单测（t13）。
 *
 * 硬要求：
 * - 播放条必须**明说"只播当前段"**，并显示段号/时间窗/响度归一增益（评审要看得见依据）；
 * - 播放/暂停是纯图标按钮 → 必须带 `aria-label`，进度有文字表达（DESIGN.md 无障碍媒体条款）；
 * - 署名必须含作者、来源、许可名与**可点击链接**，并标注改编(remix)（CC BY 4.0 的义务）；
 * - 不出现 emoji、不用外部专辑封面（DESIGN.md / §18.2 约束）。
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  LibraryMetadataSchema,
  LIBRARY_LICENSE,
  type LibraryTrack,
} from '@music-drift/shared/audio';
import { AccompanimentPlayer } from './accompaniment-player';
import { LibraryAttribution } from './library-attribution';
import type { AudioElementLike } from './use-accompaniment';

const metadata = LibraryMetadataSchema.parse(
  JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/library/library.json'), 'utf8'),
  ) as unknown,
);

function track(title: string): LibraryTrack {
  const found = metadata.tracks.find((item) => item.title === title);
  if (found === undefined) throw new Error(`缺少 ${title}`);
  return found;
}

class FakeAudio implements AudioElementLike {
  src: string;
  currentTime = 0;
  paused = true;
  play = vi.fn(async () => {
    this.paused = false;
    this.emit('play');
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.emit('pause');
  });
  private listeners = new Map<string, Set<() => void>>();

  constructor(src = '') {
    this.src = src;
  }

  addEventListener(type: string, handler: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: () => void): void {
    this.listeners.get(type)?.delete(handler);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((handler) => handler());
  }

  seekTo(ms: number): void {
    this.currentTime = ms / 1000;
    this.emit('timeupdate');
  }
}

describe('AccompanimentPlayer', () => {
  it('显示曲目依据（BPM / 拍号）与"只播当前段"的口径', () => {
    const element = new FakeAudio();
    render(
      <AccompanimentPlayer
        track={track('Rains Will Fall')}
        segmentIndex={2}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    expect(screen.getByText(/Rains Will Fall/)).toBeInTheDocument();
    expect(screen.getByText(/85 BPM/)).toBeInTheDocument();
    expect(screen.getByText(/3\/4/)).toBeInTheDocument();
    expect(screen.getByText(/只播当前段/)).toBeInTheDocument();
  });

  it('显示段号与段时间窗（用户知道自己在唱歌里的哪一段）', () => {
    const element = new FakeAudio();
    const item = track('Immersed');
    const second = item.segments[1]!;
    render(
      <AccompanimentPlayer
        track={item}
        segmentIndex={2}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    expect(screen.getByText(/第 2 段/)).toBeInTheDocument();
    const expectedStart = `${String(Math.floor(second.startMs / 60_000)).padStart(2, '0')}:${String(
      Math.floor((second.startMs % 60_000) / 1000),
    ).padStart(2, '0')}`;
    expect(document.body.textContent).toContain(expectedStart);
  });

  it('播放/暂停按钮带 aria-label，点击真的播放/暂停', async () => {
    const element = new FakeAudio();
    render(
      <AccompanimentPlayer
        track={track('Immersed')}
        segmentIndex={1}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '播放本段伴奏' }));
    });
    expect(element.play).toHaveBeenCalledTimes(1);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    });
    expect(element.pause).toHaveBeenCalled();
  });

  it('段内进度用文字给出（不依赖进度条颜色），并在段尾自动停止', async () => {
    const element = new FakeAudio();
    const onSegmentEnded = vi.fn();
    const item = track('Immersed');
    const first = item.segments[0]!;
    render(
      <AccompanimentPlayer
        track={item}
        segmentIndex={1}
        onSegmentEnded={onSegmentEnded}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '播放本段伴奏' }));
    });
    await act(async () => {
      element.seekTo(first.startMs + 3_000);
    });
    expect(screen.getByText(/本段 00:03/)).toBeInTheDocument();

    await act(async () => {
      element.seekTo(first.endMs + 40);
    });
    expect(onSegmentEnded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '播放本段伴奏' })).toBeInTheDocument();
  });

  it('显示响度归一增益（说明三首之间的等响口径，不是凭空调音量）', () => {
    const element = new FakeAudio();
    render(
      <AccompanimentPlayer
        track={track('Immersed')}
        segmentIndex={1}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    // Immersed 的归一增益是 +2.96 dB
    expect(screen.getByText(/\+2\.96 dB/)).toBeInTheDocument();
    expect(screen.getByText(/响度归一/)).toBeInTheDocument();
  });

  it('段号不存在时给可读提示而不是空白', () => {
    const element = new FakeAudio();
    render(
      <AccompanimentPlayer
        track={track('Immersed')}
        segmentIndex={9}
        environment={{ createElement: () => element, applyGain: vi.fn() }}
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/没有这一段|段号/);
  });
});

describe('LibraryAttribution（CC BY 4.0 署名）', () => {
  it('展示署名正文：作者、来源、许可名，并标注改编(remix)', () => {
    render(<LibraryAttribution tracks={metadata.tracks} />);

    // 作者/来源在"署名正文"与"逐首列表"里各出现一次（两处都是 CC BY 要求的），故用 getAllByText
    expect(screen.getAllByText(/Kevin MacLeod/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/incompetech\.com/).length).toBeGreaterThan(0);
    // 许可名在"署名正文"与"许可链接旁"各出现一次（两处都是 CC BY 的常见写法）
    expect(screen.getAllByText(/Creative Commons Attribution 4\.0/).length).toBeGreaterThan(0);
    expect(screen.getByText(/改编/)).toBeInTheDocument();
  });

  it('许可链接可点击且指向官方许可页（new tab 安全属性齐全）', () => {
    render(<LibraryAttribution tracks={metadata.tracks} />);

    const link = screen.getByRole('link', { name: /CC BY 4\.0|创用 CC|查看许可/ });
    expect(link.getAttribute('href')).toBe(LIBRARY_LICENSE.licenseUrl);
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('列出三首曲目的标题与来源（CC BY 的核心义务：指名道姓）', () => {
    render(<LibraryAttribution tracks={metadata.tracks} />);

    for (const item of metadata.tracks) {
      expect(screen.getByText(new RegExp(item.title))).toBeInTheDocument();
    }
  });

  it("没有任何 emoji（DESIGN.md Do&Don't）", () => {
    render(<LibraryAttribution tracks={metadata.tracks} />);

    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(document.body.textContent ?? '')).toBe(
      false,
    );
  });
});
