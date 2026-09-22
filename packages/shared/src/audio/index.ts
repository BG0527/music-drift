/**
 * 音频链路公共入口（`@music-drift/shared/audio`）。
 *
 * 与领域内核同样**独立成子路径**，理由：
 * 1. 这里的规则（时长 15–30 秒、容器白名单、听满 80%、麦克风降级引导）前后端都要用，
 *    但它们是**音频链路**的关注点，不属于领域状态机；
 * 2. 包根（`@music-drift/shared`）只出口契约层（ADR-004 的唯一接口），
 *    音频纯逻辑若混进包根会与契约里的同名 DTO 概念混淆。
 *
 * 本模块**无 IO、无 DOM**：浏览器能力（`MediaRecorder` / `getUserMedia` / `AudioContext`）
 * 一律通过参数（端口）注入，因此可以在 node 环境下直接单测。
 */
export * from './constants';
export * from './library';
export * from './mix';
export * from './errors';
export * from './listening';
export * from './recording';
