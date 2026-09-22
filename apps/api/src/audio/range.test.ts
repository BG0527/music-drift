/**
 * `Range` 请求头解析（RFC 7233）单测 —— 分段试听与拖动进度条都靠它。
 *
 * 这个函数是纯的：输入 `(header, size)`，输出 `full` / `partial` / `unsatisfiable`，
 * 路由层只负责把结论翻译成 200 / 206 / 416。
 *
 * 三种结论对应 RFC 里三种**不同**的处置，混在一处最容易出错：
 * - 语法合法但落在实体之外 → `unsatisfiable`（**416** + `Content-Range: bytes * /size`）；
 * - 语法非法（单位不是 bytes、start > end、非数字、多段）→ **忽略**该头（`full`，200）；
 * - 合法且在范围内 → `partial`（**206**）。
 */
import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from './range';

const SIZE = 1_000;

describe('Range：完整响应（忽略 Range 头 → 200）', () => {
  it('没有 Range 头 / 空串 → 全量', () => {
    expect(parseRangeHeader(undefined, SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader(null, SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('   ', SIZE)).toEqual({ kind: 'full' });
  });

  it('单位不是 bytes → 忽略（RFC：不认识的单位一律忽略，不能报错）', () => {
    expect(parseRangeHeader('items=0-10', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes2=0-10', SIZE)).toEqual({ kind: 'full' });
  });

  it('语法非法 → 忽略（start > end、非数字、超安全整数范围）', () => {
    expect(parseRangeHeader('bytes=10-5', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=abc', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=-', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=0-1.5', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=-1e3', SIZE)).toEqual({ kind: 'full' });
    expect(parseRangeHeader('bytes=0-99999999999999999999', SIZE)).toEqual({ kind: 'full' });
  });

  it('多段请求（bytes=a-b,c-d）→ 忽略并整段下发（RFC 允许，且省掉 multipart/byteranges）', () => {
    expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toEqual({ kind: 'full' });
  });
});

describe('Range：部分响应（206）', () => {
  it('bytes=0-99 → 0..99（含头含尾）', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({ kind: 'partial', start: 0, end: 99 });
  });

  it('bytes=500- → 到结尾', () => {
    expect(parseRangeHeader('bytes=500-', SIZE)).toEqual({
      kind: 'partial',
      start: 500,
      end: 999,
    });
  });

  it('末尾越界被截断到 size-1（不是 416）', () => {
    expect(parseRangeHeader('bytes=900-99999', SIZE)).toEqual({
      kind: 'partial',
      start: 900,
      end: 999,
    });
  });

  it('单字节区间 bytes=0-0 / bytes=999-999', () => {
    expect(parseRangeHeader('bytes=0-0', SIZE)).toEqual({ kind: 'partial', start: 0, end: 0 });
    expect(parseRangeHeader('bytes=999-999', SIZE)).toEqual({
      kind: 'partial',
      start: 999,
      end: 999,
    });
  });

  it('后缀区间 bytes=-100 → 最后 100 字节', () => {
    expect(parseRangeHeader('bytes=-100', SIZE)).toEqual({
      kind: 'partial',
      start: 900,
      end: 999,
    });
  });

  it('后缀比实体还大 → 整个实体（206，不是 416）', () => {
    expect(parseRangeHeader('bytes=-5000', SIZE)).toEqual({
      kind: 'partial',
      start: 0,
      end: 999,
    });
  });

  it('容忍空白（部分客户端会写成 "bytes= 0 - 99 "）', () => {
    expect(parseRangeHeader('bytes= 0 - 99 ', SIZE)).toEqual({
      kind: 'partial',
      start: 0,
      end: 99,
    });
    expect(parseRangeHeader(' BYTES = 0-99', SIZE)).toEqual({
      kind: 'partial',
      start: 0,
      end: 99,
    });
  });
});

describe('Range：不可满足（416）', () => {
  it('起点超出实体长度', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=1000-2000', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('后缀 0 字节（bytes=-0）无意义 → 416', () => {
    expect(parseRangeHeader('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
  });

  it('实体为空（size <= 0）→ 416（服务端会在更早的地方 404，这里保底）', () => {
    expect(parseRangeHeader('bytes=0-99', 0)).toEqual({ kind: 'unsatisfiable' });
    expect(parseRangeHeader('bytes=0-99', -1)).toEqual({ kind: 'unsatisfiable' });
  });
});
