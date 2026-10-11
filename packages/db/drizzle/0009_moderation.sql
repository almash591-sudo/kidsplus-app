CREATE TYPE "public"."moderation_status" AS ENUM('queued', 'processing', 'ready', 'skipped', 'failed', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"moderation_item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text NOT NULL,
	"topic" text,
	"status" "moderation_status" DEFAULT 'queued' NOT NULL,
	"metadata" jsonb,
	"skip_reason" text,
	"report" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_moderation_item_id_moderation_items_id_fk" FOREIGN KEY ("moderation_item_id") REFERENCES "public"."moderation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_items" ADD CONSTRAINT "moderation_items_created_by_parent_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."parent_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_usage_created_at_index" ON "llm_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_items_provider_external_id_index" ON "moderation_items" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "moderation_items_status_index" ON "moderation_items" USING btree ("status");