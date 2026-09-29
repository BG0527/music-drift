-- W19：公海公开评论。评论离海隐藏但不删除，作者删除与管理员删除都使用 deleted_at 软删。
CREATE TABLE IF NOT EXISTS "public_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bottle_id" uuid NOT NULL REFERENCES "bottles"("id") ON DELETE CASCADE,
	"author_id" uuid NOT NULL REFERENCES "users"("id"),
	"content" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_comments_content_check" CHECK (char_length(btrim("content")) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS "public_comments_bottle_created_idx"
	ON "public_comments" ("bottle_id", "created_at" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "public_comments_author_idx" ON "public_comments" ("author_id");

ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_target_type_check";
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_type_check"
	CHECK ("target_type" in ('BOTTLE', 'SEGMENT', 'MESSAGE', 'COMMENT'));
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_action_check";
ALTER TABLE "reports" ADD CONSTRAINT "reports_action_check"
	CHECK ("action" is null or "action" in ('NONE', 'REMOVE_SEGMENT', 'RESTORE_SEGMENT', 'REMOVE_BOTTLE', 'REMOVE_COMMENT', 'BAN_USER'));
