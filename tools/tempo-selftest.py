#!/usr/bin/env python3
"""
速度选择器的**已知答案对照**（t13 加固第 4 条）。

为什么必须有这个文件：把"按官方值挑候选"换成"按另一个标准挑候选"并不自动消灭偏倚 ——
新的选择器同样需要**有牙齿的对照**才能自证。这里用**已知 BPM 的合成信号**做两件事：

  S-1 正对照      等强 click，已知 100 BPM                  → 必须恢复 100
  S-2 负对照      主拍 100 BPM + 正中间**较弱** click(0.35)   → 必须恢复 100（不得偏好 2×）
  S-3 变异测试    把 R-4b 的预注册约定带反转（[120,200)）后重跑 S-2 → **必须失败**（得到 200）

S-3 是关键：若反转偏好后断言仍通过，说明这条断言并没有真正约束选择器。

用法：python tools/tempo-selftest.py   （退出码 0 = 全部符合预期；1 = 有不符合）
依赖：与 tools/library-analysis.py 相同（numpy；不需要 miniaudio 读文件）
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("library_analysis", REPO / "tools" / "library-analysis.py")
assert SPEC is not None and SPEC.loader is not None
la = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(la)

RATE = 22_050
DURATION_S = 60.0


def click_train(bpm: float, amplitude: float = 1.0, offset_s: float = 0.0,
                half_amp: float | None = None) -> np.ndarray:
    """等强 click 序列；half_amp 给出时，在正中间再插一组较弱 click（制造 2× 成分）。"""
    samples = np.zeros(int(RATE * DURATION_S), dtype=np.float32)
    burst = int(0.006 * RATE)
    decay = np.exp(-np.arange(burst) / (0.0015 * RATE)).astype(np.float32)
    period = 60.0 / bpm
    positions = np.arange(offset_s, DURATION_S, period)
    for t in positions:
        start = int(t * RATE)
        end = min(start + burst, samples.size)
        if end > start:
            samples[start:end] += amplitude * decay[: end - start] * np.random.default_rng(7).standard_normal(end - start)
    if half_amp is not None:
        for t in positions + period / 2.0:
            start = int(t * RATE)
            end = min(start + burst, samples.size)
            if end > start:
                samples[start:end] += half_amp * decay[: end - start] * np.random.default_rng(11).standard_normal(end - start)
    return samples


def run(name: str, samples: np.ndarray, expect_bpm: float, prefer_finer: bool = False,
        band: tuple[float, float] | None = None) -> bool:
    env = la.onset_envelope(samples, RATE)
    decision = la.select_tempo(env, prefer_finer=prefer_finer, band=band or la.TACTUS_BAND)
    got = decision["bpm"]
    ok = abs(got - expect_bpm) <= 1.0
    flag = "PASS" if ok else "FAIL"
    print(f"[{flag}] {name}")
    print(f"       恢复 BPM = {got:.2f}（期望 {expect_bpm:.0f}）· 决策 = {decision['decision']}")
    print(f"       r = {decision['interleavedRatio']:.3f}（带 [{decision['ratioBands']['keepAt']}, {decision['ratioBands']['upAt']}]）"
          f" · 次优边际 {decision['runnerUp']['marginPercent']:.1f}% · 僵持 = {decision['ambiguous']}")
    print(f"       top6 Sn = {[item['sn'] for item in decision['top']]}")
    return ok


def main() -> int:
    results: list[tuple[str, bool]] = []

    # S-1 正对照：等强 click，已知 100 BPM
    results.append(("S-1 正对照（等强 100 BPM）", run("S-1 等强 100 BPM", click_train(100.0), 100.0)))

    # S-2 负对照：主拍 100 BPM + 正中间较弱 click(0.10) → 含强 2× 成分，但真节拍仍是 100
    negative = click_train(100.0, half_amp=0.10)
    results.append(("S-2 负对照（含 2× 成分，须恢复 100）", run("S-2 含 2× 成分", negative, 100.0)))

    # S-3 变异：把预注册打拍带反转（[120,200)）后，同一断言**必须失败**
    mutated_ok = run("S-3 变异（反转约定带 → 偏好细分）", negative, 100.0, band=(120.0, 200.0))
    print(f"[{'PASS' if not mutated_ok else 'FAIL'}] S-3 变异测试：反转 R-4b 约定带后 S-2 的断言必须失败"
          f"（当前{'已失败 → 断言有牙齿' if not mutated_ok else '仍通过 → 断言无约束力'}）")
    results.append(("S-3 变异必须使 S-2 失败", not mutated_ok))

    failed = [name for name, ok in results if not ok]
    print()
    if failed:
        print(f"不符合预期：{failed}")
        return 1
    print("全部符合预期：选择器在已知答案上正确，且偏好反转会使断言失败（有牙齿）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
