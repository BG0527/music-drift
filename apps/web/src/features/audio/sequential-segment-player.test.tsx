import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SequentialSegmentPlayer } from './sequential-segment-player';

describe('SequentialSegmentPlayer', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  it('点击一次即按段号连续播放当前全部已有录音，不生成导出或下载入口', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    render(
      <SequentialSegmentPlayer
        segments={[
          { index: 3, src: '/api/segments/c/audio' },
          { index: 1, src: '/api/segments/a/audio' },
          { index: 2, src: '/api/segments/b/audio' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '听全部' }));
    const audio = screen.getByLabelText('全部接唱连续播放');
    expect(audio.getAttribute('src')).toBe('/api/segments/a/audio');
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(1);
    });

    fireEvent.ended(audio);
    expect(audio.getAttribute('src')).toBe('/api/segments/b/audio');
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
    });
    fireEvent.ended(audio);
    expect(audio.getAttribute('src')).toBe('/api/segments/c/audio');
    await waitFor(() => {
      expect(play).toHaveBeenCalledTimes(3);
    });
    expect(screen.queryByRole('link', { name: /下载|导出/ })).toBeNull();
  });

  it('切到下一段时等待新 play resolve，期间只播报准备中', async () => {
    let resolveSecondPlay: (() => void) | undefined;
    const secondPlay = new Promise<void>((resolve) => {
      resolveSecondPlay = resolve;
    });
    let textWhenSecondPlayStarted = '';
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValueOnce()
      .mockImplementationOnce(() => {
        textWhenSecondPlayStarted = document.body.textContent ?? '';
        return secondPlay;
      });
    render(
      <SequentialSegmentPlayer
        segments={[
          { index: 1, src: '/api/segments/a/audio' },
          { index: 2, src: '/api/segments/b/audio' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '听全部' }));
    expect(await screen.findByText(/正在播放第 1 段/)).toBeInTheDocument();
    fireEvent.ended(screen.getByLabelText('全部接唱连续播放'));

    expect(play).toHaveBeenCalledTimes(2);
    expect(textWhenSecondPlayStarted).toContain('正在准备第 2 段');
    expect(screen.getByText('正在准备第 2 段。')).toBeInTheDocument();
    expect(screen.queryByText(/正在播放第 2 段/)).not.toBeInTheDocument();

    await act(async () => {
      resolveSecondPlay?.();
      await secondPlay;
    });
    expect(await screen.findByText(/正在播放第 2 段/)).toBeInTheDocument();
  });

  it('浏览器拒绝 play 时停止队列并显示可读失败，不假报正在播放', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(new Error('blocked'));
    render(
      <SequentialSegmentPlayer segments={[{ index: 1, src: '/api/segments/a/audio' }]} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '听全部' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('第 1 段播放失败，请重试。');
    expect(screen.queryByText(/正在播放/)).not.toBeInTheDocument();
  });

  it('音频元素报错时停止队列并允许用户重试', async () => {
    render(
      <SequentialSegmentPlayer
        segments={[
          { index: 1, src: '/api/segments/a/audio' },
          { index: 2, src: '/api/segments/b/audio' },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '听全部' }));
    const audio = await screen.findByLabelText('全部接唱连续播放');

    fireEvent.error(audio);

    expect(await screen.findByRole('alert')).toHaveTextContent('第 1 段播放失败，请重试。');
    expect(screen.queryByLabelText('全部接唱连续播放')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '听全部' })).toBeEnabled();
  });
});
