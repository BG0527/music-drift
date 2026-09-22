/** 找不到这一页：给可读说明与回首页出口（不白屏、不留死链）。 */
import { EmptyState, WaveDivider } from '../design-system';
import { Link } from './shell/router';
import { TEXT_LINK, TEXT_LINK_STRONG } from './shell/link-styles';

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.75rem] font-bold text-abyss">找不到这一页</h1>
      <EmptyState
        icon="Waves"
        title="这条水路不存在"
        description="这个地址可能是旧的，或者瓶子已经被别人接走、链接失效了。"
        action={
          <Link to="/" className={TEXT_LINK_STRONG}>
            回首页
          </Link>
        }
      />
      <WaveDivider />
      <div className="flex flex-col gap-1 text-[0.875rem] leading-[1.6] text-slate-current">
        <p>也可以换个入口继续：</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/river" className={TEXT_LINK}>
            去河道捞一个漂流瓶
          </Link>
          <Link to="/sea" className={TEXT_LINK}>
            去公海听完成的作品
          </Link>
        </div>
      </div>
    </div>
  );
}
