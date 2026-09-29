-- W21：邮箱能力整体退役。历史迁移与审计记录保留，活跃 schema 删除索引与列。
DROP INDEX IF EXISTS "users_email_uniq";
ALTER TABLE "users" DROP COLUMN IF EXISTS "email";
