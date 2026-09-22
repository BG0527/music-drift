/**
 * 音频容器嗅探（魔数识别，只看文件头十几字节）。
 *
 * 用途：拦「声明一种容器、实际塞另一种内容」的上传。
 * 只做**容器识别**，不解析时长 —— 理由写在测试文件头部：
 * Chrome 的 `MediaRecorder` 产出的 webm 常常不写 `Duration` 元素，
 * 按容器内部推算时长会得到"大部分文件无法核实"的假保险，反而掩盖真实风险。
 * 时长由客户端上报并由服务端按 15–30 秒校验（见 `ingest.ts` 的 `durationVerified`）。
 */
import { normalizeMimeType } from '@music-drift/shared/audio';

export type AudioContainer = 'webm' | 'mp4' | 'ogg' | 'wav' | 'unknown';

/** 白名单 MIME → 容器；不在白名单返回 null。 */
export function containerOfMime(mime: string | null | undefined): AudioContainer | null {
  switch (normalizeMimeType(mime)) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
      return 'mp4';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    default:
      return null;
  }
}

const matchesAscii = (bytes: Uint8Array, offset: number, text: string): boolean => {
  if (bytes.byteLength < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
};

/** 文件头嗅探；无法识别返回 `'unknown'`（调用方据此拒绝，而不是放行）。 */
export function sniffAudioContainer(bytes: Uint8Array): AudioContainer {
  const header = bytes.subarray(0, 16);
  // WebM / Matroska：EBML 头 0x1A45DFA3
  if (
    header.byteLength >= 4 &&
    header[0] === 0x1a &&
    header[1] === 0x45 &&
    header[2] === 0xdf &&
    header[3] === 0xa3
  ) {
    return 'webm';
  }
  // MP4 / M4A：偏移 4 起是 `ftyp` box
  if (matchesAscii(header, 4, 'ftyp')) return 'mp4';
  // Ogg（Opus/Vorbis）
  if (matchesAscii(header, 0, 'OggS')) return 'ogg';
  // WAV：`RIFF` + 4 字节长度 + `WAVE`
  if (matchesAscii(header, 0, 'RIFF') && matchesAscii(header, 8, 'WAVE')) return 'wav';
  return 'unknown';
}
