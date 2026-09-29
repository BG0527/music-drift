import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './utils';

export interface TabItem {
  key: string;
  label: string;
  /** 面板内容（可选；不提供时渲染空面板，调用方按 activeKey 自行渲染）。 */
  content?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  /** 受控当前项 */
  value?: string;
  defaultValue?: string;
  onChange?: (key: string) => void;
  className?: string;
}

/**
 * Tabs（公海三入口）：tablist / tab / tabpanel + 方向键可达；tab 触控高度 ≥44px。
 *
 * record-v1 的选中语态（DESIGN.md §Components 导航条）：**当前项用 coral 指示 —— 1px 细线 + 字重 500**，
 * 而不是上一版的实心药丸。竖排导航里那根线是竖的，横排 tablist 里就是 tablist 下沿那道 1px ——
 * 同一件"被点亮的沟槽"：coral 压 ink 4.76:1（≥3:1，非文本图形下限）。
 */
export function Tabs({ items, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? items[0]?.key ?? '');
  const activeKey = value ?? internal;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (key: string) => {
    if (value === undefined) setInternal(key);
    onChange?.(key);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    let next: number;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else return;
    event.preventDefault();
    const target = items[next];
    if (target === undefined) return;
    select(target.key);
    tabRefs.current[next]?.focus();
  };

  const active = items.find((item) => item.key === activeKey) ?? items[0];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div role="tablist" className="flex flex-wrap gap-x-6 border-b border-hairline">
        {items.map((item, index) => {
          const selected = item.key === active?.key;
          return (
            <button
              key={item.key}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.key}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'min-h-11 rounded-none border-b border-transparent px-1 text-[0.875rem] font-medium',
                'focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                // feedback（motion-web §1）：选中态原来是瞬变，颜色过渡让「切到哪一档」看得见
                'transition-colors duration-200 ease-out',
                // W18.5 · A6：按下 1px —— 触屏没有 hover，这个 active 是唯一的即时回应
                'active:translate-y-px',
                selected ? 'border-coral text-coral' : 'text-muted hover:text-paper',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={active === undefined ? undefined : `${baseId}-panel-${active.key}`}
        aria-labelledby={active === undefined ? undefined : `${baseId}-tab-${active.key}`}
        className="rounded-base border border-hairline bg-ink p-4"
      >
        {active?.content ?? null}
      </div>
    </div>
  );
}
