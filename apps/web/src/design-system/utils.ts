/** 合并 className：过滤 falsy，去重空白。仅此一个工具函数 —— 不引入 clsx 等新依赖。 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .join(' ');
}
