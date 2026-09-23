-- t29：把「上传者自报」的段时长回填为**曲库预设时长**（bottle_segments.duration_ms ← song_segments.duration_ms）。
-- 纯 DML、无 DDL、可重复执行（幂等：只在两值不同时更新）。captain 于本轮批准。
UPDATE "bottle_segments" AS bs
SET "duration_ms" = ss."duration_ms"
FROM "bottles" b, "song_segments" ss
WHERE b.id = bs.bottle_id
  AND ss.song_id = b.song_id
  AND ss."index" = bs."index"
  AND bs."duration_ms" IS DISTINCT FROM ss."duration_ms";
