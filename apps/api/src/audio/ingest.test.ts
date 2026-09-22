/**
 * 上传入库前的校验单测（服务端**不信任客户端**）。
 *
 * 这一层是 t9 的 `POST /api/bottles/:id/segments` 落地时唯一的音频守门人：
 * 声明 MIME、体积、真实容器、声明时长四道关，全部走 `packages/shared/src/audio`
 * 的同一套规则与文案（前端提前拦过一遍，这里是第二遍）。
 */
import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, SEGMENT_MAX_MS } from '@music-drift/shared/audio';
import { validateSegmentAudioUpload } from './ingest';

const WEBM_HEAD = [0x1a, 0x45, 0xdf, 0xa3];
const MP4_HEAD = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70];

function payload(head: number[], size = 120 * 1024): Uint8Array {
  const buffer = new Uint8Array(size);
  buffer.set(head, 0);
  return buffer;
}

const WEBM = payload(WEBM_HEAD);
const DURATION_OK = 20_000;

describe('validateSegmentAudioUpload：通过', () => {
  it('webm/opus + 20 秒 → 通过，并给出归一化后的 MIME（落库用规范值，不带 codecs 参数）', () => {
    const result = validateSegmentAudioUpload({
      mime: 'audio/webm;codecs=opus',
      bytes: WEBM,
      durationMs: DURATION_OK,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.mime).toBe('audio/webm');
    expect(result.value.container).toBe('webm');
    expect(result.value.durationMs).toBe(DURATION_OK);
    expect(result.value.byteSize).toBe(WEBM.byteLength);
    expect(result.value.durationVerified).toBe(true);
  });

  it('Safari 的 mp4/AAC 路径同样通过（D-10：Chromium + WebKit 双必须）', () => {
    const result = validateSegmentAudioUpload({
      mime: 'audio/mp4',
      bytes: payload(MP4_HEAD, 300 * 1024),
      durationMs: 25_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.container).toBe('mp4');
  });
});

describe('validateSegmentAudioUpload：拒绝（422 规则违反）', () => {
  const codesOf = (input: Parameters<typeof validateSegmentAudioUpload>[0]): string[] => {
    const result = validateSegmentAudioUpload(input);
    return result.ok ? [] : result.violations.map((violation) => violation.code);
  };

  it('时长越界：14999 拒 / 15000 过 / 30001 拒', () => {
    const base = { mime: 'audio/webm', bytes: WEBM };
    expect(codesOf({ ...base, durationMs: 14_999 })).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
    expect(codesOf({ ...base, durationMs: 15_000 })).toEqual([]);
    expect(codesOf({ ...base, durationMs: 30_000 })).toEqual([]);
    expect(codesOf({ ...base, durationMs: 30_001 })).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);
  });

  it('缺失时长默认拒（服务端要能核对 15–30 秒；`requireDuration: false` 才放行并标注未核实）', () => {
    const base = { mime: 'audio/webm', bytes: WEBM };

    expect(codesOf({ ...base, durationMs: null })).toEqual(['AUDIO_DURATION_OUT_OF_RANGE']);

    const lax = validateSegmentAudioUpload(
      { ...base, durationMs: null },
      { requireDuration: false },
    );
    expect(lax.ok).toBe(true);
    if (!lax.ok) return;
    expect(lax.value.durationVerified).toBe(false);
    expect(lax.value.durationMs).toBeNull();
  });

  it('空音频 → AUDIO_MISSING', () => {
    expect(
      codesOf({ mime: 'audio/webm', bytes: new Uint8Array(0), durationMs: DURATION_OK }),
    ).toEqual(['AUDIO_MISSING']);
  });

  it('体积超限 → AUDIO_TOO_LARGE', () => {
    expect(
      codesOf({
        mime: 'audio/webm',
        bytes: payload(WEBM_HEAD, MAX_AUDIO_BYTES + 1),
        durationMs: DURATION_OK,
      }),
    ).toEqual(['AUDIO_TOO_LARGE']);
  });

  it('非白名单 MIME（例如整首歌的 audio/mpeg）→ AUDIO_FORMAT_UNSUPPORTED', () => {
    expect(codesOf({ mime: 'audio/mpeg', bytes: WEBM, durationMs: DURATION_OK })).toEqual([
      'AUDIO_FORMAT_UNSUPPORTED',
    ]);
    expect(codesOf({ mime: null, bytes: WEBM, durationMs: DURATION_OK })).toEqual([
      'AUDIO_FORMAT_UNSUPPORTED',
    ]);
  });

  it('声明与内容不符（声称 webm、实际 mp4）→ AUDIO_CONTAINER_MISMATCH', () => {
    expect(
      codesOf({ mime: 'audio/webm', bytes: payload(MP4_HEAD), durationMs: DURATION_OK }),
    ).toEqual(['AUDIO_CONTAINER_MISMATCH']);
  });

  it('内容无法识别（既不是 webm 也不是 mp4…）→ AUDIO_CONTAINER_MISMATCH', () => {
    expect(
      codesOf({
        mime: 'audio/webm',
        bytes: payload([0xff, 0xfb, 0x90, 0x00]),
        durationMs: DURATION_OK,
      }),
    ).toEqual(['AUDIO_CONTAINER_MISMATCH']);
  });

  it('一次报全：空 + 格式不对 + 时长不对 → 三条一起给', () => {
    expect(codesOf({ mime: 'video/mp4', bytes: new Uint8Array(0), durationMs: 9_000 })).toEqual([
      'AUDIO_MISSING',
      'AUDIO_FORMAT_UNSUPPORTED',
      'AUDIO_DURATION_OUT_OF_RANGE',
    ]);
  });

  it('拒绝时的文案是中文且给出修正动作（码给程序、文案给人）', () => {
    const result = validateSegmentAudioUpload({
      mime: 'audio/webm',
      bytes: WEBM,
      durationMs: SEGMENT_MAX_MS + 5_000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.violations[0]?.message).toContain('15');
    expect(result.violations[0]?.message).toContain('30');
    expect(result.violations[0]?.message).toContain('重新录制');
  });
});
