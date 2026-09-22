#!/usr/bin/env python3
"""
曲库分析工具（**开发期工具，不进运行时依赖**）—— t13 / T3.4。

用途：对 `apps/web/public/library/` 里的公版器乐做四项测量，产出 `library.json` 与证据表：

1. **精确 BPM**：音强包络（spectral flux）的 DFT 速度显著度（tempogram），并叠加谐波加权；
   同时打印 top 候选，便于发现倍/半速（octave）错误；再与 Incompetech 官方 Tempo 对照。
2. **拍号**：以**低频（kick/tympani）**音强包络为主，取节拍网格上的**重音轮廓**，
   对 2/3/4/6 拍逐一算"重音对比度"与周期一致性，给出选择与置信边际。
3. **分段**：与拍号无关的稳健法（`docs/architecture.md` §19.2）——
   目标段长 T≈22.5s，边界 0/T/2T/3T/4T 各自在 ±1.5s 窗口内**吸附到最强起音**，
   记录起音强度与分位数作为证据；无显著起音的边界标 `needsManualReview`；段长越界则收紧窗口重算。
4. **响度**：ITU-R BS.1770-4（K 加权 + 门限积分响度 LUFS，48kHz 系数）+ 样本峰值，
   给出三首之间归一到同一目标（默认 -16 LUFS）的增益，并在峰值超限时回退。

依赖：`numpy`、`miniaudio`（Python 开发机本地安装；**不写入任何 package.json**）。
用法：
    python tools/library-analysis.py                      # 分析全部三首，写 library.json + 打印证据
    python tools/library-analysis.py --only "Immersed.mp3"  # 只分析一首
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import miniaudio
import numpy as np

REPO = Path(__file__).resolve().parent.parent
LIBRARY_DIR = REPO / "apps" / "web" / "public" / "library"
OUTPUT = LIBRARY_DIR / "library.json"

# ── 分段参数（docs/architecture.md §19.2 稳健法）────────────────────────────
TARGET_SEGMENT_S = 22.5          # 目标段长（15–30s 的中值）
INITIAL_WINDOW_S = 1.5           # 边界吸附窗口初值
WINDOW_SHRINK = [1.5, 1.0, 0.5]  # 段长越界时依次收紧
SEGMENT_MIN_S, SEGMENT_MAX_S = 15.0, 30.0
TOTAL_SEGMENTS = 4
SIGNIFICANCE_PERCENTILE = 60.0   # 起音强度需 ≥ 该分位（全曲）才算"显著"
SIGNIFICANCE_RATIO = 1.2         # 且需与窗口内 P90 拉开该倍数（"这一拍真的凸出来"）
SIGNIFICANCE_FLOOR = 0.02        # 绝对下限（归一化包络；挡住"整窗都是噪声"的情形）

# ── 响度（BS.1770-4，48kHz）────────────────────────────────────────────────
TARGET_LUFS = -16.0
PEAK_CEILING_DBFS = -1.0
# K 加权：stage1 高频架、stage2 RLB 高通（48kHz 标准系数）
K_STAGE1_B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
K_STAGE1_A = [1.0, -1.69065929318241, 0.73248077421585]
K_STAGE2_B = [1.0, -2.0, 1.0]
K_STAGE2_A = [1.0, -1.99004745483398, 0.99007225036621]


def log(msg: str) -> None:
    print(msg, flush=True)


# ── 解码 ───────────────────────────────────────────────────────────────────
def decode(path: Path, sample_rate: int, channels: int = 1) -> np.ndarray:
    decoded = miniaudio.decode_file(
        str(path),
        output_format=miniaudio.SampleFormat.FLOAT32,
        nchannels=channels,
        sample_rate=sample_rate,
    )
    samples = np.asarray(decoded.samples, dtype=np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples


# ── 音强包络（spectral flux）──────────────────────────────────────────────
def onset_envelope(samples: np.ndarray, sample_rate: int, window: int = 2048, hop: int = 512,
                   low_band_hz: float | None = None, high_band_hz: float | None = None) -> dict:
    """
    返回 onset 包络（已去均值、半波整流、按分位数归一）与相关元信息。

    取 log 幅度谱的正向差分（spectral flux）—— 对"起音"敏感，对稳态和声不敏感，
    因此比自相关更不容易被和声/颤音带偏（captain 那版自相关实测偏差 4.7%–16.8%）。
    """
    if samples.size < window * 2:
        raise ValueError("音频太短")
    frames = 1 + (samples.size - window) // hop
    idx = np.arange(window)[None, :] + hop * np.arange(frames)[:, None]
    frames_data = samples[idx] * np.hanning(window)[None, :]
    spectrum = np.abs(np.fft.rfft(frames_data, axis=1))
    freqs = np.fft.rfftfreq(window, d=1.0 / sample_rate)

    band = np.ones_like(freqs, dtype=bool)
    if low_band_hz is not None:
        band &= freqs >= low_band_hz
    if high_band_hz is not None:
        band &= freqs <= high_band_hz
    mag = spectrum[:, band]

    log_mag = np.log1p(1000.0 * mag)
    flux = np.diff(log_mag, axis=0, prepend=log_mag[:1])
    env = np.maximum(flux, 0.0).sum(axis=1)

    # 去慢变均值（去掉整体音量起伏）+ 半波整流
    smooth_win = max(3, int(0.35 * sample_rate / hop)) | 1
    kernel = np.ones(smooth_win) / smooth_win
    baseline = np.convolve(env, kernel, mode="same")
    env = np.maximum(env - baseline, 0.0)

    scale = float(np.percentile(env, 99)) or 1.0
    env = env / scale
    return {
        "envelope": env,
        "hop_s": hop / sample_rate,
        "sample_rate": sample_rate,
        "frames": frames,
    }


def envelope_time(env: dict) -> np.ndarray:
    return np.arange(env["frames"]) * env["hop_s"]


# ── BPM：包络的 DFT 速度显著度 + 谐波加权 ──────────────────────────────────
def tempo_candidates(env: dict, bpm_min: float = 40.0, bpm_max: float = 200.0,
                     step: float = 0.05) -> list[tuple[float, float]]:
    signal = env["envelope"] - env["envelope"].mean()
    n = signal.size
    spectrum = np.abs(np.fft.rfft(signal * np.hanning(n)))
    freqs = np.fft.rfftfreq(n, d=env["hop_s"])  # Hz

    results: list[tuple[float, float]] = []
    for bpm in np.arange(bpm_min, bpm_max + 1e-9, step):
        f = bpm / 60.0
        score = 0.0
        for harmonic, weight in ((1, 1.0), (2, 0.5), (3, 0.33), (4, 0.25)):
            target = f * harmonic
            if target > freqs[-1]:
                continue
            pos = int(round(target / (freqs[1] if len(freqs) > 1 else 1.0)))
            if 0 <= pos < spectrum.size:
                score += weight * float(spectrum[pos])
        results.append((float(bpm), score))
    results.sort(key=lambda item: item[1], reverse=True)
    return results


def refine_tempo_phase(env: dict, bpm: float) -> tuple[float, float, float]:
    """
    在给 BPM 邻域细调并求最佳相位：score = 网格点上包络之和（comb 对齐）。
    返回 (最佳 BPM, 相位秒, 对齐得分)。
    """
    times = envelope_time(env)
    e = env["envelope"]
    best = (-1.0, bpm, 0.0)
    for candidate in np.arange(max(20.0, bpm - 3.0), bpm + 3.0 + 1e-9, 0.01):
        period = 60.0 / candidate
        for phase in np.arange(0.0, period, period / 24.0):
            grid = np.arange(phase, times[-1], period)
            idx = np.clip(np.searchsorted(times, grid), 0, e.size - 1)
            score = float(e[idx].sum() / max(1, grid.size))
            if score > best[0]:
                best = (score, float(candidate), float(phase))
    return best[1], best[2], best[0]


# ── 拍号：节拍网格上的重音轮廓 ─────────────────────────────────────────────
def meter_scores(env: dict, bpm: float, phase_s: float) -> dict[int, dict]:
    times = envelope_time(env)
    e = env["envelope"]
    period = 60.0 / bpm
    beats = np.arange(phase_s, times[-1], period)
    idx = np.clip(np.searchsorted(times, beats), 0, e.size - 1)
    accent = e[idx]
    out: dict[int, dict] = {}
    for meter in (2, 3, 4, 6):
        usable = (accent.size // meter) * meter
        if usable < meter * 4:
            continue
        grid = accent[:usable].reshape(-1, meter)
        profile = grid.mean(axis=0)
        overall = float(profile.mean()) or 1e-9
        contrast = float((profile.max() - profile.min()) / overall)
        downbeat = int(np.argmax(profile))
        # 周期一致性：把 profile 按最佳 downbeat 对齐后，第 1 拍是否稳定最强
        aligned = np.roll(grid, -downbeat, axis=1)
        first = aligned[:, 0]
        others = aligned[:, 1:].mean(axis=1) if meter > 1 else aligned[:, 0]
        consistency = float(((first > others).mean()))
        out[meter] = {
            "contrast": contrast,
            "profile": [float(v) for v in profile],
            "downbeatIndex": downbeat,
            "downbeatStability": consistency,
            "score": contrast * (0.5 + consistency),
        }
    return out


# ── 分段：边界吸附 ─────────────────────────────────────────────────────────
def snap_boundaries(env: dict, duration_s: float, window_s: float) -> tuple[list[dict], float]:
    times = envelope_time(env)
    e = env["envelope"]
    targets = [0.0] + [TARGET_SEGMENT_S * i for i in range(1, TOTAL_SEGMENTS)] + [TARGET_SEGMENT_S * TOTAL_SEGMENTS]
    overall_gate = float(np.percentile(e, SIGNIFICANCE_PERCENTILE))

    boundaries: list[dict] = []
    for position, target in enumerate(targets):
        if position == 0:
            boundaries.append({
                "targetS": 0.0, "snappedS": 0.0, "onsetStrength": None,
                "windowMedian": None, "percentile": None, "significant": True,
                "note": "曲目起点（不吸附）",
            })
            continue
        if position == len(targets) - 1:
            boundaries.append({
                "targetS": round(target, 3), "snappedS": round(min(duration_s, target), 3),
                "onsetStrength": None, "windowMedian": None, "percentile": None,
                "significant": True, "note": "曲目终点（不吸附）",
            })
            continue
        lo, hi = max(0.0, target - window_s), min(duration_s, target + window_s)
        mask = (times >= lo) & (times <= hi)
        if not mask.any():
            raise ValueError("窗口内没有帧")
        window_env = e[mask]
        local = int(np.argmax(window_env))
        snap_time = float(times[mask][local])
        strength = float(window_env[local])
        percentile = float((e <= strength).mean() * 100.0)
        median = float(np.median(window_env))
        p90 = float(np.percentile(window_env, 90))
        # "显著"= 全曲分位够高 **且** 窗口内该峰明显高出 P90 **且** 有绝对量级。
        # 不用中位数：包络经过半波整流后大量帧为 0，中位数恒为 0，判定会退化成"永远通过"。
        significant = bool(
            strength >= overall_gate
            and strength >= SIGNIFICANCE_RATIO * max(p90, 1e-9)
            and strength >= SIGNIFICANCE_FLOOR
        )
        boundaries.append({
            "targetS": round(target, 3),
            "snappedS": round(snap_time, 3),
            "onsetStrength": round(strength, 5),
            "windowMedian": round(median, 5),
            "windowP90": round(p90, 5),
            "percentile": round(percentile, 1),
            "significant": significant,
            "note": "吸附到窗口内最强起音" if significant else "窗口内起音不显著 → 待人工复核",
        })
    return boundaries, overall_gate


def segment_table(env: dict, duration_s: float) -> dict:
    """按 §19.2 生成分段表；段长越界时依次收紧吸附窗口重算。"""
    for window_s in WINDOW_SHRINK:
        boundaries, gate = snap_boundaries(env, duration_s, window_s)
        lengths = [
            boundaries[i + 1]["snappedS"] - boundaries[i]["snappedS"]
            for i in range(len(boundaries) - 1)
        ]
        if all(SEGMENT_MIN_S <= length <= SEGMENT_MAX_S for length in lengths):
            return {
                "windowS": window_s,
                "significanceGate": round(gate, 5),
                "boundaries": boundaries,
                "segmentLengthsS": [round(length, 3) for length in lengths],
                "totalS": round(sum(lengths), 3),
            }
        log(f"    · 窗口 ±{window_s}s 下段长越界 {[round(v,2) for v in lengths]} → 收紧窗口重算")
    raise RuntimeError("收紧到最窄窗口仍越界，需人工介入")


# ── 响度（BS.1770-4）───────────────────────────────────────────────────────
def biquad_response(b: list[float], a: list[float], freqs: np.ndarray, sample_rate: int) -> np.ndarray:
    w = 2.0 * np.pi * freqs / sample_rate
    z = np.exp(-1j * w)
    num = sum(coef * z ** i for i, coef in enumerate(b))
    den = sum(coef * z ** i for i, coef in enumerate(a))
    return num / den


def k_weight(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    """整段 K 加权：在频域乘以双二阶滤波器响应（线性时不变，等价于时域递归滤波）。"""
    n = samples.size
    spectrum = np.fft.rfft(samples)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)
    response = biquad_response(K_STAGE1_B, K_STAGE1_A, freqs, sample_rate) * biquad_response(
        K_STAGE2_B, K_STAGE2_A, freqs, sample_rate
    )
    return np.fft.irfft(spectrum * response, n=n)


def integrated_loudness_lufs(samples: np.ndarray, sample_rate: int = 48_000) -> float:
    weighted = k_weight(samples, sample_rate)
    block = int(0.4 * sample_rate)
    step = int(0.1 * sample_rate)
    if weighted.size < block:
        return float("-inf")
    starts = np.arange(0, weighted.size - block + 1, step)
    power = np.array([float(np.mean(weighted[s:s + block] ** 2)) for s in starts])
    with np.errstate(divide="ignore"):
        loudness = -0.691 + 10.0 * np.log10(np.maximum(power, 1e-20))
    keep = loudness > -70.0
    if not keep.any():
        return float("-inf")
    ungated = -0.691 + 10.0 * math.log10(float(np.mean(power[keep])))
    relative_gate = ungated - 10.0
    keep2 = keep & (loudness > relative_gate)
    if not keep2.any():
        keep2 = keep
    return -0.691 + 10.0 * math.log10(float(np.mean(power[keep2])))


# ── 主流程 ─────────────────────────────────────────────────────────────────
"""曲目固定 id：与 `apps/api/src/db/seed.ts` 的派生方案**一致**。
这样 t13 的入库是"把占位歌换成真歌"，而不是再造三首新歌 —— 已存在的瓶子与外键不会断。"""
SONG_IDS = {
    "Immersed.mp3": "00000000-0000-4000-8000-000000000001",
    "Rains Will Fall.mp3": "00000000-0000-4000-8000-000000000002",
    "On the Shore.mp3": "00000000-0000-4000-8000-000000000003",
}
ORDINALS = {"Immersed.mp3": 1, "Rains Will Fall.mp3": 2, "On the Shore.mp3": 3}
TITLES = {
    "Immersed.mp3": "Immersed",
    "Rains Will Fall.mp3": "Rains Will Fall",
    "On the Shore.mp3": "On the Shore",
}
PUBLIC_REF = {
    "Immersed.mp3": "/library/Immersed.mp3",
    "Rains Will Fall.mp3": "/library/Rains%20Will%20Fall.mp3",
    "On the Shore.mp3": "/library/On%20the%20Shore.mp3",
}

OFFICIAL = {
    "Immersed.mp3": {"bpm": 64, "desc": "Piano+Strings（官方 Tempo 64）"},
    "Rains Will Fall.mp3": {"bpm": 85, "desc": "Piano+Kit+Strings（官方描述里唯一的圆舞曲）"},
    "On the Shore.mp3": {"bpm": 82, "desc": "Strings+Glock+Tympani+Flute"},
}


# ── 速度选择：预注册规则 R-1 … R-6（规则先于结果写在 docs/library-analysis.md §3）──
TOP_CANDIDATES = 12
OCTAVE_UP_RATIO = 0.75    # r ≥ 0.75 → 交错位置同样重 ⇒ 细分层级才是真节拍（升一级）
OCTAVE_KEEP_RATIO = 0.55  # r ≤ 0.55 → 交错位置明显弱 ⇒ 粗层级是真节拍（保持）
BPM_MIN, BPM_MAX = 40.0, 200.0
TACTUS_BAND = (60.0, 120.0)  # R-4b 预注册约定带（与任何期望值无关）


def mean_env_at(env: dict, points: np.ndarray) -> float:
    """网格点上的包络均值（除以点数，故不因网格更密而系统性偏高）。"""
    times = envelope_time(env)
    e = env["envelope"]
    if points.size == 0:
        return 0.0
    idx = np.clip(np.searchsorted(times, points), 0, e.size - 1)
    return float(e[idx].mean())


def interleaved_ratio(env: dict, bpm: float, phase_s: float) -> float:
    """R-4 的 r = mean(env @ 交错点) / mean(env @ 粗网格点)。"""
    times = envelope_time(env)
    period = 60.0 / bpm
    coarse = np.arange(phase_s, times[-1], period)
    mid = coarse + period / 2.0
    mid = mid[mid <= times[-1]]
    denom = mean_env_at(env, coarse)
    if denom <= 1e-9:
        return 0.0
    return mean_env_at(env, mid) / denom


def coarser_ratio(env: dict, bpm: float, phase_s: float) -> float:
    """R-4 向下测：L 相对 L/2 多出来的那些点，是否真的也重。
    r_coarser = mean(env @ L 网格中不在 L/2 网格上的点) / mean(env @ L/2 网格点)。"""
    times = envelope_time(env)
    period = 60.0 / bpm
    half_bpm = bpm / 2.0
    if half_bpm < BPM_MIN:
        return 1.0
    half_bpm_ref, half_phase, _score = refine_tempo_phase(env, half_bpm)
    half_period = 60.0 / half_bpm_ref
    half_grid = np.arange(half_phase, times[-1], half_period)
    l_grid = np.arange(phase_s, times[-1], period)
    if l_grid.size == 0 or half_grid.size == 0:
        return 1.0
    nearest = np.abs(l_grid[:, None] - half_grid[None, :]).min(axis=1)
    extra = l_grid[nearest > half_period * 0.25]
    denom = mean_env_at(env, half_grid)
    if denom <= 1e-9:
        return 1.0
    return mean_env_at(env, extra) / denom


def select_tempo(env: dict, prefer_finer: bool = False, band: tuple[float, float] = TACTUS_BAND) -> dict:
    """按 R-1…R-6 选择节拍层级。**不读官方 BPM**。
    prefer_finer / band 仅供自测变异（S-3：反转约定带）使用，生产调用用默认值。"""
    raw = tempo_candidates(env, bpm_min=BPM_MIN, bpm_max=BPM_MAX)[:TOP_CANDIDATES]
    expanded: dict[float, float] = {}
    for bpm, _score in raw:
        for cand in (bpm, bpm / 2.0, bpm * 2.0):
            if BPM_MIN <= cand <= BPM_MAX:
                expanded[round(cand, 2)] = cand

    refined: list[dict] = []
    for cand in expanded.values():
        bpm, phase, score = refine_tempo_phase(env, cand)
        if BPM_MIN <= bpm <= BPM_MAX:
            refined.append({"bpm": bpm, "phaseS": phase, "score": score})
    refined.sort(key=lambda item: item["score"], reverse=True)
    best = refined[0]
    runner_up = refined[1] if len(refined) > 1 else {"bpm": 0.0, "phaseS": 0.0, "score": 0.0}

    level = best
    pre_convention_bpm = best["bpm"]
    pre_convention_sn = best["score"]
    decision = "初选：argmax Sn（R-3）"
    ambiguous = False
    ratio = interleaved_ratio(env, level["bpm"], level["phaseS"])
    coarser = coarser_ratio(env, level["bpm"], level["phaseS"])

    if prefer_finer:
        up = level["bpm"] * 2.0
        if BPM_MIN <= up <= BPM_MAX:
            bpm, phase, score = refine_tempo_phase(env, up)
            level = {"bpm": bpm, "phaseS": phase, "score": score}
            decision = "变异开关 S-3：强制偏好细分层级（不得用于生产）"
    elif coarser <= OCTAVE_KEEP_RATIO:
        # 向下：L 多出来的点很弱 ⇒ L 只是更粗层级的细分
        down = level["bpm"] / 2.0
        if BPM_MIN <= down <= BPM_MAX:
            bpm, phase, score = refine_tempo_phase(env, down)
            level = {"bpm": bpm, "phaseS": phase, "score": score}
            decision = "R-4 降一级：相对更粗层级多出的拍点很弱（r_coarser <= 0.55），L 是细分"
            ratio = interleaved_ratio(env, level["bpm"], level["phaseS"])
            coarser = coarser_ratio(env, level["bpm"], level["phaseS"])
            if OCTAVE_KEEP_RATIO < ratio < OCTAVE_UP_RATIO:
                ambiguous = True
        else:
            decision = "R-4 保持：已达搜索下限"
    elif ratio >= OCTAVE_UP_RATIO and level["bpm"] * 2.0 <= BPM_MAX:
        bpm, phase, score = refine_tempo_phase(env, level["bpm"] * 2.0)
        level = {"bpm": bpm, "phaseS": phase, "score": score}
        decision = "R-4 升一级：交错位置同样重（r_finer >= 0.75），细分层级才是真节拍"
    elif OCTAVE_KEEP_RATIO < ratio < OCTAVE_UP_RATIO:
        decision = "R-4 僵持（0.55 < r_finer < 0.75）：报出 L 与备选层级，L 作暂定值"
        ambiguous = True
    else:
        decision = "R-4 保持：交错位置明显弱（r_finer <= 0.55），本层级是真节拍"

    # ── R-4b 八度约定：僵持或并列时，取落在预注册打拍带内的层级（不看官方值）──
    convention_applied = False
    tie = best["score"] <= 0 or (len(refined) > 1 and (best["score"] - refined[1]["score"]) / max(best["score"], 1e-9) < 0.01)
    if not prefer_finer and (ambiguous or tie):
        options = sorted({round(level["bpm"], 2), round(level["bpm"] / 2.0, 2), round(level["bpm"] * 2.0, 2)})
        # 容差 1 BPM：2×L 可能因精调落在 200.06 这类边界外一点点，不应因此漏掉该层级
        in_band = [
            value for value in options
            if BPM_MIN - 1.0 <= value <= BPM_MAX + 1.0
            and band[0] - 1.0 <= value < band[1] + 1.0
        ]
        if len(in_band) == 1:
            bpm, phase, score = refine_tempo_phase(env, in_band[0])
            level = {"bpm": bpm, "phaseS": phase, "score": score}
            ratio = interleaved_ratio(env, level["bpm"], level["phaseS"])
            coarser = coarser_ratio(env, level["bpm"], level["phaseS"])
            convention_applied = True
            ambiguous = bool(OCTAVE_KEEP_RATIO < ratio < OCTAVE_UP_RATIO)
            decision = (
                f"R-4b 约定：argmax 结论为僵持/并列，改取落在预注册打拍带 "
                f"[{band[0]:.0f},{band[1]:.0f}) 的层级（数据本身未定夺）"
            )

    # 备选层级（供读者看结论有多决定性）
    alternative = level["bpm"] * 2.0 if level["bpm"] * 2.0 <= BPM_MAX else level["bpm"] / 2.0
    alt_bpm, alt_phase, alt_score = refine_tempo_phase(env, alternative)

    return {
        "bpm": level["bpm"],
        "phaseS": level["phaseS"],
        "sn": level["score"],
        "decision": decision,
        "ambiguous": ambiguous,
        "conventionApplied": convention_applied,
        "preConventionBpm": round(pre_convention_bpm, 2),
        "preConventionSn": round(pre_convention_sn, 4),
        "conventionSnRatio": round(level["score"] / max(pre_convention_sn, 1e-9), 4),
        "tactusBand": list(band),
        "interleavedRatio": round(ratio, 4),
        "coarserRatio": round(coarser, 4),
        "ratioBands": {"keepAt": OCTAVE_KEEP_RATIO, "upAt": OCTAVE_UP_RATIO},
        "ratioDistance": {
            "toKeepBand": round(ratio - OCTAVE_KEEP_RATIO, 4),
            "toUpBand": round(ratio - OCTAVE_UP_RATIO, 4),
        },
        "alternative": {
            "bpm": round(alt_bpm, 2),
            "sn": round(alt_score, 4),
            "snRatio": round(alt_score / max(level["score"], 1e-9), 4),
        },
        "runnerUp": {
            "bpm": round(runner_up["bpm"], 2),
            "sn": round(runner_up["score"], 4),
            "marginPercent": round((level["score"] - runner_up["score"]) / max(level["score"], 1e-9) * 100.0, 2),
        },
        "top": [{"bpm": round(item["bpm"], 2), "sn": round(item["score"], 4)} for item in refined[:6]],
    }


def analyze(path: Path, official_bpm: int) -> dict:
    log(f"\n── {path.name} ─────────────────────────────")
    analysis_rate = 22_050
    samples = decode(path, analysis_rate)
    duration_s = samples.size / analysis_rate
    log(f"  解码：{duration_s:.2f}s @ {analysis_rate}Hz 单声道（分析用）")

    full = onset_envelope(samples, analysis_rate)
    low = onset_envelope(samples, analysis_rate, low_band_hz=40.0, high_band_hz=250.0)

    candidates = tempo_candidates(full)
    log("  BPM top-6 候选（包络 DFT 显著度，含 2/3/4 次谐波加权）：")
    for bpm, score in candidates[:6]:
        log(f"    · {bpm:7.2f} BPM  score={score:10.1f}   （官方 {official_bpm} 的比 {bpm/official_bpm:.3f}）")

    # ── R-1…R-6：**纯音频**选择节拍层级（官方值不参与；规则预注册见 docs/library-analysis.md §3）──
    decision = select_tempo(full)
    measured_bpm = decision["bpm"]
    phase_s = decision["phaseS"]
    comb_score = decision["sn"]
    log("  速度判定（预注册规则 R-1…R-6，官方值不参与选择）：")
    log(f"    决策：{decision['decision']}")
    log(f"    选定 {measured_bpm:.2f} BPM · Sn {comb_score:.4f} · 相位 {phase_s*1000:.1f}ms"
        f" · 与次优 Sn 的边际 {decision['runnerUp']['marginPercent']:.1f}%（次优 {decision['runnerUp']['bpm']:.2f}）")
    log(f"    八度消歧 r（交错/粗网格包络均值）= {decision['interleavedRatio']:.3f}"
        f" · 判定带 [{decision['ratioBands']['keepAt']}, {decision['ratioBands']['upAt']}]"
        f" · 到带距 keep {decision['ratioDistance']['toKeepBand']:+.3f} / up {decision['ratioDistance']['toUpBand']:+.3f}"
        f" · {'⚠ 僵持，暂定值' if decision['ambiguous'] else '非僵持'}")
    log(f"    备选层级 {decision['alternative']['bpm']:.2f} BPM 的 Sn 比 = {decision['alternative']['snRatio']:.3f}"
        f" · top6 Sn {[item['sn'] for item in decision['top']]}")
    # R-6：官方值只作事后盲比对（下行的 deviation 是输出，不是输入）
    deviation = (measured_bpm - official_bpm) / official_bpm * 100.0
    log(f"  细调后 BPM = {measured_bpm:.2f}（相位 {phase_s*1000:.1f}ms，梳状对齐得分 {comb_score:.4f}）"
        f" → 相对官方 {official_bpm} 偏差 {deviation:+.2f}%")

    meters_full = meter_scores(full, measured_bpm, phase_s)
    meters_low = meter_scores(low, measured_bpm, phase_s)
    log("  拍号评分（节拍网格上的重音轮廓）：")
    log("    meter | 全频 contrast/稳定性/总分 | 低频(40–250Hz) contrast/稳定性/总分")
    for meter in sorted(meters_low):
        f = meters_full.get(meter)
        l = meters_low[meter]
        log(f"      {meter}/4 | {f['contrast']:.3f} / {f['downbeatStability']:.2f} / {f['score']:.3f}"
            f"      | {l['contrast']:.3f} / {l['downbeatStability']:.2f} / {l['score']:.3f}")
    ranked = sorted(meters_low.items(), key=lambda item: item[1]["score"], reverse=True)
    best_meter, best = ranked[0]

    # ── 次谐波优先（Occam）：6/4 这类"两小节"周期只是 3/4 的谐波别名 ──
    # 圆舞曲在 85 BPM 下：低频重音周期是 3 拍；6 与 3 的分数接近时必须选更简单的 3/4，
    # 否则会把"每两小节的强弱交替"误当成拍号（这正是 captain 那版检测器出错的方向之一）。
    chosen_meter, chosen = best_meter, best
    for meter in sorted(meters_low):
        if best_meter % meter == 0 and meter != best_meter:
            candidate = meters_low[meter]
            if candidate["score"] >= 0.85 * best["score"]:
                chosen_meter, chosen = meter, candidate
                log(f"  · 次谐波优先：{meter}/4 得分 {candidate['score']:.3f} ≥ 0.85×最优({best_meter}/4 "
                    f"{best['score']:.3f})，且 {best_meter} 是它的整数倍 → 取更简单的 {meter}/4")
                break

    # 置信边际只跟"非谐波关系"的对手比：6/4 是 3/4 的两小节别名，不是竞争解释，
    # 把它算进来会把一个正确的 3/4 判定压成 LOW（会误导用户去怀疑正确结论）。
    def harmonically_related(a: int, b: int) -> bool:
        return a % b == 0 or b % a == 0

    rivals = [v["score"] for m, v in meters_low.items() if not harmonically_related(m, chosen_meter)]
    runner_up = max(rivals) if rivals else 0.0
    margin = (chosen["score"] - runner_up) / max(chosen["score"], 1e-9)
    confidence = "HIGH" if margin >= 0.25 else "MEDIUM" if margin >= 0.10 else "LOW"
    aliases = {
        str(m): round(v["score"], 3)
        for m, v in meters_low.items()
        if m != chosen_meter and harmonically_related(m, chosen_meter)
    }
    log(f"  拍号判定：{chosen_meter}/4（低频重音轮廓；原始最优 {best_meter}/4）"
        f"· 与最强非谐波对手的边际 {margin*100:.1f}% → 置信 {confidence}"
        f"· 谐波别名 {aliases if aliases else '无'}")

    segments = segment_table(full, duration_s)
    log(f"  分段（窗口 ±{segments['windowS']}s，起音显著门限 {segments['significanceGate']}）：")
    for i, boundary in enumerate(segments["boundaries"]):
        if boundary["onsetStrength"] is None:
            log(f"    边界 {i}: {boundary['snappedS']:8.3f}s  {boundary['note']}")
            continue
        log(f"    边界 {i}: 目标 {boundary['targetS']:7.3f}s → 吸附 {boundary['snappedS']:8.3f}s"
            f"  起音强度 {boundary['onsetStrength']:.4f}（全曲 {boundary['percentile']:.1f} 分位；"
            f"窗口内 P90 {boundary['windowP90']:.4f}、中位数 {boundary['windowMedian']:.4f}）"
            f"  {'显著' if boundary['significant'] else '待人工复核'}")
    log(f"    段长：{[round(v,2) for v in segments['segmentLengthsS']]}s  总长 {segments['totalS']:.2f}s")

    loudness_rate = 48_000
    loud_samples = decode(path, loudness_rate)
    lufs = integrated_loudness_lufs(loud_samples, loudness_rate)
    peak = float(np.max(np.abs(loud_samples)))
    peak_dbfs = 20.0 * math.log10(max(peak, 1e-9))
    log(f"  响度：{lufs:.2f} LUFS（BS.1770-4 门限积分）· 样本峰值 {peak_dbfs:+.2f} dBFS")

    period_s = 60.0 / measured_bpm
    beat_positions = [phase_s + k * period_s for k in range(int(duration_s / period_s) + 2)]
    table = []
    for index, (start, end) in enumerate(
        zip([b["snappedS"] for b in segments["boundaries"]][:-1],
            [b["snappedS"] for b in segments["boundaries"]][1:]),
        start=1,
    ):
        beats_before = sum(1 for t in beat_positions if t <= start + 1e-6)
        beats_span = sum(1 for t in beat_positions if start + 1e-6 < t <= end + 1e-6)
        bars = beats_span / chosen_meter
        table.append({
            "index": index,
            "startMs": int(round(start * 1000)),
            "endMs": int(round(end * 1000)),
            "durationMs": int(round((end - start) * 1000)),
            "startBeat": beats_before,
            "startBar": round(beats_before / chosen_meter, 2),
            "barCount": round(bars, 2),
        })

    return {
        "file": path.name,
        "title": TITLES[path.name],
        "songId": SONG_IDS[path.name],
        "ordinal": ORDINALS[path.name],
        "accompanimentRef": PUBLIC_REF[path.name],
        "durationS": round(duration_s, 3),
        "officialBpm": official_bpm,
        "officialNote": OFFICIAL[path.name]["desc"],
        "measuredBpm": round(measured_bpm, 2),
        "bpmDeviationPercent": round(deviation, 2),
        "beatPhaseMs": round(phase_s * 1000, 1),
        "tempoDecision": decision,
        "tempoCandidates": [{"bpm": round(b, 2), "score": round(s, 1)} for b, s in candidates[:8]],
        "meter": chosen_meter,
        "meterRawBest": best_meter,
        "meterConfidence": confidence,
        "meterMargin": round(margin, 4),
        "meterHarmonicAliases": aliases,
        "meterScores": {
            str(m): {
                "fullContrast": round(meters_full[m]["contrast"], 4),
                "lowContrast": round(v["contrast"], 4),
                "lowDownbeatStability": round(v["downbeatStability"], 3),
                "lowScore": round(v["score"], 4),
            }
            for m, v in sorted(meters_low.items())
        },
        "loudnessLufs": round(lufs, 2),
        "samplePeakDbfs": round(peak_dbfs, 2),
        "segments": table,
        "segmentEvidence": segments,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=None, help="只分析指定文件名")
    parser.add_argument("--no-write", action="store_true", help="只打印，不写 library.json")
    args = parser.parse_args()

    files = sorted(p for p in LIBRARY_DIR.glob("*.mp3"))
    if args.only:
        files = [p for p in files if p.name == args.only]
    if not files:
        log("没有找到 mp3（apps/web/public/library/*.mp3）")
        return 1

    results = [analyze(path, OFFICIAL[path.name]["bpm"]) for path in files]

    # 响度归一：**只用增益、不做任何限幅/压缩**，并让三首达到同一积分响度。
    # 关键：逐首"打到 -16 LUFS"会顶破峰值上限（三首都顶破），于是改为先求
    # 「在峰值上限约束下三首都能达到的最大等响目标」= min_i(LUFS_i + ceiling - peak_i)，
    # 再与标称目标取小。这样等响、不削波，且不改动 CC BY 素材的动态。
    log("\n── 响度归一 ────────────────────────────────")
    max_safe_target = min(
        r["loudnessLufs"] + (PEAK_CEILING_DBFS - r["samplePeakDbfs"]) for r in results
    )
    target = min(TARGET_LUFS, max_safe_target)
    policy = "标称目标可达" if target >= TARGET_LUFS - 1e-9 else "标称目标会使峰值越界 → 取等响上限"
    log(f"  等响上限（不削波）= {max_safe_target:.2f} LUFS；标称 {TARGET_LUFS} LUFS → 实际目标 {target:.2f} LUFS（{policy}）")
    for result in results:
        raw_gain = target - result["loudnessLufs"]
        headroom = PEAK_CEILING_DBFS - result["samplePeakDbfs"]
        gain = min(raw_gain, headroom)
        result["normalization"] = {
            "targetLufs": round(target, 2),
            "nominalTargetLufs": TARGET_LUFS,
            "maxSafeTargetLufs": round(max_safe_target, 2),
            "policy": policy,
            "gainDb": round(gain, 2),
            "gainLimitedByPeak": bool(gain < raw_gain - 1e-9),
            "resultingPeakDbfs": round(result["samplePeakDbfs"] + gain, 2),
            "resultingLufs": round(result["loudnessLufs"] + gain, 2),
        }
        log(f"  {result['file']:22s} {result['loudnessLufs']:+7.2f} → "
            f"{result['normalization']['resultingLufs']:+7.2f} LUFS  增益 {gain:+6.2f} dB  "
            f"峰值 {result['samplePeakDbfs']:+.2f} → {result['normalization']['resultingPeakDbfs']:+.2f} dBFS"
            f"{'（受峰值上限限制）' if result['normalization']['gainLimitedByPeak'] else ''}")
    log(f"  （峰值上限 {PEAK_CEILING_DBFS} dBFS；仅增益，未做限幅/压缩）")

    payload = {
        "generatedBy": "tools/library-analysis.py",
        "headroomPolicy": {
            "peakCeilingDbfs": PEAK_CEILING_DBFS,
            "nominalTargetLufs": TARGET_LUFS,
            "maxSafeEqualLoudnessLufs": round(min(
                r["loudnessLufs"] + (PEAK_CEILING_DBFS - r["samplePeakDbfs"]) for r in results
            ), 2),
            "processing": "仅增益，无限幅/压缩",
        },
        "note": "**候选表**：分段边界需用户听感确认后才定稿（t13 第 3 条）。onset 证据见 segmentEvidence。",
        "targetLufs": TARGET_LUFS,
        "tracks": results,
    }
    if not args.no_write:
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        log(f"\n已写出 {OUTPUT.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
