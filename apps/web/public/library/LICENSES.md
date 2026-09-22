# 曲库素材与署名（CC BY 4.0）

> 来源：**Incompetech** — 作者 **Kevin MacLeod**
> 许可：**Creative Commons Attribution 4.0 International (CC BY 4.0)**
> 许可原文：https://creativecommons.org/licenses/by/4.0/
> 站点声明原文：`Licensed under Creative Commons: By Attribution 4.0`

## 署名义务（必须履行）

CC BY 4.0 允许再分发与改编（含商业用途），**唯一义务是署名**。本项目必须：
1. 在「**设置 / 关于**」页展示下列署名与许可链接；
2. 在交付文档中保留本文件；
3. 若对音频做了混音/剪辑（本项目成品会叠加用户人声），标注为「改编（remix）」并保留署名。

建议署名文案：

```text
本作品使用的伴奏音乐来自 Kevin MacLeod (incompetech.com)，
依据 Creative Commons Attribution 4.0 许可使用。
Licensed under Creative Commons: By Attribution 4.0 License
https://creativecommons.org/licenses/by/4.0/
```

## 已入库曲目

| 文件 | 曲名 | 作者 | ISRC | 官方 BPM | 实测时长 | 源文件地址 |
| --- | --- | --- | --- | --- | --- | --- |
| `Immersed.mp3` | Immersed | Kevin MacLeod | USUAN1600010 | 64 | 249.0s | `https://incompetech.com/music/royalty-free/mp3-royaltyfree/Immersed.mp3` |
| `Rains Will Fall.mp3` | Rains Will Fall | Kevin MacLeod | USUAN1100723 | 85 | 222.5s | `https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rains%20Will%20Fall.mp3` |
| `On the Shore.mp3` | On the Shore | Kevin MacLeod | USUAN1200016 | 82 | 100.8s | `https://incompetech.com/music/royalty-free/mp3-royaltyfree/On%20the%20Shore.mp3` |

- 实测时长 = 文件字节 × 8 ÷ 实测码率（`file` 报告的 256/320 kbps），与站点元数据一致。
- 三首均为**器乐、无人声**（乐器字段：Piano/Strings/Kit/Glock/Tympani/Flute）。
- 官方音频格式：MPEG layer III, 44.1–48 kHz, stereo, 256–320 kbps。

## ⚠️ 尚未验证：拍号（time signature）

- Incompetech 的曲目详情页**只公布 Length 与 Tempo(BPM)，不公布拍号**；官方元数据无此字段。
- captain 用 ffmpeg + numpy 做了自相关节拍检测，结果**不可信、不予采信**：
  实测 BPM 与官方值偏差 4.7% / 13.1% / 16.8%，且拍号判定与元数据描述矛盾
  （把 `On the Shore` 判成 3/4，而官方描述里唯一的圆舞曲是 `Rains Will Fall`）。
  故**不据此下结论**。
- 因此：**不要用「拍号 × 小节数」反推分段点**。见 `docs/architecture.md` §19.2 的稳健做法
  （把分段点吸附到强起音/乐句分句处，而非从拍号计算）。
- 拍号与精确 BPM 由 `t13` 用更可靠的方法确认（更强节拍分析，或人耳复核）。
