/**
 * 口令哈希（D-03 裁决：`node:crypto` 的 `scrypt`，N=2^15 / r=8 / p=1 / salt 32B / keylen 64B）。
 *
 * 设计要点：
 * - **存储格式自描述**：`scrypt$N$r$p$<saltB64url>$<keyB64url>`。参数入库 → 将来提升强度可在线迁移
 *   （老行按自己的参数校验，登录成功后按新参数重写）；
 * - **畸形串返回 false、不抛异常**：存储损坏是「校验失败」，不该变成 500；
 * - 口令明文只进不出：本模块只返回哈希串，调用方不得把入参写进日志（ADR-008）。
 *
 * ⚠️ `maxmem` 是**真必需**，不是保险（captain 2026-09-23 实测，务必别删）：
 *
 * | 事实 | 值 |
 * | --- | --- |
 * | 128 × N × r（N=32768, r=8） | 33,554,432 B = **恰好 32.0 MiB** |
 * | Node 默认 `maxmem` | 33,554,432 B —— **与上式相等** |
 * | 按文档字面判据 `128*N*r > maxmem` | False（**按字面应当不触发**） |
 * | **实测：不传 `maxmem`** | **抛 `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`** |
 * | **实测：传 `maxmem: 64 MiB` 或更大** | 成功 |
 *
 * 即：**「恰好相等」也会抛**（实测如此，非理论推断）。后人看到 `128*N*r` 正好等于 Node 默认值
 * 时极易判定此参数多余而删除，然后原地再踩一次 —— 因此这里显式给 4 倍余量并留下结论。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** D-03 冻结的生产参数。 */
export const SCRYPT_PARAMS: ScryptParams = { N: 32768, r: 8, p: 1 };
export const SALT_BYTES = 32;
export const KEY_BYTES = 64;

/** 存储格式前缀（换算法时才有必要改）。 */
const ALGORITHM = 'scrypt';
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * `maxmem` 下限：`128·N·r` 的 4 倍。
 * 为什么不是 2 倍：Node 除了主缓冲区还要临时空间，实测 2 倍也可能贴边；
 * 4 倍对 N=2^15 是 128 MiB 的**上限声明**（不是分配），对内存无实际压力。
 */
function maxmemFor(params: ScryptParams): number {
  return 128 * params.N * params.r * 4;
}

export interface HashPasswordOptions {
  /** 覆盖参数（仅测试与将来迁移使用；生产走 `SCRYPT_PARAMS`）。 */
  params?: ScryptParams | undefined;
  /** 显式 salt（测试可复现）；缺省 `randomBytes(32)`。 */
  salt?: Buffer | undefined;
}

export function hashPassword(password: string, options: HashPasswordOptions = {}): string {
  const params = options.params ?? SCRYPT_PARAMS;
  const salt = options.salt ?? randomBytes(SALT_BYTES);
  const key = derive(password, salt, params);
  return [
    ALGORITHM,
    String(params.N),
    String(params.r),
    String(params.p),
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

export interface ParsedPasswordHash {
  params: ScryptParams;
  salt: Buffer;
  key: Buffer;
}

/** 解析失败一律 `null`（不抛）：调用方把它当作「校验不通过」。 */
export function parsePasswordHash(stored: string): ParsedPasswordHash | null {
  const parts = stored.split('$');
  if (parts.length !== 6) {
    return null;
  }
  const [algorithm, n, r, p, saltPart, keyPart] = parts;
  if (algorithm !== ALGORITHM || n === undefined || r === undefined || p === undefined) {
    return null;
  }
  const N = Number.parseInt(n, 10);
  const rValue = Number.parseInt(r, 10);
  const pValue = Number.parseInt(p, 10);
  if (!isPositiveInt(N) || !isPositiveInt(rValue) || !isPositiveInt(pValue)) {
    return null;
  }
  if (saltPart === undefined || keyPart === undefined) {
    return null;
  }
  if (!BASE64URL.test(saltPart) || !BASE64URL.test(keyPart)) {
    return null;
  }
  const salt = Buffer.from(saltPart, 'base64url');
  const key = Buffer.from(keyPart, 'base64url');
  if (salt.length === 0 || key.length === 0) {
    return null;
  }
  return { params: { N, r: rValue, p: pValue }, salt, key };
}

export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parsePasswordHash(stored);
  if (parsed === null) {
    return false;
  }
  let candidate: Buffer;
  try {
    candidate = derive(password, parsed.salt, parsed.params);
  } catch {
    // 参数越界等极端情况：按校验失败处理（不泄漏内部错误）。
    return false;
  }
  if (candidate.length !== parsed.key.length) {
    return false;
  }
  return timingSafeEqual(candidate, parsed.key);
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function derive(password: string, salt: Buffer, params: ScryptParams): Buffer {
  return scryptSync(password, salt, KEY_BYTES, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmemFor(params),
  });
}
