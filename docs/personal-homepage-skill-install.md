# personal-homepage-skill 项目级安装说明

> 任务 t2 产出。记录安装位置、依赖、验证方式，以及 SKILL.md 定义的 PPT（Presentation Mode）生成流程，
> 供后续「项目介绍 PPT」任务直接复用。

## 1. 安装结果

| 项 | 值 |
| --- | --- |
| 来源 | https://github.com/shengjidaguai-china/personal-homepage-skill |
| 安装路径（项目级） | `.agents/skills/personal-homepage-skill/` |
| 版本 | package.json `0.4.0`，commit `4e75c5a`（Update skill workflows and shared HTML editing and presenter runtime (#15)） |
| Skill 入口 | `.agents/skills/personal-homepage-skill/SKILL.md`（frontmatter: `name: personal-homepage-skill`） |
| 发现状态 | 会话 skill 目录已识别 `personal-homepage-skill`，可直接按名加载 |

安装方式：克隆仓库后整目录复制到项目 `skills` 目录（不含 `.git`），符合 README「把这个文件夹放到兼容的 skills 目录中」的说明。

### ⚠️ Windows 换行符陷阱（已处理）

首次克隆时 git 默认 `core.autocrlf` 把 `src/data/templates.ts` 转成 CRLF，导致 `npm run check:templates`
正则 `\{\n\s+id:` 匹配失败（"No template entries found"）。处理方式：

```powershell
git -c core.autocrlf=false clone --depth 1 https://github.com/shengjidaguai-china/personal-homepage-skill <dest>
```

重新以 LF 检出并覆盖安装目录后，检查全绿。**更新该 skill 时必须沿用 `core.autocrlf=false`，否则检查会假失败。**

## 2. 依赖

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node | `>=22`（engines）；本机 v24.12.0 | 运行校验/截图脚本 |
| npm | 本机 11.7.0 | 仅用于 skill 自身安装 |
| npm 包 | 已在 skill 目录执行 `npm install`（143 packages） | react/react-dom、framer-motion、lenis、lucide-react、vite、typescript、tailwindcss、**playwright ^1.55**（dev） |
| Playwright Chromium | `npx playwright install chromium` 已执行（headless shell v1228 已下载到 `%LOCALAPPDATA%\ms-playwright`） | `verify-html-ppt-stage.mjs` / `capture-slides.mjs` / `test-export-html.mjs` 必需 |
| 宿主项目依赖 | 不需要 | skill 是独立 npm 包，**不写入**根 `package.json` / `pnpm-workspace.yaml`，不引入项目中间件 |

skill 自带 `node_modules/`、`dist/` 已被其自身 `.gitignore` 忽略，不会污染仓库。

## 3. 验证记录（全部通过）

```powershell
cd .agents\skills\personal-homepage-skill
npm install --no-audit --no-fund      # exit=0, added 143 packages
npm run check:all                     # exit=0
```

`check:all` 依次通过：`check:spec`（文档链接）、`check:templates`（19 个模板注册表）、`check:visual`、
`test:homepage-qa-rules`、`test:ppt-qa`（verifier + capture 契约测试）、`test:homepage-regression`、
`test:hero-template`、`test:hero-portable`、`test:html-runtime`（35 断言）、`build`（tsc -b && vite build ✓ built in 2.51s）。

## 4. SKILL.md 摘要（入口规则）

- SKILL.md **只负责识别任务并按需加载**，两种模式互不继承规则：
  - **Homepage Mode** → `HOMEPAGE_GENERATION_WORKFLOW.md`（连续响应式页面）
  - **Presentation Mode** → `PRESENTATION_WORKFLOW.md`（固定 16:9 HTML PPT）
- 通用纪律：跟随用户指定模板/参考；不编造指标、评价、项目、链接；优先真实截图与完整二维码；
  CJK 可读排版；字数/构图建议是可调指导，不额外加确认门槛。
- 独立 HTML 默认内嵌编辑/导出运行时（`references/html-editing-export.md` + `assets/html-runtime.js`）；演讲者模式仅属 PPT。

## 5. PPT（Presentation Mode）生成流程

依据 `PRESENTATION_WORKFLOW.md` + `PPT_VISUAL_QA.md` + `references/presenter-mode.md`：

1. **内容先于版式**：按受众、演讲目标、时长、素材梳理故事线。默认「上屏短要点 + 讲稿进 notes」；
   用户要求保留原稿时，按原语言与顺序完整保存在 notes，用稳定 slide ID 追踪来源段落，不许丢稿、不许缩字号硬塞。
   维护一份 source-to-slide 提纲，交付前对账。
2. **尽早选型并试做**：查 `references/template-selection.md` 索引（`scripts/find-template.mjs` 支持中文检索），
   看真实预览再定风格。新 deck 先做 3 张代表页（开场/信息最密/案例页）真实渲染，按 `PPT_VISUAL_QA.md`
   修密度、图片比例、风格，再扩展全稿（这是自查，不是新增用户确认环节）。
3. **实现**：从 `templates/presentation-html/presentation.html` 起步（已内嵌编辑/导出与演讲者运行时）。
   - 1920×1080 stage 整体缩放到最大 16:9 视口矩形；控件是 overlay，不挤占 stage；**不做移动端 reflow**。
   - 同一时刻只有一张 slide 上屏；stage 变换与内部动效层分离；尊重 reduced-motion。
   - 每张 `.slide` 有唯一 `data-slide-id` + 保留 `data-original-number` + `data-slide-title`；
     讲稿用 `data-note-for` 绑语义 ID；可编辑文本用稳定 `data-edit-id`；重排/删除永不改语义 ID。
   - 快捷键：方向键/Space/PgUp/PgDn/Home/End 翻页，F 全屏，E 编辑，N 演讲者窗口，Esc 退出编辑，Cmd/Ctrl+S 保存。
   - 新静态 HTML 可用 `scripts/bundle-html-runtime.mjs presentation <in> <out>` 内嵌运行时。
4. **验证**（路径用绝对路径，task 目录 ≠ skill 目录）：

   ```bash
   SKILL_DIR="<项目>/.agents/skills/personal-homepage-skill"
   node "$SKILL_DIR/scripts/verify-html-ppt-stage.mjs" "$DECK_HTML" --screenshots "$QA_ROOT/stage"
   node "$SKILL_DIR/scripts/capture-slides.mjs" "$DECK_HTML" --output "$QA_ROOT/slides"
   node "$SKILL_DIR/scripts/test-export-html.mjs" "$DECK_HTML"
   ```

   - 退出码：0 成功，1 deck/截图失败，2 调用或依赖失败；**跳过检查不算通过**。
   - `capture-slides.mjs` 产出逐页图片 + `qa-report.json`（几何证据，不评美观）。
   - 美观验收按 `PPT_VISUAL_QA.md`：密度与焦点、层级与节奏、模板忠实度、图片/二维码比例、构图、播放不串页；
     新 deck 全页检查，小改检查受影响页 + 相邻节奏，记录检查范围与遗留限制。
   - 结构改动后回归：首末页导航、页数、ID、notes 映射（含导出文件）；导出→新上下文重开→编辑→再导出。
5. **演讲者模式**（`references/presenter-mode.md`）：N 打开独立窗口；讲稿在 audience 文档侧；
   双向导航、notes 编辑隔离导航键、计时器不入导出文件；**notes 会随导出 HTML 一起带走，不是保密边界**。

## 6. 后续任务使用提示

- 触发方式：直接按名加载 skill `personal-homepage-skill`，或让 Agent 读 `SKILL.md`。
- 生成项目介绍 PPT 时走 Presentation Mode；「自行截图」用上面第 5.4 步的 `capture-slides.mjs`（Playwright 已就绪）。
- QA 产物放任务自己的 scratch 目录（如 `.tmp-*-shots/`），不要写进 skill 目录。
