ALTER TABLE "flashcard_decks" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "question" text;--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "question_audio_id" uuid;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_question_audio_id_media_assets_id_fk" FOREIGN KEY ("question_audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "flashcard_decks" SET "category" = CASE
  WHEN "lang" = 'en' THEN 'english'
  WHEN "lang" = 'zh' THEN 'chinese'
  WHEN "title" LIKE 'Математика%' OR "title" LIKE 'Геометрия%' THEN 'math'
  ELSE 'other'
END;
