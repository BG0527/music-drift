/**
 * 本机瓶子索引 —— 「我的漂流瓶漂到哪了」的**导航书签**。
 *
 * 为什么存在：服务端目前**没有**「列出我参与过的瓶子」的接口（`docs/api.md` §2 只有
 * `/api/me/anonymous-codes` / `/api/me/badges` / `/api/me/collections`；已在 T3.2 回报里登记为缺口）。
 * 页面上要能回到自己的漂流日志，就必须有 id；于是这台设备把自己投出/接过的瓶子 id 记下来。
 *
 * 边界（很重要，不要把它当业务数据源）：
 * - 「漂到哪了」的内容**一律来自服务端**（`GET /api/bottles/:id/events`），这里只存 id 与曲名；
 * - 换浏览器 / 清缓存就看不见了 —— 页面文案必须如实说明这一点，不得暗示这是账号级数据；
 * - 存储不可用（隐私模式、配额满）时**静默降级成"记不住"**，绝不抛错、绝不白屏。
 */

export const BOTTLE_INDEX_STORAGE_KEY = 'mdb.bottle-index.v1';

/** 书签上限：只当导航用，不需要无限长。 */
export const BOTTLE_INDEX_LIMIT = 20;

export interface StoragePort {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export type BottleRole = 'INITIATOR' | 'RELAY';

export interface RememberedBottle {
  id: string;
  songTitle: string;
  role: BottleRole;
  /** 最后一次与它打交道的时间（ISO），用于倒序排列。 */
  lastSeenAt: string;
}

export interface RememberBottleInput {
  id: string;
  songTitle: string;
  role: BottleRole;
  at: string;
}

const ROLE_ORDER: Record<BottleRole, number> = { INITIATOR: 0, RELAY: 1 };

function isRole(value: unknown): value is BottleRole {
  return value === 'INITIATOR' || value === 'RELAY';
}

function isEntry(value: unknown): value is RememberedBottle {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry['id'] === 'string' &&
    entry['id'].length > 0 &&
    typeof entry['songTitle'] === 'string' &&
    entry['songTitle'].length > 0 &&
    isRole(entry['role']) &&
    typeof entry['lastSeenAt'] === 'string' &&
    entry['lastSeenAt'].length > 0
  );
}

function sortAndCap(entries: readonly RememberedBottle[]): RememberedBottle[] {
  return [...entries]
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, BOTTLE_INDEX_LIMIT);
}

function write(storage: StoragePort, entries: readonly RememberedBottle[]): void {
  try {
    storage.setItem(BOTTLE_INDEX_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 隐私模式 / 配额满 / SSR：只是记不住，不影响任何主流程
  }
}

function read(storage: StoragePort): RememberedBottle[] {
  let raw: string | null;
  try {
    raw = storage.getItem(BOTTLE_INDEX_STORAGE_KEY);
  } catch {
    return [];
  }
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEntry);
}

export function listRememberedBottles(storage: StoragePort): RememberedBottle[] {
  return sortAndCap(read(storage));
}

/**
 * 记下一个瓶子（幂等）。
 * 合并规则：`lastSeenAt` 取最新；**发起者身份不降级**（你是发起者就一直显示发起者，
 * 免得后来接唱了一次就把「我发起的」标记丢掉）。
 */
export function rememberBottle(
  storage: StoragePort,
  input: RememberBottleInput,
): RememberedBottle[] {
  const existing = read(storage);
  const previous = existing.find((entry) => entry.id === input.id);
  const merged: RememberedBottle = {
    id: input.id,
    songTitle: input.songTitle.length > 0 ? input.songTitle : (previous?.songTitle ?? ''),
    role:
      previous === undefined
        ? input.role
        : ROLE_ORDER[previous.role] <= ROLE_ORDER[input.role]
          ? previous.role
          : input.role,
    lastSeenAt:
      previous !== undefined && previous.lastSeenAt.localeCompare(input.at) > 0
        ? previous.lastSeenAt
        : input.at,
  };
  const next = sortAndCap([merged, ...existing.filter((entry) => entry.id !== input.id)]);
  write(storage, next);
  return next;
}

export function forgetBottle(storage: StoragePort, id: string): RememberedBottle[] {
  const next = read(storage).filter((entry) => entry.id !== id);
  write(storage, sortAndCap(next));
  return sortAndCap(next);
}

/** 记忆失效的存储（无法读写时用它，调用方不需要到处判空）。 */
export const NULL_STORAGE: StoragePort = {
  getItem: () => null,
  setItem: () => undefined,
};

/** 浏览器 `localStorage`（拿不到就退化成"记不住"）。 */
export function browserBottleStorage(): StoragePort {
  try {
    const storage = globalThis.localStorage as StoragePort | undefined;
    if (storage === undefined || typeof storage.getItem !== 'function') return NULL_STORAGE;
    return storage;
  } catch {
    return NULL_STORAGE;
  }
}
