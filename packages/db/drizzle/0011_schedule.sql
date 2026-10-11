CREATE TABLE "child_schedules" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"subjects_per_day" integer NOT NULL,
	"minutes_per_subject" integer NOT NULL,
	"free_minutes" integer NOT NULL,
	"timezone" text NOT NULL,
	"windows" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curricula" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_on" text NOT NULL,
	"weeks" integer NOT NULL,
	"subjects" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"curriculum_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"week" integer NOT NULL,
	"title" text NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_controls" (
	"child_id" uuid NOT NULL,
	"date" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"extra_seconds" integer DEFAULT 0 NOT NULL,
	"open_until" timestamp with time zone,
	"last_beat_at" timestamp with time zone,
	"activity" text,
	"item" jsonb,
	CONSTRAINT "day_controls_child_id_date_pk" PRIMARY KEY("child_id","date")
);
--> statement-breakpoint
CREATE TABLE "day_usage" (
	"child_id" uuid NOT NULL,
	"date" text NOT NULL,
	"activity" text NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_usage_child_id_date_activity_pk" PRIMARY KEY("child_id","date","activity")
);
--> statement-breakpoint
ALTER TABLE "video_segments" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "child_schedules" ADD CONSTRAINT "child_schedules_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_topics" ADD CONSTRAINT "curriculum_topics_curriculum_id_curricula_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curricula"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_controls" ADD CONSTRAINT "day_controls_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_usage" ADD CONSTRAINT "day_usage_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curricula_child_id_index" ON "curricula" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "curriculum_topics_curriculum_id_index" ON "curriculum_topics" USING btree ("curriculum_id");