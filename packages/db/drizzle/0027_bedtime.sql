CREATE TABLE "bedtimes" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"at" text NOT NULL,
	"wake_at" text NOT NULL,
	"days" text[] NOT NULL,
	"warn_minutes" integer DEFAULT 15 NOT NULL,
	"companion" text DEFAULT 'story' NOT NULL,
	"track_id" uuid,
	"skip_night" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"library_code" text,
	"theme" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"paragraphs" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text NOT NULL,
	"age_years" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bedtimes" ADD CONSTRAINT "bedtimes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bedtimes" ADD CONSTRAINT "bedtimes_track_id_audio_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."audio_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stories_child_id_status_index" ON "stories" USING btree ("child_id","status");--> statement-breakpoint
CREATE INDEX "stories_status_index" ON "stories" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "stories_child_id_library_code_index" ON "stories" USING btree ("child_id","library_code");