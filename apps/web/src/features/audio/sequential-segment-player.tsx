import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon } from '../../design-system';

export interface SequentialSegment {
  index: number;
  src: string;
}

export interface SequentialSegmentPlayerProps {
  segments: readonly SequentialSegment[];
}

/** 一次点击后按固定段号顺序串行播放已有录音；不生成文件、不提供下载。 */
export function SequentialSegmentPlayer({ segments }: SequentialSegmentPlayerProps) {
  const ordered = useMemo(() => [...segments].sort((left, right) => left.index - right.index), [segments]);
  const [position, setPosition] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failureIndex, setFailureIndex] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = position === null ? undefined : ordered[position];

  useEffect(() => {
    if (current === undefined) return;
    let active = true;
    setPlaying(false);
    void audioRef.current?.play().then(
      () => {
        if (active) setPlaying(true);
      },
      () => {
        if (!active) return;
        setPlaying(false);
        setFailureIndex(current.index);
        setPosition(null);
      },
    );
    return () => {
      active = false;
    };
  }, [current]);

  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={ordered.length === 0}
        icon={<Icon name="Play" size={18} />}
        onClick={() => {
          setCompleted(false);
          setFailureIndex(null);
          setPosition(0);
        }}
      >
        听全部
      </Button>
      {current === undefined ? null : (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={current.src}
          aria-label="全部接唱连续播放"
          onError={() => {
            setPlaying(false);
            setFailureIndex(current.index);
            setPosition(null);
          }}
          onEnded={() => {
            setPlaying(false);
            const next = (position ?? 0) + 1;
            if (next < ordered.length) {
              setPosition(next);
            } else {
              setPosition(null);
              setCompleted(true);
            }
          }}
        />
      )}
      <p
        role={failureIndex === null ? 'status' : 'alert'}
        aria-live="polite"
        className="text-[0.875rem] text-muted"
      >
        {failureIndex !== null
          ? `第 ${String(failureIndex)} 段播放失败，请重试。`
          : current === undefined
          ? completed
            ? '全部已有录音播放完毕。'
            : `共 ${String(ordered.length)} 段已有录音，按段号顺序播放。`
          : playing
            ? `正在播放第 ${String(current.index)} 段（${String((position ?? 0) + 1)} / ${String(ordered.length)}）。`
            : `正在准备第 ${String(current.index)} 段。`}
      </p>
    </div>
  );
}
