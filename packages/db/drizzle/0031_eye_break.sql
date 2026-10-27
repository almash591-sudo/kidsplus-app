ALTER TABLE "children" ADD COLUMN "eye_break_every" integer;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "eye_break_rest" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "eye_break_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "eye_break_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "eye_break_ask" text;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_eye_break" CHECK (("children"."eye_break_every" is null or "children"."eye_break_every" between 5 and 60) and "children"."eye_break_rest" between 1 and 60);--> statement-breakpoint
-- Этап 50: в семье владельца перерыв включён сразу (15 минут экрана — 15 минут отдыха), кроме
-- малышей (до 1,5 лет, свой экран). В семьях родственников — выключен, включают сами.
UPDATE "children" SET "eye_break_every" = 15
WHERE "family_id" IN (SELECT "id" FROM "families" WHERE "is_admin")
  AND (extract(year from now())::int - "birth_year") * 12
    + (extract(month from now())::int - "birth_month") >= 18;
