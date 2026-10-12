ALTER TABLE "device_pairings" ADD COLUMN "preview" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "preview" boolean DEFAULT false NOT NULL;