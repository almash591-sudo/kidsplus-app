ALTER TABLE "devices" ADD COLUMN "battery_level" smallint;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "battery_charging" boolean;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "battery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "battery_alert_at" timestamp with time zone;--> statement-breakpoint
-- Этап 8: уведомление «телефон садится» включено у всех, кто уже подписан на push.
UPDATE "push_subscriptions" SET "kinds" = array_append("kinds", 'battery') WHERE NOT ('battery' = ANY("kinds"));
