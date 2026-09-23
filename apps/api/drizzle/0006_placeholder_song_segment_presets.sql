-- t31：给 seed 的**占位曲**补齐缺失的 `song_segments`（每段 20000ms = `db/seed.ts::SEGMENT_DURATION_MS`）。
-- 为什么必须有这条：无预设的段现在被 fail-closed 拒绝（不再回退到客户端自报时长），
-- 历史库里若占位曲没有预设行，录制路径会直接断。
--
-- 谓词用**固定 UUID**而不是 `licensed_source`：实测该标签会漂移
-- （seed 常量写 'placeholder'，但库内这 3 行实际是 'incompetech-cc-by-4.0'），
-- 而 `PLACEHOLDER_SONGS` 的 id 是设计上固定的（00000000-0000-4000-8000-00000000000{1,2,3}）。
-- **不能**用"所有缺预设的歌"当谓词：那会给 user-provided/未知来源的歌凭空造出一个 20000ms 分母。
-- 纯 DML、幂等（on conflict do nothing）、无 DDL。captain 本轮批准。
INSERT INTO "song_segments" ("id", "song_id", "index", "start_ms", "duration_ms", "accompaniment_ref")
SELECT gen_random_uuid(), s.id, i."index", (i."index" - 1) * 20000, 20000, NULL
FROM "songs" s
CROSS JOIN generate_series(1, 4) AS i("index")
WHERE s.id IN (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003'
)
  AND i."index" <= s."total_segments"
ON CONFLICT ("song_id", "index") DO NOTHING;
