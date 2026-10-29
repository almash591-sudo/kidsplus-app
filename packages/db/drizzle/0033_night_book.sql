ALTER TABLE "bedtimes" ADD COLUMN "book_code" text;--> statement-breakpoint
ALTER TABLE "bedtimes" ADD COLUMN "book_chapter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bedtimes" ADD COLUMN "book_night" text;