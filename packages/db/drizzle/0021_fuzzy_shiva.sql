CREATE TABLE "audio_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"for_kids" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_created_by_parent_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_tracks_created_at_index" ON "audio_tracks" USING btree ("created_at");