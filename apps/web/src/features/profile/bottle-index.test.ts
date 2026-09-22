import { describe, expect, it } from 'vitest';
import {
  BOTTLE_INDEX_LIMIT,
  forgetBottle,
  listRememberedBottles,
  rememberBottle,
  type StoragePort,
} from './bottle-index';

function memoryStorage(seed: string | null = null): StoragePort & { raw: () => string | null } {
  let value = seed;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    raw: () => value,
  };
}

const A = { id: 'aaaaaaaa-0000-4000-8000-000000000001', songTitle: '深海鲸落' };
const B = { id: 'bbbbbbbb-0000-4000-8000-000000000002', songTitle: '潮汐回声' };

/**
 * 「我的瓶子漂到哪了」的内容**全部来自服务端**（`GET /api/bottles/:id/events`）。
 * 这份索引只是**导航书签**：服务端目前没有「列出我参与过的瓶子」的接口（已在 T3.2 回报里登记为缺口），
 * 所以这台设备把自己投出/接过的瓶子 id 记下来，方便回到自己的漂流日志。
 */
describe('本机瓶子索引（导航书签，不是业务数据源）', () => {
  it('记下之后能按最近使用倒序列出', () => {
    const storage = memoryStorage();
    rememberBottle(storage, { ...A, role: 'INITIATOR', at: '2026-09-23T01:00:00.000Z' });
    rememberBottle(storage, { ...B, role: 'RELAY', at: '2026-09-23T02:00:00.000Z' });
    expect(listRememberedBottles(storage).map((entry) => entry.id)).toEqual([B.id, A.id]);
  });

  it('同一个瓶子重复记只保留一条（更新时间取最新，角色不降级）', () => {
    const storage = memoryStorage();
    rememberBottle(storage, { ...A, role: 'INITIATOR', at: '2026-09-23T01:00:00.000Z' });
    rememberBottle(storage, { ...A, role: 'RELAY', at: '2026-09-23T03:00:00.000Z' });
    const list = listRememberedBottles(storage);
    expect(list).toHaveLength(1);
    expect(list[0]!.role).toBe('INITIATOR');
    expect(list[0]!.lastSeenAt).toBe('2026-09-23T03:00:00.000Z');
  });

  it('超过上限时丢掉最旧的（不让书签无限长）', () => {
    const storage = memoryStorage();
    for (let index = 0; index < BOTTLE_INDEX_LIMIT + 3; index += 1) {
      rememberBottle(storage, {
        id: `cccccccc-0000-4000-8000-${String(index).padStart(12, '0')}`,
        songTitle: `第${String(index)}首`,
        role: 'RELAY',
        at: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
      });
    }
    const list = listRememberedBottles(storage);
    expect(list).toHaveLength(BOTTLE_INDEX_LIMIT);
    expect(list[0]!.songTitle).toBe(`第${String(BOTTLE_INDEX_LIMIT + 2)}首`);
  });

  it('存储里是脏数据时返回空数组（绝不因为书签坏掉而白屏）', () => {
    expect(listRememberedBottles(memoryStorage('{ not json'))).toEqual([]);
    expect(listRememberedBottles(memoryStorage('{"a":1}'))).toEqual([]);
    expect(listRememberedBottles(memoryStorage('[{"id":"x"}]'))).toEqual([]);
  });

  it('存储不可写（隐私模式 / 配额满）时不抛错，只是记不住', () => {
    const hostile: StoragePort = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };
    expect(() =>
      rememberBottle(hostile, { ...A, role: 'INITIATOR', at: '2026-09-23T01:00:00.000Z' }),
    ).not.toThrow();
    expect(listRememberedBottles(hostile)).toEqual([]);
  });

  it('可以主动移除一条（用户不想再看到它）', () => {
    const storage = memoryStorage();
    rememberBottle(storage, { ...A, role: 'INITIATOR', at: '2026-09-23T01:00:00.000Z' });
    rememberBottle(storage, { ...B, role: 'RELAY', at: '2026-09-23T02:00:00.000Z' });
    expect(forgetBottle(storage, A.id).map((entry) => entry.id)).toEqual([B.id]);
  });
});
