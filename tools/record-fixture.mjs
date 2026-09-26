/**
 * 真音频 fixture 录制器（W8）—— 给 `tools/seed-demo.mjs` 供一段**真能解码**的段音频。
 *
 * 为什么需要它：W3 的 seed 在 Node 里没有 `MediaRecorder`，于是上传了"EBML 魔数 + 伪随机字节"的
 * **合成容器**——它能过服务端的容器嗅探与时长校验，但浏览器解码器打不开
 * （`DEMUXER_ERROR_COULD_NOT_OPEN`）⇒ 评委点「试听」不出声。本脚本用**无头 Chromium 的假麦克风**
 * （`--use-fake-device-for-media-stream`）走真 `MediaRecorder` 录一段，把字节落地成 fixture，
 * seed 之后直接复用（不必每次施种都起浏览器）。
 *
 * 机制：
 * - **playwright 只从 npx 缓存里取**（本仓不登记该依赖，AGENTS §7），与 `tools/walkthrough.mjs` 同一条路径；
 * - 录制页由本脚本自己用一个 `node:http` 服务在 `127.0.0.1:<临时端口>` 上提供
 *   （`getUserMedia` 只在可信源可用；`127.0.0.1`/`localhost` 是可信源），**不依赖** API/站点服务器，
 *   也不需要任何后端在跑；
 * - 录完在**同一个页面里立刻自证**：用 `<audio>` 播 1.2 秒，`currentTime` 必须真的前进且 `error` 为空
 *   —— 这就是"这段字节可解码"的当场证据（不是看文件头猜的）；自证不过就**不落地**；
 * - **幂等**：目标文件已存在且没给 `--force` 时直接跳过并报告现状（第二次跑不重录）。
 *
 * 用法：
 *   node tools/record-fixture.mjs                       # 录 20 秒 → tools/fixtures/demo-segment.webm
 *   node tools/record-fixture.mjs --seconds=8           # 录短一点（快速场景）
 *   node tools/record-fixture.mjs --out=<path> --force  # 换路径 / 重录
 * 退出码：0 = fixture 就绪；1 = 录制或自证失败。
 */
/* eslint-disable no-console */
/* global Audio, MediaRecorder */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 默认 fixture 落点（`tools/seed-demo.mjs` 读的就是它）。 */
export const DEFAULT_FIXTURE = join(ROOT, 'tools', 'fixtures', 'demo-segment.webm');

/** sha256（seed 与 runbook 都用它核对"是不是同一段字节"）。 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** playwright 从 npx 缓存里取（与 `tools/walkthrough.mjs` 同路径；本仓不登记该依赖）。 */
async function loadPlaywright() {
  const cacheRoot = join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  if (!existsSync(cacheRoot)) {
    throw new Error(`npx 缓存目录不存在：${cacheRoot}（先跑一次 npx playwright --version）`);
  }
  for (const entry of readdirSync(cacheRoot)) {
    const candidate = join(cacheRoot, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return await import(`file://${candidate.replaceAll('\\', '/')}`);
  }
  throw new Error('找不到 playwright（npx 缓存里没有；先跑一次 `npx playwright --version`）');
}

/** 录制页服务器：可信源（127.0.0.1）上的一张空白页即可，`MediaRecorder` 不需要任何 DOM。 */
async function serveBlankPage() {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>record-fixture</title>');
  });
  await new Promise((done) => {
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { server, origin: `http://127.0.0.1:${String(port)}` };
}

/**
 * 录一段真 WebM/Opus 并落地。
 * @param {{ out?: string, seconds?: number, force?: boolean, log?: (line: string) => void }} [options]
 * @returns {Promise<{ path: string, bytes: number, sha256: string, skipped: boolean }>}
 */
export async function recordFixture(options = {}) {
  const out = resolve(options.out ?? DEFAULT_FIXTURE);
  const seconds = Number(options.seconds ?? 20);
  const force = options.force === true;
  const log = options.log ?? ((line) => console.log(line));

  if (existsSync(out) && !force) {
    const bytes = readFileSync(out);
    log('fixture 已存在（幂等：本次不重录）');
    log(`  路径：${out}`);
    log(`  字节：${String(bytes.byteLength)}  sha256：${sha256(bytes)}`);
    log('  重录：node tools/record-fixture.mjs --force');
    return { path: out, bytes: bytes.byteLength, sha256: sha256(bytes), skipped: true };
  }
  if (!(seconds >= 1 && seconds <= 120)) {
    throw new Error(`--seconds 取值必须在 1..120 之间（收到 ${String(seconds)}）`);
  }

  const { chromium } = await loadPlaywright();
  const { server, origin } = await serveBlankPage();
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  try {
    const page = await browser.newPage();
    await page.goto(origin, { waitUntil: 'load' });
    log(`录制页：${origin}（无头 Chromium + 假麦克风 + MediaRecorder）`);
    const recorded = await page.evaluate(async (recordSeconds) => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = 'audio/webm;codecs=opus';
      const mimeType = MediaRecorder.isTypeSupported(preferred) ? preferred : 'audio/webm';
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      const actualMime = recorder.mimeType;
      const stopped = new Promise((done) => {
        recorder.onstop = () => {
          done();
        };
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const startedAt = performance.now();
      recorder.start();
      await new Promise((done) => {
        setTimeout(done, Math.round(recordSeconds * 1000));
      });
      recorder.stop();
      await stopped;
      stream.getTracks().forEach((track) => {
        track.stop();
      });
      const elapsedMs = performance.now() - startedAt;
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const bytes = new Uint8Array(await blob.arrayBuffer());

      /** 当场自证：这段字节能被浏览器的解码器打开，且播放时 `currentTime` 真的前进。 */
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = url;
      const decode = await new Promise((done) => {
        const timer = setTimeout(() => {
          done({ stage: 'timeout', error: 'no_event', duration: audio.duration, errorCode: null });
        }, 8000);
        const settle = (stage, error) => {
          clearTimeout(timer);
          done({ stage, error: error ?? null, duration: audio.duration, errorCode: audio.error?.code ?? null });
        };
        audio.addEventListener('error', () => {
          settle('error', audio.error?.message ?? 'media error');
        });
        audio.addEventListener('loadedmetadata', () => {
          settle('loadedmetadata', null);
        });
        audio.load();
      });
      let currentTimeFrom = null;
      let currentTimeTo = null;
      let playError = null;
      if (decode.error === null) {
        try {
          await audio.play();
          currentTimeFrom = audio.currentTime;
          await new Promise((done) => {
            setTimeout(done, 1200);
          });
          currentTimeTo = audio.currentTime;
          audio.pause();
        } catch (error) {
          playError = error instanceof Error ? error.message : String(error);
        }
      }
      URL.revokeObjectURL(url);

      let base64 = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        base64 += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      return {
        mimeType: actualMime,
        elapsedMs,
        size: bytes.byteLength,
        base64: btoa(base64),
        decode: { ...decode, currentTimeFrom, currentTimeTo, playError },
      };
    }, seconds);

    const bytes = Buffer.from(recorded.base64, 'base64');
    const decoded = recorded.decode;
    const advanced =
      decoded.currentTimeTo !== null && decoded.currentTimeTo > (decoded.currentTimeFrom ?? 0) + 0.2;
    log(
      `录制：mime=${recorded.mimeType} 墙钟=${String(Math.round(recorded.elapsedMs))}ms ` +
        `字节=${String(recorded.size)}`,
    );
    log(
      `自证：事件=${String(decoded.stage)} error=${String(decoded.error)} ` +
        `errorCode=${String(decoded.errorCode)} duration=${String(decoded.duration)}`,
    );
    log(
      `自证：currentTime ${String(decoded.currentTimeFrom)} → ${String(decoded.currentTimeTo)}` +
        `（前进=${advanced ? '是' : '否'}）`,
    );
    if (decoded.playError !== null || decoded.error !== null || !advanced) {
      throw new Error('录出来的字节没能当场解码播放：fixture 不合格（不落地）');
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes);
    log(`已写入：${out}`);
    log(`  字节：${String(bytes.byteLength)}  sha256：${sha256(bytes)}`);
    return { path: out, bytes: bytes.byteLength, sha256: sha256(bytes), skipped: false };
  } finally {
    await browser.close();
    await new Promise((done) => {
      server.close(done);
    });
  }
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const args = new Map(
    process.argv.slice(2).map((raw) => {
      const [key, value] = raw.replace(/^--/, '').split('=');
      return [key, value ?? 'true'];
    }),
  );
  try {
    await recordFixture({
      out: args.get('out'),
      seconds: Number(args.get('seconds') ?? 20),
      force: args.get('force') === 'true',
    });
    process.exit(0);
  } catch (error) {
    console.error(`record-fixture 失败：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
