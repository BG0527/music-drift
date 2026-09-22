/**
 * 每个集成测试文件开跑前清空业务表。
 *
 * 为什么需要：集成文件共享同一个测试库。若只在整轮开始清一次，A 文件建的瓶子会被
 * B 文件的随机捞取捞到（t9 的 `river/draw` 用例真实踩到过），表现为「单跑通过、全量失败」。
 * 配合 `fileParallelism: false`（串行执行文件）即可保证文件之间完全隔离。
 */
import { beforeAll } from 'vitest';
import { truncateAll } from './global-setup.js';

beforeAll(async () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('集成测试需要 DATABASE_URL（本地：docker compose up -d --wait）');
  }
  await truncateAll(databaseUrl);
});
