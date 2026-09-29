import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GrooveStoreContext } from './groove-playback';
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
  const playbackStore = useContext(GrooveStoreContext);
  const ordered = useMemo(() => [...segments].sort((left, right) => left.index - right.index), [segments]);
  const [position, setPosition] = useState<number | null>(null);
  const [completed, setCompleted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [failureIndex, setFailureIndex] = useState<number | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const current = position === null ? undefined : ordered[position];
  const currentSrc = current?.src;
  const currentIndex = current?.index;

  useEffect(() => {
    if (currentSrc === undefined || currentIndex === undefined) return;
    let active = true;
    setPlaying(false);
    setPrepared(false);
    const audio = audioRef.current;
    if (audio !== null) {
      audio.currentTime = 0;
      playbackStore?.claimAudio(audio);
    }
    void audioRef.current?.play().then(
      () => {
        if (active) { setPlaying(true); setPrepared(true); }
      },
      () => {
        if (!active) return;
        setPlaying(false);
        setFailureIndex(currentIndex);
        setPosition(null);
      },
    );
    return () => {
      active = false;
      audio?.pause();
      if (audio !== null) playbackStore?.releaseAudio(audio);
    };
  }, [currentSrc, currentIndex, playRequest, playbackStore]);

  return (
    <div className="sequential-player flex flex-wrap items-center gap-3">
      <Button
        disabled={ordered.length === 0}
        icon={<Icon name="Play" size={18} />}
        onClick={() => {
          setCompleted(false);
          setFailureIndex(null);
          setPrepared(false);
          setPosition(0);
          setPlayRequest((previous) => previous + 1);
        }}
      >
        听全部
      </Button>
      <span aria-label="连续播放段落进度" className="font-latin tabular-nums text-glass">
        {position === null ? (completed ? ordered.length : 0) : position + 1}/{ordered.length}
      </span>
      {current === undefined ? null : (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          src={current.src}
          aria-label="全部接唱连续播放"
          onPlay={(event) => { playbackStore?.claimAudio(event.currentTarget); setPlaying(true); setPrepared(true); }}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            playbackStore?.report({ segmentIndex: current.index,
              positionRatio: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0,
              playbackState: playing ? 'playing' : 'paused' });
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            setPlaying(false);
            setFailureIndex(current.index);
            setPosition(null);
          }}
          onEnded={() => {
            setPlaying(false);
            setPrepared(false);
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
        className="sequential-status w-full text-[0.875rem] text-muted"
      >
        {failureIndex !== null
          ? `第 ${String(failureIndex)} 段播放失败，请重试。`
          : current === undefined
          ? completed
            ? '全部已有录音播放完毕。'
            : `共 ${String(ordered.length)} 段已有录音，按段号顺序播放。`
          : playing
            ? `正在播放第 ${String(current.index)} 段（${String((position ?? 0) + 1)} / ${String(ordered.length)}）。`
            : prepared ? `已暂停第 ${String(current.index)} 段。` : `正在准备第 ${String(current.index)} 段。`}
      </p>
    </div>
  );
}
