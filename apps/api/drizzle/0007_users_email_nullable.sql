-- W6（`docs/deploy-plan-html.md` §13 需求 7 / §14.1）：登录与注册都只要「账号 + 密码」，**账号不是邮箱**
-- ⇒ 注册时可以没有邮箱，因此 `users.email` 必须允许 NULL。
--
-- 为什么是 DROP NOT NULL 而不是"加一列账号"：账号 = 现有的 `users.handle`（本来就 2–32 字符、非邮箱），
-- 加列会同时带来回填 / 双写 / 旧数据兜底三件事，迁移越大越危险。
--
-- 旧数据处置：**已有用户的 email 原样保留**（本迁移一行数据都不动）；
-- `users_email_uniq` 唯一索引保留 —— PG 里多个 NULL 互不冲突，所以"没有邮箱"的账号可以有任意多个。
-- 纯 DDL、幂等（列已是可空时 DROP NOT NULL 不报错），可重放。
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
