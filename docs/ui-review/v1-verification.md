# V1 落地验证（t35）—— CTA ≥3:1 · 焦点环达标一致 · 移动端承板可辨

> 施工图：`docs/handover/frontend-ds-v1-ready-to-land.md`。审计来源：`docs/ui-review/visual-audit.md` V1。
> 本文件记录**落地后的三层验证原始证据**（避免"只在消息里的证据等于没有证据"）。
> 变更文件：`pages/home-page.tsx`、`pages/river-page.tsx`、`pages/__tests__/deep-surface-cta.test.ts`（新增）；截图产物 `docs/ui-review/after-v1/`（12）、`docs/ui-review/after-v1-375/`（12）。

## 1. 落地内容（4 项）

| #   | 内容                                                                                                      | 落点                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **C2：紧贴控件边缘的 `foam` 环** `ring-2 ring-foam`                                                       | 三处 CTA：`home-page.tsx:90`（hero）、`river-page.tsx:78`（捞取，经 `Button` 调用点 `className`）、`river-page.tsx:137`（投下，inline） |
| 2   | **移动端内圈 +16px**（md 不动）                                                                           | 首页 `100→104`（`home:82`）· 河道 `80→92`（`river:67`、`river:131`），md 仍 `130`                                                       |
| 3   | **焦点三重区分** `focus-visible:ring-[3px]` + `ring-sea-glass` + `ring-offset-2 ring-offset-deep-current` | 同上三处                                                                                                                                |
| 4   | **焦点环收口**（覆盖 `Button` 基类的 `ring-peacock`=2.05:1 与 `wave-white` offset）                       | `river-page.tsx:78` 调用点                                                                                                              |

## 2. 第 ① 层：token 守卫（先红后绿）

**RED（落地前）**：`vitest run src/pages/__tests__/deep-surface-cta.test.ts` → `Tests 2 passed | 6 failed`，
失败原因为源码模式层（`缺少紧贴控件的 foam 环（C2）` / `焦点环未加粗到 3px`）× 3 处 CTA。

**GREEN（落地后）**：同一命令 → `Tests 8 passed (8)`，逐条：
`正向：实际使用的面对都 ≥3:1` ✓ · `负向：深底上「直接用填充色当边界」必须 <3:1` ✓ ·
三处 CTA ×（`ring-2 ring-foam` ✓ / `ring-[3px] + sea-glass + offset-deep-current` ✓）。

**这一层能/不能证明什么**：证明**色值关系**（含把"为什么必须有承板"写成负向断言的**设计理由**）与**源码里确实带上了装置**；
**不能**证明渲染像素（jsdom 无渲染）—— 见 §3。

## 3. 第 ② 层：像素采样（唯一能证明"屏幕上真的达标"的层）

方法：从改前 `docs/ui-review/after*/` 与改后 `docs/ui-review/after-v1*/` 的同名截图里，
先在**深水面板 bbox 内**定位最长 `peacock`/`coral` 连续段（= CTA 圆盘），再从圆盘右缘向外逐像素扫描。

| CTA               | 截图                                         | 改前（fill vs 紧邻）    | 改后（fill vs 紧邻） | 改后紧邻是谁                      |
| ----------------- | -------------------------------------------- | ----------------------- | -------------------- | --------------------------------- |
| 首页 hero         | `home-1440.png` → `after-v1/home-1440.png`   | **2.05:1**（紧邻=深底） | **5.13:1**           | `rgb(228,240,242)` = **foam 环**  |
| 首页 hero（移动） | `home-375.png` → `after-v1-375/home-375.png` | **2.05:1**              | **5.13:1**           | foam 环                           |
| 河道·捞取         | `river-1440.png` → `after-v1/river-1440.png` | **2.05:1**              | **5.13:1**           | foam 环                           |
| 河道·投下         | `river-1440.png` → `after-v1/river-1440.png` | **2.51:1**              | **4.18:1**           | foam 环（环 vs 面板 **10.62:1**） |

原始扫描片段（改后 1440 首页 hero）：
`+0 rgb(21,113,131) | +1 rgb(228,240,242) | +2 rgb(221,234,237) | +3 rgb(11,58,74)`
→ 填充(peacock) → **1–2px foam 环** → 深底。改前同位置为 `+0 rgb(14,104,122) | +1 rgb(11,58,74)`（无环）。

**文件同一性核对**（防止把同一张图测两次）：`after/home-1440.png` md5 `a137667f…` ≠ `after/river-1440.png` md5 `1bfdea87…`；
`coral` 像素数：home **0 px** / river **8989 px**（投下 CTA 只在 river）✓

token 参考值：`foam↔deep-current` **10.50:1** · `peacock↔foam` **5.13:1** · `coral↔foam` **4.18:1** · `sea-glass↔deep-current` **7.00:1**（焦点环）；
负向（必须 <3:1）：`peacock↔deep-current` **2.05:1** · `coral↔deep-current` **2.51:1**。

## 4. 第 ③ 层：截图 + 一屏不退化

```
$ node apps/web/tools/one-screen-check.mjs --viewport=1440x900 --shot=docs/ui-review/after-v1
✅ 全部页面达标（桌面口径：一屏装下）      ← 12 行 OK / exit 0
$ node apps/web/tools/one-screen-check.mjs --viewport=375x812 --shot=docs/ui-review/after-v1-375
✅ 全部页面达标（手机口径：无横向滚动 + 关键锚点在首屏内）   ← 12 行 OK / exit 0
```

（两次都是 hermetic 自建库；截图 12+12 张落在上述两个目录，共 2.5MB。）

## 5. 三道门（真实退出码）

| 命令                | 退出码 | 结果                                                                               |
| ------------------- | ------ | ---------------------------------------------------------------------------------- |
| `pnpm -r test`      | **0**  | shared **231** / api **180** / web **500**（基线 492 + 本次新增守卫 8 例 = 500 ✓） |
| `pnpm -r typecheck` | **0**  | `error TS` 计数 = 0                                                                |
| `pnpm lint`         | **0**  | `eslint .` 无输出                                                                  |

## 6. 焦点环一致性（改动后真实输出）

```
apps/web/src/pages/home-page.tsx:90:  … bg-peacock ring-2 ring-foam … focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current …
apps/web/src/pages/river-page.tsx:78:  'ring-2 ring-foam focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current'
apps/web/src/pages/river-page.tsx:137: … bg-coral ring-2 ring-foam … focus-visible:ring-[3px] focus-visible:ring-sea-glass focus-visible:ring-offset-2 focus-visible:ring-offset-deep-current …
```

三处的**边界装置与焦点环串完全一致**（静止 `ring-2 ring-foam`；焦点 3px + sea-glass + offset-deep-current）。

## 7. 残留与边界（诚实记录）

1. **焦点态未做像素级采样**：焦点需要交互触发，截图脚本不产生 focus 帧 ⇒ `sea-glass↔deep-current = 7.00:1` 是 **token 计算值**（第 ① 层），不是像素实测。**（推断性说明，非实测）**
2. `C2` 会在 CTA 外沿多一圈 `foam` 环，属**外观变化**；captain 已记录将告知用户（可否决）。
3. 第 ① 层的源码模式守卫是**模式守卫**（检查 class 串），不是渲染守卫 —— 与 §48 的教训一致，故必须配合第 ② 层。
4. 未改动 `DESIGN.md`（基线 md5 `458b8c80…` 未变）；未触碰 `features/audio/**`、`apps/api/**`、`packages/**`。
