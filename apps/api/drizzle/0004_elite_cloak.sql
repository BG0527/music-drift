CREATE TABLE "listen_progress" (
	"user_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"covered_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "listen_progress_user_id_segment_id_pk" PRIMARY KEY("user_id","segment_id"),
	CONSTRAINT "listen_progress_ms_check" CHECK ("listen_progress"."covered_ms" >= 0 and "listen_progress"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "listen_progress" ADD CONSTRAINT "listen_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listen_progress" ADD CONSTRAINT "listen_progress_segment_id_bottle_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."bottle_segments"("id") ON DELETE cascade ON UPDATE no action;