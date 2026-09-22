/** 录音计时与播放位置的文本格式化（纯函数；DESIGN.md 要求进度必须有文字表达，不能只靠波形颜色）。 */

/** `mm:ss`（两位补零）；非法输入回落 `00:00`，避免计时器闪出 `NaN:NaN`。 */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 一位小数的秒数（不带单位，由调用方拼"秒"），用于「12.4 / 30 秒」这类标签。 */
export function formatSeconds(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0';
  return (ms / 1000).toFixed(1);
}
