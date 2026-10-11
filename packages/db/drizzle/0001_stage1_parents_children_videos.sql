CREATE TYPE "public"."gender" AS ENUM('f', 'm');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TABLE "child_segments" (
	"child_id" uuid NOT NULL,
	"segment_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_segments_child_id_segment_id_pk" PRIMARY KEY("child_id","segment_id")
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text NOT NULL,
	"birth_year" integer NOT NULL,
	"birth_month" integer NOT NULL,
	"gender" "gender" NOT NULL,
	"languages" text[] DEFAULT '{ru}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "children_birth_month" CHECK ("children"."birth_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "device_pairings" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"device_name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"device_id" uuid
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid,
	"type" text NOT NULL,
	"segment_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_invites" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "parent_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parent_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "video_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_sec" integer NOT NULL,
	"end_sec" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_segments_range" CHECK ("video_segments"."start_sec" >= 0 and "video_segments"."end_sec" > "video_segments"."start_sec")
);
--> statement-breakpoint
CREATE TABLE "video_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"channel_title" text,
	"thumbnail_url" text,
	"status" "video_status" DEFAULT 'available' NOT NULL,
	"status_reason" text,
	"status_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_segments" ADD CONSTRAINT "child_segments_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_segments" ADD CONSTRAINT "child_segments_segment_id_video_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."video_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_created_by_parent_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_pairings" ADD CONSTRAINT "device_pairings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_segment_id_video_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."video_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_invites" ADD CONSTRAINT "parent_invites_created_by_parent_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_sessions" ADD CONSTRAINT "parent_sessions_user_id_parent_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."parent_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_segments" ADD CONSTRAINT "video_segments_source_id_video_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."video_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_segments" ADD CONSTRAINT "video_segments_created_by_parent_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_child_id_index" ON "devices" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "events_child_id_created_at_index" ON "events" USING btree ("child_id","created_at");--> statement-breakpoint
CREATE INDEX "parent_sessions_user_id_index" ON "parent_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_segments_source_id_index" ON "video_segments" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "video_sources_provider_external_id_index" ON "video_sources" USING btree ("provider","external_id");