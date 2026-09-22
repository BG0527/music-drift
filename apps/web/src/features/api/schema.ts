/**
 * 契约组合子：把「列表」与「游标分页」两件外壳套在 `packages/shared` 的单项契约上。
 *
 * 为什么不用 zod 的 `z.array` / `z.object`：`apps/web` 不是 zod 的依赖方（zod 在 shared / api 侧），
 * 而契约 schema 本身就是一个 `{ safeParse }` 结构。为了两个组合子去改依赖基线不划算
 * （AGENTS.md §7）；这里只做**形状检查**，字段级规则仍然全部由共享契约负责，不存在第二套真相。
 */
import type { ResponseSchema } from './client';

export function arrayOf<T>(item: ResponseSchema<T>): ResponseSchema<T[]> {
  return {
    safeParse: (input: unknown) => {
      if (!Array.isArray(input)) {
        return { success: false, error: new Error('期望数组响应') };
      }
      const items: T[] = [];
      for (const entry of input) {
        const parsed = item.safeParse(entry);
        if (!parsed.success) return { success: false, error: parsed.error };
        items.push(parsed.data);
      }
      return { success: true, data: items };
    },
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export function pageOf<T>(item: ResponseSchema<T>): ResponseSchema<Page<T>> {
  return {
    safeParse: (input: unknown) => {
      if (typeof input !== 'object' || input === null) {
        return { success: false, error: new Error('期望分页响应') };
      }
      const record = input as { items?: unknown; nextCursor?: unknown };
      if (!Array.isArray(record.items)) {
        return { success: false, error: new Error('分页响应缺少 items 数组') };
      }
      if (record.nextCursor !== null && typeof record.nextCursor !== 'string') {
        return { success: false, error: new Error('分页响应的 nextCursor 必须是字符串或 null') };
      }
      const parsed = arrayOf(item).safeParse(record.items);
      if (!parsed.success) return { success: false, error: parsed.error };
      return { success: true, data: { items: parsed.data, nextCursor: record.nextCursor } };
    },
  };
}
