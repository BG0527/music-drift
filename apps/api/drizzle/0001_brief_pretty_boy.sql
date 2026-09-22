CREATE TABLE "river_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "river_state" ADD CONSTRAINT "river_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;