import { describe, expect, it, vi } from 'vitest';
import { SongSchema } from '@music-drift/shared';
import {
  ApiError,
  apiFetch,
  type FetchLike,
  type FetchResponseLike,
  type ResponseSchema,
} from './client';

function responseLike(status: number, body: unknown): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function spyFetch(response: FetchResponseLike): {
  impl: FetchLike;
  calls: Array<[string, RequestInit]>;
} {
  const calls: Array<[string, RequestInit]> = [];
  const impl: FetchLike = (input, init) => {
    calls.push([input, init]);
    return Promise.resolve(response);
  };
  return { impl, calls };
}

/** 一个「永远拒绝」的契约端口，用来钉住 CONTRACT_VIOLATION 分支（不需要引 zod）。 */
const NeverOk: ResponseSchema<{ id: string }> = {
  safeParse: () => ({ success: false, error: new Error('shape mismatch') }),
};

const SONG = {
  id: '8f1d6c2e-0f1a-4a1e-9f2b-444444444444',
  title: '深海鲸落',
  totalSegments: 4,
  licensedSource: 'Demo 授权曲库',
  segments: [
    { id: '8f1d6c2e-0f1a-4a1e-9f2b-555555555555', index: 1, startMs: 0, durationMs: 20_000 },
  ],
};

describe('apiFetch（契约对接层，唯一的 HTTP 出口）', () => {
  it('带上会话 cookie、JSON 头，并用 zod 契约校验响应形状', async () => {
    const { impl, calls } = spyFetch(responseLike(200, SONG));
    const song = await apiFetch({ path: '/api/songs/x', schema: SongSchema, fetchImpl: impl });

    // 类型确实被推导成契约类型（不是 any / unknown）
    expect(song.totalSegments).toBe(4);
    const [url, init] = calls[0]!;
    expect(url).toBe('/api/songs/x');
    expect(init.credentials).toBe('include');
    // GET 没有请求体 → 不带 Content-Type（音频上传也走原始二进制，不在这里加 JSON 头）
    expect(new Headers(init.headers).get('Content-Type')).toBeNull();
  });

  it('POST 时把 body 序列化，GET 时不带 body', async () => {
    const post = spyFetch(responseLike(201, SONG));
    await apiFetch({
      path: '/api/bottles',
      method: 'POST',
      body: { songId: SONG.id },
      schema: SongSchema,
      fetchImpl: post.impl,
    });
    expect(post.calls[0]![1].body).toBe(JSON.stringify({ songId: SONG.id }));
    expect(post.calls[0]![1].method).toBe('POST');
    expect(new Headers(post.calls[0]![1].headers).get('Content-Type')).toBe('application/json');

    const get = spyFetch(responseLike(200, SONG));
    await apiFetch({ path: '/api/songs', schema: SongSchema, fetchImpl: get.impl });
    expect(get.calls[0]![1].body).toBeUndefined();
  });

  it('真实 zod 契约不认的响应（段数越界）会被拦下，抛 CONTRACT_VIOLATION', async () => {
    const { impl } = spyFetch(responseLike(200, { ...SONG, totalSegments: 99 }));
    await expect(
      apiFetch({ path: '/api/songs', schema: SongSchema, fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'CONTRACT_VIOLATION', status: 200 });
  });

  it('响应不符合契约时抛 CONTRACT_VIOLATION（而不是把脏数据渲染出去）', async () => {
    const { impl } = spyFetch(responseLike(200, { id: 42 }));
    await expect(
      apiFetch<{ id: string }>({ path: '/api/bottles/x', schema: NeverOk, fetchImpl: impl }),
    ).rejects.toMatchObject({ code: 'CONTRACT_VIOLATION', status: 200 });
  });

  it('409 规则码原样带出（码给程序、中文文案给人）', async () => {
    const { impl } = spyFetch(
      responseLike(409, {
        error: {
          message: '这个漂流瓶已经被别人拿走了，换一个吧。',
          violations: [
            { code: 'HOLDING_ALREADY_TAKEN', message: '这个漂流瓶已经被别人拿走了，换一个吧。' },
          ],
        },
      }),
    );
    const error = await apiFetch({ path: '/api/bottles/x', fetchImpl: impl }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('HOLDING_ALREADY_TAKEN');
    expect(apiError.message).toContain('被别人拿走');
  });

  it('账号错误 envelope 的码也能被解析（AUTH_ERROR_CODES 不在领域词表里）', async () => {
    // 回归：只认 ErrorResponseSchema 时，/api/auth/* 的码会被丢掉，页面只能说"请先登录"
    const { impl } = spyFetch(
      responseLike(409, {
        error: {
          message: '这个邮箱已经注册过了，直接登录试试？',
          violations: [{ code: 'EMAIL_TAKEN', message: '这个邮箱已经注册过了，直接登录试试？' }],
        },
      }),
    );
    const apiError = (await apiFetch({
      path: '/api/auth/register',
      method: 'POST',
      body: { handle: 'a', email: 'a@example.com', password: 'abcd1234' },
      fetchImpl: impl,
    }).catch((thrown: unknown) => thrown)) as ApiError;
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('EMAIL_TAKEN');
    expect(apiError.message).toContain('已经注册过');
  });

  it('传输层 404 没有 code（envelope 的 violations 为空）', async () => {
    const { impl } = spyFetch(
      responseLike(404, { error: { message: '找不到这个资源。', violations: [] } }),
    );
    const apiError = (await apiFetch({ path: '/api/sea/x', fetchImpl: impl }).catch(
      (thrown: unknown) => thrown,
    )) as ApiError;
    expect(apiError.status).toBe(404);
    expect(apiError.code).toBeNull();
    expect(apiError.message).toBe('找不到这个资源。');
  });

  it('非 JSON 响应体也能收敛成可读错误（不把 HTML 泄漏给用户）', async () => {
    const impl: FetchLike = () =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      });
    const apiError = (await apiFetch({ path: '/api/sea', fetchImpl: impl }).catch(
      (thrown: unknown) => thrown,
    )) as ApiError;
    expect(apiError.status).toBe(502);
    expect(apiError.message).not.toContain('<');
  });

  it('网络层失败收敛成 status=null（不是伪造成 500）', async () => {
    const impl: FetchLike = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const apiError = (await apiFetch({ path: '/api/sea', fetchImpl: impl }).catch(
      (thrown: unknown) => thrown,
    )) as ApiError;
    expect(apiError.status).toBeNull();
    expect(apiError.code).toBeNull();
  });

  it('204 无正文时返回 undefined（登出这类端点没有响应体）', async () => {
    const impl: FetchLike = () =>
      Promise.resolve({ ok: true, status: 204, json: () => Promise.reject(new Error('no body')) });
    await expect(
      apiFetch({ path: '/api/auth/logout', method: 'POST', fetchImpl: impl }),
    ).resolves.toBeUndefined();
  });
});
