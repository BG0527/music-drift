CREATE TABLE "anon_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bottle_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bottle_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bottle_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"note" text,
	"audio" "bytea",
	"audio_mime" text,
	"duration_ms" integer,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bottle_segments_index_check" CHECK ("bottle_segments"."index" >= 1)
);
--> statement-breakpoint
CREATE TABLE "bottles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"initiator_id" uuid NOT NULL,
	"status" text NOT NULL,
	"total_segments" integer NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"current_holder_id" uuid,
	"current_caster_id" text,
	"river_cast_at" timestamp with time zone,
	"sea_at" timestamp with time zone,
	"damaged_at" timestamp with time zone,
	"return_chain_broken" boolean DEFAULT false NOT NULL,
	"return_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bottles_status_check" CHECK ("bottles"."status" in ('DRAFT', 'IN_RIVER', 'HELD', 'SEA', 'DAMAGED')),
	CONSTRAINT "bottles_total_segments_check" CHECK ("bottles"."total_segments" >= 1),
	CONSTRAINT "bottles_revision_check" CHECK ("bottles"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bottle_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bottle_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_first_event_check" CHECK (seq > 1 or type = 'BOTTLE_CREATED'),
	CONSTRAINT "events_seq_check" CHECK ("events"."seq" >= 1)
);
--> statement-breakpoint
CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bottle_id" uuid NOT NULL,
	"holder_id" uuid NOT NULL,
	"parent_id" uuid,
	"origin" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "holdings_origin_check" CHECK ("holdings"."origin" in ('DRAW', 'RETURN', 'REWIND'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bottle_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_status_check" CHECK ("messages"."status" in ('PENDING', 'DELIVERED', 'UNDELIVERED'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"action" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_target_type_check" CHECK ("reports"."target_type" in ('BOTTLE', 'SEGMENT', 'MESSAGE')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('PENDING', 'REVIEWED')),
	CONSTRAINT "reports_action_check" CHECK ("reports"."action" is null or "reports"."action" in ('NONE', 'REMOVE_SEGMENT', 'REMOVE_BOTTLE', 'BAN_USER'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"accompaniment_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "song_segments_index_check" CHECK ("song_segments"."index" >= 1),
	CONSTRAINT "song_segments_duration_check" CHECK ("song_segments"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"total_segments" integer NOT NULL,
	"licensed_source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "songs_total_segments_check" CHECK ("songs"."total_segments" between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('USER', 'ADMIN'))
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" text NOT NULL,
	"listened_ratio" numeric(4, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_value_check" CHECK ("votes"."value" in ('LIKE', 'DISLIKE')),
	CONSTRAINT "votes_listened_ratio_check" CHECK ("votes"."listened_ratio" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "anon_codes" ADD CONSTRAINT "anon_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottle_segments" ADD CONSTRAINT "bottle_segments_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottle_segments" ADD CONSTRAINT "bottle_segments_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_initiator_id_users_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottles" ADD CONSTRAINT "bottles_current_holder_id_users_id_fk" FOREIGN KEY ("current_holder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_holder_id_users_id_fk" FOREIGN KEY ("holder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_bottle_id_bottles_id_fk" FOREIGN KEY ("bottle_id") REFERENCES "public"."bottles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_segments" ADD CONSTRAINT "song_segments_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_segment_id_bottle_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."bottle_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anon_codes_user_bottle_uniq" ON "anon_codes" USING btree ("user_id","bottle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "anon_codes_code_uniq" ON "anon_codes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "bottle_segments_active_index_uniq" ON "bottle_segments" USING btree ("bottle_id","index") WHERE "bottle_segments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "bottle_segments_bottle_idx" ON "bottle_segments" USING btree ("bottle_id");--> statement-breakpoint
CREATE INDEX "bottle_segments_owner_idx" ON "bottle_segments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "bottles_status_idx" ON "bottles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bottles_initiator_idx" ON "bottles" USING btree ("initiator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_user_bottle_uniq" ON "collections" USING btree ("user_id","bottle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_bottle_seq_uniq" ON "events" USING btree ("bottle_id","seq");--> statement-breakpoint
CREATE INDEX "events_bottle_occurred_idx" ON "events" USING btree ("bottle_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_active_bottle_uniq" ON "holdings" USING btree ("bottle_id") WHERE "holdings"."released_at" is null;--> statement-breakpoint
CREATE INDEX "holdings_holder_idx" ON "holdings" USING btree ("holder_id");--> statement-breakpoint
CREATE INDEX "messages_bottle_idx" ON "messages" USING btree ("bottle_id");--> statement-breakpoint
CREATE INDEX "messages_to_user_idx" ON "messages" USING btree ("to_user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uniq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "song_segments_song_index_uniq" ON "song_segments" USING btree ("song_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_uniq" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uniq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_segment_user_value_uniq" ON "votes" USING btree ("segment_id","user_id","value");