# 主题化收尾（t47）：深底水面也流动

> 来源：t46 交接里我自己登记的未做项 ——「深底页尚未开漂移（只让浅底整面水层流动）」。
> 用户要的原话是「水**缓缓流动**」，而**深底面板恰恰是这个产品里最大的水面**（河道页两个 hero 深水面板、作品详情深底页头）。
> 浅底在流、深底是死图 ⇒ **同一页里两种水**，细看会觉得"浅底那张是活的、深底那张是贴图"。
> 本批把深底也开起来，让全站水面**都是活的**。

---

## 1. 做了什么

| 位置 | 改动 | 备注 |
| --- | --- | --- |
| `apps/web/src/pages/river-page.tsx` | 两个深水面板（`bg-deep-current`）里的 `<WaterTexture />` → `<WaterTexture drift />` | 宿主 t44 起就有 `overflow-hidden` ⇒ ±10px 出血被裁掉，不外溢 |
| `apps/web/src/pages/sea-detail-page.tsx` | **深底页头**那个 `<WaterTexture />` → `<WaterTexture drift />`（内容区那个 t46 已是 drift） | 同上，页头也有 `overflow-hidden` |
| `DESIGN.md` ③ | 补一句：浅底整面水层与深底面板/深底页头的水层**共用同一对参数**，不设"深底专用"值 | 仍是**一条**规则；不是第二套 |

**没有**新增 token —— 理由见 §3。

---

## 2. ⭐ TDD：先红后绿（原始输出）

### 红（守卫先写，实现未动）

```
$ pnpm --filter @music-drift/web exec vitest run src/design-system/__tests__/water-motif.test.tsx
  × 河道页的两个深水面板（bg-deep-current）里都有 drift 水层
  × 作品详情深底页头（bg-deep-current）里也有 drift 水层
AssertionError: 河道页有深水面板没开漂移: expected 'partial' to be 'all' // Object.is equality
AssertionError: 详情页深底页头没开漂移: expected 'partial' to be 'all' // Object.is equality
 Tests  2 failed | 39 passed (41)
```

**判据设计（为什么用 `'all' | 'partial'` 而不是数个数）**：
守卫扫描**每一个** `bg-deep-current` 容器，取其标签后 700 字符的窗口（装饰层是它的子节点），要求**每一个**窗口里都出现 ` drift`；
返回 `'none' | 'all' | 'partial'`，断言 `toBe('all')`。
⇒ 这样"漏掉其中一个面板"（第一版的 `count >= 1` 写法就漏了！）也会被抓到；错误信息直接指向"有深水面板没开漂移"。
> 留痕：第一版守卫写的是「详情页至少 1 处 WaterTexture 带 drift」，而 t46 已在**内容区**加过一处 ⇒ 那条断言当时**误绿**。收紧到"每个深底容器都要有"后才真正变红（这本身就是"断言太软只会点头"的实例）。

### 绿（实现后，同一命令）

```
$ pnpm --filter @music-drift/web exec vitest run src/design-system/__tests__/water-motif.test.tsx
 Tests  41 passed (41)
```

---

## 3. 为什么**不**新增"深底专用" token（判断留痕）

- **位移是绝对像素，不随底色缩放**：±10px 的 1px 细线位移，在深底与浅底上的感知量级相同（差异来自对比，而非位移）。
- 给出"深底专用值"只会制造**同一件事两套规则** —— ADR-019 明令禁止（"替换一个机制时要删掉旧机制"的同一精神）。
- ⇒ **深浅底共用** `driftDuration: 24000ms` / `driftShift: 10px`。
- 守卫把这点写成断言：`driftDuration` / `driftShift` 在 `DESIGN.md` 的 motion 块里**各只能出现一次**（出现第二套就红）。

**`motion-web` §1 decoration 第②条（不得争夺注意力）的自评**：
24s 一个来回、±10px、1px 细线，幅度远小于 hero 主 CTA 的静态对比；且深底水层在 `z-underlay`（落在内容之下）。
⇒ 判定**不构成注意力竞争**。若 captain 认为构成，撤掉只需去掉一个 `drift` 属性（一行）。

## 4. reduced-motion：降级通道唯一

沿用 t46 的机制：漂移是 **CSS 动画** ⇒ 被 `motion.css` 的
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important } }` 冻住。
守卫**同时**断言"没有第二条通道能绕过降级"：

```
it('降级通道唯一：water.css 里不得有 JS 驱动动画（否则 reduced-motion 会被绕过）', () => {
  expect(waterCss).not.toContain('.animate(');
  expect(waterCss).not.toContain('requestAnimationFrame');
});
```
（t46 已用反向控制证明这条守卫能真的区分：移除全局重置 → 该条变红 → 还原后绿。）

---

## 5. 验证（原始输出）

```
$ pnpm --filter @music-drift/web exec vitest run water-motif.test.tsx motion-contract.test.tsx
 Test Files  2 passed (2)
      Tests  58 passed (58)          ← water-motif 41 + motion-contract 17

$ pnpm -r test
packages/shared test:  Test Files  22 passed (22)      Tests  242 passed (242)
apps/api test:         Test Files  19 passed (19)      Tests  180 passed (180)
apps/web test:         Test Files  65 passed (65)      Tests  598 passed | 1 skipped (599)
TEST_EXIT=0

$ pnpm -r typecheck
apps/api typecheck: Done
apps/web typecheck: Done
TC_EXIT=0

$ pnpm lint
$ eslint .
LINT_EXIT=0

$ node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after-theme4-1440
✅ 全部页面达标（桌面口径：一屏装下）
EXIT=0

$ node apps/web/tools/one-screen-check.mjs --viewport=375x812 --shot=docs/ui-review/after-theme4-375
✅ 全部页面达标（手机口径：无横向滚动 + 关键锚点在首屏内）
EXIT=0
```

**截图新鲜度（两次 stat 结果）**：

```
CODE   22:47:36 apps/web/src/pages/river-page.tsx
CODE   22:47:36 apps/web/src/pages/sea-detail-page.tsx
SHOT   22:47:58 docs/ui-review/after-theme4-1440/river-1440.png
SHOT   22:49:09 docs/ui-review/after-theme4-375/river-375.png
```
⇒ 截图**晚于**最后一次代码改动（+22s / +93s）。

---

## 6. 边界与遗留

- 只动 `transform`（`.water-drift` 的 `margin` 是**静态**出血声明，不在动画属性里）；参数取自 `DESIGN.md` motion 契约；装饰仍 `absolute` + 零布局高度（宿主 `relative` + `isolate`，装饰 `z-underlay`）。
- **未碰** `settings-page.tsx` 与 `admin-page.tsx`（在 out of scope 内）。
- **保留的地雷**（t46 登记，t47 继续生效）：**`/settings` 在 375 下余量 ≈1px**（实测 `settings-attribution=811 ≤ 812`）⇒ 任何再往该页加高度都会顶破一屏硬门。
- 未做（登记）：漂移的**观感**需真机/录屏（静帧证明不了动效）；若要让深底与浅底"看起来一样快"，需要真机对比后再定（当前共用同一对 token 是保守选择）。
