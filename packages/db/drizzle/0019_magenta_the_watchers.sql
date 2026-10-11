CREATE TABLE "family_phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"audio_id" uuid NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flashcards" ADD COLUMN "custom_audio_id" uuid;--> statement-breakpoint
ALTER TABLE "family_phrases" ADD CONSTRAINT "family_phrases_audio_id_media_assets_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flashcards" ADD CONSTRAINT "flashcards_custom_audio_id_media_assets_id_fk" FOREIGN KEY ("custom_audio_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;