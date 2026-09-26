# tools/fixtures —— 演示数据的**真音频**素材（W8）

| 文件 | 是什么 | 怎么重建 |
| --- | --- | --- |
| `demo-segment.webm` | 一段**真** WebM/Opus（无头 Chromium 假麦克风 + `MediaRecorder` 录出来的可解码音频） | `node tools/record-fixture.mjs`（已存在则跳过；`--force` 重录） |

`tools/seed-demo.mjs` 上传段音频时**读这个文件**（不再合成伪容器）。它缺失时 seed 会**报错并给出重建命令**，
不会退回合成字节 —— 那正是 W8 要消灭的哑音频。

口径与复现步骤见 `docs/site-runbook.md` §2.6 与 §8。
