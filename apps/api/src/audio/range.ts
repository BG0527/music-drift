/**
 * `Range` 请求头解析（RFC 7233 的**必要子集**，纯函数）。
 *
 * 为什么需要它：分段试听必须支持 206 + `Content-Range`，否则
 * ① 拖动进度条会重新下载整段（20 秒 m4a 够明显）；
 * ② Safari 对 `<audio>` 的元数据探测（先取末尾几百字节）会卡住不播。
 *
 * 设计取舍（写在这里，避免被当成 bug 修）：
 * - **不发 `multipart/byteranges`**：多段请求直接忽略 Range 头、整段下发（RFC 允许 "MAY ignore"）。
 *   本场景客户端只会请求单段，多段响应会把实现复杂度与出错面放大几十倍。
 * - **语法错误 ≠ 416**：语法非法（单位不对、start > end、非数字）按 RFC "ignore the header" 处理；
 *   只有**语法合法但落在实体之外**才 416 + `Content-Range: bytes * /size`。
 * - `size <= 0` 一律 `unsatisfiable`（调用方在此之前就该 404；这里保底不返回负数区间）。
 */

export type ByteRange =
  /** 全量 200。 */
  | { kind: 'full' }
  /** 部分 206；`start`/`end` 为**闭区间**，且已按实体长度截断。 */
  | { kind: 'partial'; start: number; end: number }
  /** 416；响应必须带 `Content-Range: bytes * /size`。 */
  | { kind: 'unsatisfiable' };

/** 只接受纯十进制数字（拒绝 `1.5` / `1e3` / `+1` / `-1` / 空串）。 */
function parsePosition(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseRangeHeader(header: string | null | undefined, size: number): ByteRange {
  if (!Number.isFinite(size) || size <= 0) return { kind: 'unsatisfiable' };
  if (typeof header !== 'string') return { kind: 'full' };

  const trimmed = header.trim();
  if (trimmed === '') return { kind: 'full' };

  const separator = trimmed.indexOf('=');
  if (separator < 0) return { kind: 'full' };

  if (trimmed.slice(0, separator).trim().toLowerCase() !== 'bytes') return { kind: 'full' };

  const spec = trimmed.slice(separator + 1).trim();
  // 空、多段（`0-99,200-299`）→ 忽略
  if (spec === '' || spec.includes(',')) return { kind: 'full' };

  const dash = spec.indexOf('-');
  if (dash < 0) return { kind: 'full' };

  const rawStart = spec.slice(0, dash).trim();
  const rawEnd = spec.slice(dash + 1).trim();

  if (rawStart === '') {
    // 后缀区间：bytes=-N → 最后 N 字节
    const suffix = parsePosition(rawEnd);
    if (suffix === null) return { kind: 'full' };
    if (suffix === 0) return { kind: 'unsatisfiable' };
    if (suffix >= size) return { kind: 'partial', start: 0, end: size - 1 };
    return { kind: 'partial', start: size - suffix, end: size - 1 };
  }

  const start = parsePosition(rawStart);
  if (start === null) return { kind: 'full' };
  if (start >= size) return { kind: 'unsatisfiable' };

  if (rawEnd === '') return { kind: 'partial', start, end: size - 1 };

  const end = parsePosition(rawEnd);
  if (end === null) return { kind: 'full' };
  if (end < start) return { kind: 'full' };

  return { kind: 'partial', start, end: Math.min(end, size - 1) };
}
