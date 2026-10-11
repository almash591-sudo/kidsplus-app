CREATE TABLE "call_members" (
	"call_id" uuid NOT NULL,
	"peer" text NOT NULL,
	"state" text NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	CONSTRAINT "call_members_call_id_peer_pk" PRIMARY KEY("call_id","peer")
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video" boolean NOT NULL,
	"created_by" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "parent_users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "call_members" ADD CONSTRAINT "call_members_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_members_peer_index" ON "call_members" USING btree ("peer");--> statement-breakpoint
CREATE INDEX "calls_status_index" ON "calls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "calls_created_at_index" ON "calls" USING btree ("created_at");--> statement-breakpoint
-- Этап 10: уведомление о входящем звонке включено у всех, кто уже подписан на push.
UPDATE "push_subscriptions" SET "kinds" = array_append("kinds", 'call') WHERE NOT ('call' = ANY("kinds"));
