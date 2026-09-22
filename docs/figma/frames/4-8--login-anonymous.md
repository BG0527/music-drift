# login-anonymous · node `#4:8` · 1440×900

- 截图：`4-8--login-anonymous.png`（本轮渲染）
- 采集：`figma_get_design_context { nodeId: '4:8' }`（fileKey `epsix0MBOq2Iv8cCASg9qK`），2026-09-23
- 视觉裁决：**已裁决 —— 视觉一律按 `DESIGN.md`；本帧只贡献 IA / 文案 / 交互状态**（见 `docs/architecture.md` §12.1）

## 1. IA / 区块层级

```
login-anonymous 1440×900 · column · padding 64 · 底=GRADIENT_RADIAL
├── stardust-bg 1440×900                        装饰层：7 颗星点（4–12px 椭圆，青/粉/琥珀/浅灰）
└── center-container 480×680 · column · gap 40  单列居中的"入口卡"
    ├── bottle-illustration-container 220×220   漂流瓶插画：外发光环 330 青 / 内环 220 粉
    │   └── bottle-glass-body 110×154           瓶身 + inner-melody-sheet 28×28（粉，音符）
    │        + liquid-base 88×55（青）+ bottle-neck 16×20 + cork 12×10（琥珀）
    ├── Frame 480×92 · gap 12                   标题组（3 行）
    └── glass-card 480×233 · gap 24 · padding 32
        ├── alias-input-box 416×50 · 行内 gap 12：图标 18 + 文本 316 + 换名按钮 18
        ├── 辅助说明行（12px）
        └── primary-button 416×47 · padding 14/36  单一主行动
└── 页脚统计文案 12px（居中，位于卡片下方）
```

层级结论：**1 屏 = 1 个任务**。无导航、无侧边栏、无多列；视觉重心是"瓶 + 标题 + 一张卡"。

## 2. 导航结构

无导航（全屏入口页）。唯一的路径出口是卡内主按钮。

## 3. 交互元素与可复用状态

| 元素 | node | 尺寸 | 状态 |
| --- | --- | --- | --- |
| 代号输入框（只读展示 + 换名） | `#4:34` | 416×50 | 静态；右侧 18px 换名按钮是唯一可点区（**触控目标偏小**，见 CONFLICTS C-13） |
| 换名按钮 `refresh-cw` | `#4:606` | 18×18 | 无明显 hover/active 差异 |
| 主按钮 `primary-button` | `#4:39` | 416×47 | 渐变填充；**Figma 未提供 hover/active/focus/disabled/loading 状态帧** |
| 瓶插画双环发光 | `#4:19` `#4:20` | 330 / 220 | 静态装饰 |

**可复用状态缺口**：该帧没有 disabled / loading / 错误态（如代号生成失败），需在 T3.2 按 `DESIGN.md` §Interaction States 自行补。

## 4. 文案提取（已确认可直接复用；AI 陈词核对）

| 位置 | 文案 | 字号/字重 | AI 陈词？ |
| --- | --- | --- | --- |
| 品牌 | 音乐漂流瓶 | 14 / 600 | 否 |
| 主标题 | 每一段旋律，都在寻找下一个声音 | 28 / 500 | 否 |
| 副标题 | 这是一个由歌声、回音和宿命组成的角落 | 14 / 400 | 否 |
| 字段标签 | 你的化身代号 | 14 / 500 | 否 |
| 字段值 | 午夜歌手#042 | 15 / 400 | 否（符合 CONTEXT.md §12 匿名代号） |
| 辅助说明 | 系统已为你随机安排一个充满浪潮气息的匿名昵称 | 12 / 400 | 否 |
| 主按钮 | 进入河道 | 16 / 600 | 否 |
| 页脚统计 | 当前有 12,842 个声音在无声的深海中航行 | 12 / 400 | 否（数字需替换为真实计数） |

**AI 陈词核对结论：8 条全部通过**（无 Elevate / Seamless / Unleash / Next-Gen 类词）。

## 5. 与 `DESIGN.md` 的差异（逐条与结论见 `CONFLICTS.md`）

底色（深色径向渐变 vs `wave-white` 恒浅底）、主色（霓虹青/热粉 vs `peacock` 单主色）、外发光（双环泛光 vs `No outer glows`）、字体（Inter vs 霞鹜文楷 + Quattrocento）、输入框字号 15px（DESIGN.md 未定义 15px 档）、按钮 padding 14/36（DESIGN.md 主按钮 padding 12px）—— 全部**已裁决：DESIGN.md 胜出**。
