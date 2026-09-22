import { Showcase } from './design-system/showcase';

/**
 * S0 脚手架占位壳。真实页面（首页/选歌/录制/河道/公海/漂流日志）由 T3.2 按 DESIGN.md 实现。
 * 本组件不包含任何产品逻辑。
 *
 * 设计系统展示页只在开发模式下通过 `/?design-system` 进入（生产构建不含该分支）。
 */
export function App() {
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.search.includes('design-system')
  ) {
    return <Showcase />;
  }

  return (
    <main data-testid="app-shell">
      <h1>音乐漂流瓶</h1>
      <p>脚手架已就绪（S0）：等待 S2/S3 按 DESIGN.md 实现界面。</p>
    </main>
  );
}
