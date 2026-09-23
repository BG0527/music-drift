/**
 * `createBrowserRecorderEnvironment()` 的**端口齐全性**守卫（用户需求 ③）。
 *
 * 为什么单独立一个文件守住这个"看起来只是默认值"的函数：
 * 试听按钮能不能出现，取决于生产实现里**同时**有 `createPreviewElement` 与 `createObjectURL`
 * 两个端口 —— 少任何一个，`useRecorder` 都会诚实地不暴露 `previewUrl`（宁可不给按钮，
 * 也不给"点了没反应"的按钮）。于是**端口漏掉**这件事的表现是"功能安静消失"，
 * 而不是报错：单测全绿、页面看起来正常，只是用户听不到自己刚录的那一段。
 * 这正是用户实测反馈的那类问题（"在真实浏览器里点了没反应"），所以在这里显式钉住。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrowserRecorderEnvironment } from './recorder-environment';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createBrowserRecorderEnvironment：试听必需端口', () => {
  it('三个试听端口都在（元素 / objectURL / 回收），缺一个试听就会安静消失', () => {
    const environment = createBrowserRecorderEnvironment();

    expect(typeof environment.createPreviewElement).toBe('function');
    expect(typeof environment.createObjectURL).toBe('function');
    expect(typeof environment.revokeObjectURL).toBe('function');
  });

  it('试听元素是真实 <audio> 且只预加载元数据（不预载整段音频）', () => {
    const environment = createBrowserRecorderEnvironment();
    const element = environment.createPreviewElement?.();

    expect(element).toBeInstanceOf(HTMLAudioElement);
    expect((element as HTMLAudioElement).preload).toBe('metadata');
  });

  it('objectURL 的创建与回收都落到浏览器 URL 上（不在本地另立一套）', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:browser');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const environment = createBrowserRecorderEnvironment();
    const blob = new Blob([new Uint8Array(4)], { type: 'audio/webm' });

    expect(environment.createObjectURL?.(blob)).toBe('blob:browser');
    expect(createObjectURL).toHaveBeenCalledWith(blob);

    environment.revokeObjectURL?.('blob:browser');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:browser');
  });
});
