CREATE TYPE "public"."child_item_kind" AS ENUM('segment', 'deck');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('audio', 'image');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "child_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"kind" "child_item_kind" NOT NULL,
	"segment_id" uuid,
	"deck_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "child_items_target" CHECK (("child_items"."kind" = 'segment' and "child_items"."segment_id" is not null and "child_items"."deck_id" is null)
       or ("child_items"."kind" = 'deck' and "child_items"."deck_id" is not null and "child_items"."segment_id" is null))
);
--> statement-breakpoint
CREATE TABLE "flashcard_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"lang" text DEFAULT 'ru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flashcards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"text" text NOT NULL,
	"audio_id" uuid,
	"translation" text,
	"translation_audio_id" uuid,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "media_kind" NOT NULL,
	"status" "media_status" DEFAULT 'ready' NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"storage_key" text,
	"mime_type" text,
	"bytes" integer,
	"license" text,
	"attribution" text,
	"tts_key" text,
	"tts_text" text,
	"tts_lang" text,
	"tts_voice" text,
	"tts_speed" real,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_ttsKey_unique" UNIQUE("tts_key")
);
--> statement-breakpoint
CREATE TABLE "quiz_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"lang" text DEFAULT 'ru' NOT NULL,
	"prompt_audio_id" uuid,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "quiz_options" integer;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "quiz_questions" integer;--> statement-breakpoint
ALTER TABLE "child_items" ADD CONSTRAINT "child_items_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_items" ADD CONSTRAINT "child_items_segment_id_video_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."video_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_items" ADD CONSTRAINT "child_items_deck_id_flashcard_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."flashcard_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_deck_id_flashcard_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."flashcard_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_image_id_media_assets_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_translation_audio_id_media_assets_id_fk" FOREIGN KEY ("translation_audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_options" ADD CONSTRAINT "quiz_options_image_id_media_assets_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_segment_id_video_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."video_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_prompt_audio_id_media_assets_id_fk" FOREIGN KEY ("prompt_audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_items_child_id_segment_id_index" ON "child_items" USING btree ("child_id","segment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_items_child_id_deck_id_index" ON "child_items" USING btree ("child_id","deck_id");--> statement-breakpoint
CREATE INDEX "child_items_child_id_position_index" ON "child_items" USING btree ("child_id","position");--> statement-breakpoint
CREATE INDEX "flashcards_deck_id_index" ON "flashcards" USING btree ("deck_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_source_source_ref_index" ON "media_assets" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "media_assets_status_index" ON "media_assets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quiz_options_question_id_index" ON "quiz_options" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_segment_id_index" ON "quiz_questions" USING btree ("segment_id");--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_quiz_options" CHECK ("children"."quiz_options" is null or "children"."quiz_options" between 2 and 4);--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_quiz_questions" CHECK ("children"."quiz_questions" is null or "children"."quiz_questions" between 1 and 10);--> statement-breakpoint
-- Перенос списков детей этапа 1 в общий список (видео сохраняют порядок).
INSERT INTO "child_items" ("child_id", "kind", "segment_id", "position", "created_at")
SELECT "child_id", 'segment', "segment_id", "position", "created_at" FROM "child_segments";
