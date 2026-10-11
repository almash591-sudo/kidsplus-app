CREATE TABLE "kid_captures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"duration_ms" integer,
	"storage_key" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kid_captures" ADD CONSTRAINT "kid_captures_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kid_captures" ADD CONSTRAINT "kid_captures_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kid_captures_child_id_taken_at_index" ON "kid_captures" USING btree ("child_id","taken_at");--> statement-breakpoint
CREATE INDEX "kid_captures_created_at_index" ON "kid_captures" USING btree ("created_at");