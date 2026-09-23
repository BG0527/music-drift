import io


def patch(path, edits):
    s = io.open(path, encoding='utf-8').read()
    for old, new, label in edits:
        assert old in s, path + ' :: ' + label
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(s)
    print('patched', path)


# ── interactions.integration.test.ts：留言 describe 按新规则改写 ─────────────
patch(
    'apps/api/src/routes/interactions.integration.test.ts',
    [
        (
            """describe('私密留言（CONTEXT §5 / §4.3）：只有接唱者能写，只有发起者最终能看到', () => {""",
            """describe('私密留言（CONTEXT §5）：目标由发送者按**段号**指定，只有目标能看到', () => {""",
            'title',
        ),
        (
            """      payload: { content: '匿名的话' },""",
            """      payload: { content: '匿名的话', targetSegmentIndex: 1 },""",
            '401 write',
        ),
        (
            """  it('发起者不能给自己留言（留言是「接唱者 → 发起者」的点对点）→ 422', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '我说给我自己听' },
      headers: { cookie: initiatorCookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('MESSAGE_SENDER_NOT_PARTICIPANT');
  });""",
            """  it('目标必须是**已存在的有效段**且不能是自己 → 422 MESSAGE_TARGET_NOT_AVAILABLE（旧规则"发起者不能写"已按用户裁决反转）', async () => {
    // 此刻瓶里只有第 1 段（发起者自己的）⇒ 他选第 1 段 = 选自己 ⇒ 被目标规则拒绝。
    // ⚠️ 反转点：旧规则拒绝他的理由是 MESSAGE_SENDER_NOT_PARTICIPANT（"只有接唱者能写给发起者"）；
    //    新规则只按段号说话 —— 发起者**可以**写，只要目标不是自己（见 messageTargeting 测试里的正例）。
    const response = await app.inject({
      method: 'POST',
      url: '/api/bottles/' + bottleId + '/messages',
      payload: { content: '我说给我自己听', targetSegmentIndex: 1 },
      headers: { cookie: initiatorCookie },
    });
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain('MESSAGE_TARGET_NOT_AVAILABLE');
  });""",
            'invert sender rule',
        ),
        (
            """      payload: { content: '   ' },
      headers: { cookie: lastSingerCookie },
    });
    expect(empty.statusCode).toBe(422);
    expect(empty.body).toContain('MESSAGE_CONTENT_EMPTY');""",
            """      payload: { content: '   ', targetSegmentIndex: 1 },
      headers: { cookie: lastSingerCookie },
    });
    expect(empty.statusCode).toBe(422);
    expect(empty.body).toContain('MESSAGE_CONTENT_EMPTY');""",
            'empty content',
        ),
        (
            """      payload: { content: '给你留一句：副歌我改高了' },
      headers: { cookie: lastSingerCookie },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; status: string };
    messageId = body.id;
    expect(body.status).toBe('PENDING');
    expect(messageId).not.toBe('');""",
            """      // 目标 = 第 1 段（发起者）：服务端据此解析收件人，客户端全程没传过 userId
      payload: { content: '给你留一句：副歌我改高了', targetSegmentIndex: 1 },
      headers: { cookie: lastSingerCookie },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; status: string; targetSegmentIndex: number };
    messageId = body.id;
    expect(body.status).toBe('PENDING');
    expect(body.targetSegmentIndex).toBe(1);
    expect(messageId).not.toBe('');""",
            'create',
        ),
        (
            """  it('全链回传入海后 → 留言 DELIVERED，发起者可见（§5.1 / §5.2 的送达分支）', async () => {""",
            """  it('回传到**目标**手上即 DELIVERED（本例目标是发起者 ⇒ 他此时可见）；无需等到入海', async () => {""",
            'delivery title',
        ),
        (
            """      payload: { content: '太晚了' },""",
            """      payload: { content: '太晚了', targetSegmentIndex: 1 },""",
            'not drifting',
        ),
        (
            """      payload: { content: '不知道还能不能送到' },""",
            """      payload: { content: '不知道还能不能送到', targetSegmentIndex: 1 },""",
            'undelivered case',
        ),
    ],
)

# ── notifications-write.integration.test.ts（t12 的文件）：补目标段号 ────────
patch(
    'apps/api/src/routes/notifications-write.integration.test.ts',
    [
        (
            """        payload: { content: '给你的悄悄话' },""",
            """        payload: { content: '给你的悄悄话', targetSegmentIndex: 1 },""",
            'msg payload',
        )
    ],
)
print('done')
