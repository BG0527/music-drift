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

/** Tabs（公海三入口）：tablist / tab / tabpanel + 方向键可达；tab 触控高度 ≥44px。 */
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
      <div role="tablist" className="flex flex-wrap gap-2">
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
                'min-h-11 rounded-pill px-4 text-[0.875rem] font-medium',
                'focus-visible:ring-2 focus-visible:ring-peacock focus-visible:ring-offset-2 focus-visible:ring-offset-wave-white',
                // feedback（motion-web §1）：选中态原来是瞬变，颜色过渡让「切到哪一档」看得见
                'transition-colors duration-200 ease-out',
                selected
                  ? 'bg-peacock text-wave-white'
                  : 'border border-driftline bg-transparent text-peacock hover:bg-info-tint',
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
        className="rounded-base border border-mist bg-wave-white p-4"
      >
        {active?.content ?? null}
      </div>
    </div>
  );
}
