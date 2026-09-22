/**
 * 音频容器嗅探（魔数识别）单测。
 *
 * 为什么要嗅探：`Content-Type` 是客户端**声明**的，光看它等于信任上传方。
 * 声明 `audio/webm` 却传一段 mp4、或干脆传一段整首歌的 mp3，都必须在入库前拦住
 * （CONTEXT §3.1 每段 15–30 秒；D-02 音频进 bytea，脏数据会一直躺着）。
 *
 * 这里只读文件头（EBML / ftyp / OggS / RIFF…WAVE），不解析容器内部 —— 便宜、无法被构造的
 * 压缩炸弹拖死，也不会因为"某浏览器的 webm 少写 Duration 元素"而误判。
 */
import { existsSync, openSync, readSync, closeSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { containerOfMime, sniffAudioContainer } from './sniff';

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

/** 头部 ASCII 标记 + 后续字节（与真实文件一致：标记在最前面）。 */
function ascii(text: string, rest: number[] = []): Uint8Array {
  return new Uint8Array([...Array.from(text, (char) => char.charCodeAt(0)), ...rest]);
}

describe('sniffAudioContainer', () => {
  it('识别 WebM/Matroska（EBML 头 1A 45 DF A3）', () => {
    expect(sniffAudioContainer(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02, 0x03, 0x04))).toBe('webm');
  });

  it('识别 Ogg（OggS）', () => {
    expect(sniffAudioContainer(ascii('OggS', [0x00, 0x02]))).toBe('ogg');
  });

  it('识别 WAV（RIFF .... WAVE）', () => {
    const wav = new Uint8Array(16);
    wav.set(ascii('RIFF'), 0);
    wav.set(ascii('WAVE'), 8);
    expect(sniffAudioContainer(wav)).toBe('wav');
  });

  it('识别 MP4/M4A（偏移 4 起是 ftyp box）', () => {
    const mp4 = new Uint8Array(24);
    mp4.set(new Uint8Array([0x00, 0x00, 0x00, 0x18]), 0);
    mp4.set(ascii('ftyp'), 4);
    expect(sniffAudioContainer(mp4)).toBe('mp4');
  });

  it('RIFF 但不是 WAVE（例如 AVI）→ unknown（不能因为 RIFF 就放行）', () => {
    const avi = new Uint8Array(16);
    avi.set(ascii('RIFF'), 0);
    avi.set(ascii('AVI '), 8);
    expect(sniffAudioContainer(avi)).toBe('unknown');
  });

  it('MP3 帧同步 / ID3 标签 → unknown（整首歌不进这个白名单）', () => {
    expect(sniffAudioContainer(bytes(0xff, 0xfb, 0x90, 0x00))).toBe('unknown');
    expect(sniffAudioContainer(ascii('ID3', [0x03, 0x00]))).toBe('unknown');
  });

  it('空 / 过短 / 随机字节 → unknown（不抛异常）', () => {
    expect(sniffAudioContainer(new Uint8Array(0))).toBe('unknown');
    expect(sniffAudioContainer(bytes(0x1a, 0x45))).toBe('unknown');
    expect(sniffAudioContainer(new Uint8Array([7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7]))).toBe(
      'unknown',
    );
  });

  it('真实文件：仓库里的伴奏 mp3 被识别为未知容器（因此上传时会被拒）', () => {
    const mp3Path = new URL('../../../../web/public/library/Immersed.mp3', import.meta.url);
    if (!existsSync(mp3Path)) {
      // 曲库素材本地缺失时不算失败（它属 t13 / 阶段二），但也别假装验过
      return;
    }
    const fd = openSync(mp3Path, 'r');
    try {
      const head = new Uint8Array(16);
      const read = readSync(fd, head, 0, 16, 0);
      expect(read).toBe(16);
      expect(sniffAudioContainer(head)).toBe('unknown');
    } finally {
      closeSync(fd);
    }
  });
});

describe('containerOfMime', () => {
  it('白名单 MIME 映射到容器（含 codecs 参数）', () => {
    expect(containerOfMime('audio/webm')).toBe('webm');
    expect(containerOfMime('audio/webm;codecs=opus')).toBe('webm');
    expect(containerOfMime('AUDIO/MP4')).toBe('mp4');
    expect(containerOfMime('audio/ogg')).toBe('ogg');
    expect(containerOfMime('audio/wav')).toBe('wav');
  });

  it('未知 / 缺失 MIME → null', () => {
    expect(containerOfMime('audio/mpeg')).toBeNull();
    expect(containerOfMime('')).toBeNull();
    expect(containerOfMime(null)).toBeNull();
    expect(containerOfMime(undefined)).toBeNull();
  });
});
