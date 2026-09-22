/**
 * 「这台设备参与过的瓶子」——漂流日志的入口列表。
 *
 * ⚠️ 边界（必须如实告知用户）：这是**本机记录**，不是账号级数据 ——
 * 服务端目前没有"列出我参与过的瓶子"的接口（已在 T3.2 回报里登记为缺口）。
 * 列表里只放 id 与曲名；"漂到哪了"永远来自服务端的漂流日志。
 */
import { useMemo } from 'react';
import { EmptyState, Icon, cn } from '../../design-system';
import { Link } from '../../pages/shell/router';
import {
  browserBottleStorage,
  listRememberedBottles,
  type RememberedBottle,
  type StoragePort,
} from '../profile/bottle-index';

export interface RememberedBottlesProps {
  /** 存储端口（测试注入；生产走 localStorage）。 */
  storage?: StoragePort;
  className?: string;
}

const ROLE_LABEL: Record<RememberedBottle['role'], string> = {
  INITIATOR: '我发起的',
  RELAY: '我接过的',
};

export function RememberedBottles({ storage, className }: RememberedBottlesProps) {
  const port = storage ?? browserBottleStorage();
  // 本机书签是外部存储：直接派生（页面挂载时读一次），不用 effect + setState 造成级联渲染
  const entries: RememberedBottle[] = useMemo(() => listRememberedBottles(port), [port]);

  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby="remembered-heading">
      <header className="flex flex-col gap-1">
        <h2 id="remembered-heading" className="text-[1.0625rem] font-semibold text-abyss">
          这台设备参与过的瓶子
        </h2>
        <p className="text-[0.875rem] leading-[1.6] text-slate-current">
          这是本机记录：换一个浏览器或清掉缓存就看不到。瓶子真身（漂到哪了）在服务端的漂流日志里。
        </p>
      </header>

      {entries.length === 0 ? (
        <EmptyState
          icon="Waves"
          title="这里还没有记录"
          description="去河道捞一个瓶子，或者选一首歌投出第一棒 —— 之后它们会出现在这里。"
          action={
            <Link to="/river" className="text-[0.9375rem] font-semibold text-peacock underline">
              去河道捞一个
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="hover-lift flex flex-wrap items-center gap-3 rounded-base border border-mist bg-foam px-4 py-3 shadow-card"
            >
              <Icon name="Music" size={18} />
              <Link
                to={`/bottles/${entry.id}`}
                className="text-[1rem] font-semibold text-abyss underline decoration-mist"
              >
                {entry.songTitle}
              </Link>
              <span className="text-[0.875rem] text-slate-current">{ROLE_LABEL[entry.role]}</span>
              <span className="ml-auto flex items-center gap-3 text-[0.875rem]">
                <Link
                  to={`/bottles/${entry.id}/log`}
                  className="font-medium text-peacock underline"
                >
                  漂流日志
                </Link>
                <Link to={`/bottles/${entry.id}`} className="font-medium text-peacock underline">
                  去看看
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
