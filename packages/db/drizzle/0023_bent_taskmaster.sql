ALTER TABLE "children" ADD COLUMN "illustrations" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "illustration_id" uuid;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_illustration_id_media_assets_id_fk" FOREIGN KEY ("illustration_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;