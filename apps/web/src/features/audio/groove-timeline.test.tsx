/**
 * 沟槽时间轴 + 唱针（用户第 3 轮裁决：把公海详情页顶部的"类似进度条的东西"复刻进瓶子详情）。
 *
 * 语义边界（deploy-plan §17.1，别和瓶身剖面搞混）：
 * - **瓶身剖面**（RelayTimeline）回答"哪些段录了、缺哪段"；
 * - **本组件**回答"现在放到哪儿、这一段多长"：唱针 = 播放头（DESIGN.md：唱针 = 播放头），
 *   跟随**真实播放进度**（timeupdate → 段内位置），段边界与段号来自服务端数据。
 */
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GroovePlaybackProvider,
  GrooveTimeline,
} from './groove-timeline';
import { useGrooveReporter, type GroovePlaybackSnapshot } from './groove-playback';

/** 测试双：替播放器把一份播放进度报进 Provider（生产里由 SegmentPlayer 上报）。 */
function PlaybackDriver({ snapshot }: { snapshot: GroovePlaybackSnapshot }) {
  const report = useGrooveReporter();
  useEffect(() => {
    report(snapshot);
  }, [report, snapshot]);
  return null;
}

const SEGMENTS = [
  { index: 1, durationMs: 20_000, ownerCode: '潮汐#3F' },
  { index: 3, durationMs: 21_000, ownerCode: '暗礁#91' },
];

describe('沟槽时间轴：一格 = 一个段位，段号与时长来自真实数据', () => {
  it('4 个段位全在槽上，缺口段显式成槽（不是少一格），时长/静音标注来自数据', () => {
    render(
      <GroovePlaybackProvider>
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );

    const slots = screen.getByTestId('groove-slots');
    expect(slots.querySelectorAll('li')).toHaveLength(4);
    expect(slots.querySelectorAll('li[data-state="gap"]')).toHaveLength(2);
    expect(slots.querySelectorAll('li[data-state="recorded"]')).toHaveLength(2);

    const marks = screen.getByTestId('groove-marks');
    expect(marks).toHaveTextContent('第 1 段');
    expect(marks).toHaveTextContent('00:20');
    // 缺口段在时间轴上可见：暖色"静音"标注（成品里缺口是静音）
    expect(marks).toHaveTextContent('静音');
    expect(marks.querySelectorAll('li[data-state="gap"]')).toHaveLength(2);
  });
});

describe('唱针 = 播放头', () => {
  it('唱针跟随播放进度：正在放第 3 段、段内 50% ⇒ 唱针落在 62.5%（(2+0.5)/4）', () => {
    render(
      <GroovePlaybackProvider>
        <PlaybackDriver
          snapshot={{ segmentIndex: 3, positionRatio: 0.5, playbackState: 'playing' }}
        />
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );

    // 位置经 transform 表达（W18.5 · A5：只动 transform，不再写 left%）
    expect(screen.getByTestId('groove-playhead').style.transform).toBe(
      'translateX(62.5%)',
    );
    // 正在放的那一段用 aria-current 标出（不只靠唱针的位置）
    const current = screen.getByTestId('groove-marks').querySelector('[aria-current]');
    expect(current?.textContent).toContain('第 3 段');
  });

  it('还没有播放器（没有播放进度）时不画唱针', () => {
    render(
      <GroovePlaybackProvider>
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );
    expect(screen.queryByTestId('groove-playhead')).toBeNull();
  });
});

describe('装饰层零信息（读屏不念装饰）', () => {
  it('唱臂与唱针本体 aria-hidden；段位语义由有序列表与 aria-current 承担', () => {
    render(
      <GroovePlaybackProvider>
        <PlaybackDriver
          snapshot={{ segmentIndex: 1, positionRatio: 0, playbackState: 'idle' }}
        />
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );
    expect(screen.getByTestId('groove-arm').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('groove-playhead').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByTestId('groove-slots').tagName).toBe('OL');
  });
});

/**
 * 一屏门禁（§46.3）下的时间轴紧凑化：
 * - 桌面（≥1024）：刻度 meta 行**折叠**（`lg:hidden`，整页高度让位给门禁）；
 * - 窄屏（<1024）：说明文案（次要 meta）收起、唱臂本就不画；
 *   **槽带与段号保留**（折叠 ≠ 删除：窄屏仍能读段号与静音标注）。
 */
describe('一屏门禁：meta 折叠与窄屏紧凑化', () => {
  it('刻度 meta 行桌面折叠、说明文案窄屏收起；槽带与段号两边都还在', () => {
    render(
      <GroovePlaybackProvider>
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );

    const marks = screen.getByTestId('groove-marks');
    expect(marks.className, '刻度 meta 行必须桌面折叠').toContain('lg:hidden');

    const desc = screen.getByText('唱针跟着播放走；一格 = 一个段位，缺口留成静音。');
    expect(desc.className, '说明文案窄屏必须收起').toContain('hidden');
    expect(desc.className, '桌面仍显示说明文案').toContain('lg:inline');

    // 折叠 ≠ 删除：槽带（槽位列表）与段号在任何断点都渲染
    expect(screen.getByTestId('groove-slots').querySelectorAll('li')).toHaveLength(4);
    expect(marks.textContent).toContain('第 1 段');
    expect(marks.textContent).toContain('静音');
  });

  it('窄屏不画唱臂（去唱臂）：唱臂 svg 只在 lg 出现', () => {
    render(
      <GroovePlaybackProvider>
        <PlaybackDriver
          snapshot={{ segmentIndex: 1, positionRatio: 0, playbackState: 'playing' }}
        />
        <GrooveTimeline
          segments={SEGMENTS}
          totalSegments={4}
          missingSegmentIndexes={[2, 4]}
        />
      </GroovePlaybackProvider>,
    );
    const arm = screen.getByTestId('groove-arm');
    // svg 的 className 是 SVGAnimatedString，断言走 getAttribute
    const armClass = arm.getAttribute('class') ?? '';
    expect(armClass).toContain('hidden');
    expect(armClass).toContain('lg:block');
  });
});
