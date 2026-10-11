CREATE TABLE "child_monitor" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"on" boolean DEFAULT false NOT NULL,
	"sensitivity" text DEFAULT 'medium' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_noise_at" timestamp with time zone,
	"last_alert_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "monitor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "child_monitor" ADD CONSTRAINT "child_monitor_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
-- Этап 11: уведомление радионяни включено у всех, кто уже подписан на push.
UPDATE "push_subscriptions" SET "kinds" = array_append("kinds", 'noise') WHERE NOT ('noise' = ANY("kinds"));
