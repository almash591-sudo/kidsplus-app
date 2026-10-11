ALTER TYPE "public"."child_item_kind" ADD VALUE 'interactive';--> statement-breakpoint
CREATE TABLE "interactives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"params" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "child_items" DROP CONSTRAINT "child_items_target";--> statement-breakpoint
ALTER TABLE "child_items" ADD COLUMN "interactive_id" uuid;--> statement-breakpoint
ALTER TABLE "child_items" ADD CONSTRAINT "child_items_interactive_id_interactives_id_fk" FOREIGN KEY ("interactive_id") REFERENCES "public"."interactives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "child_items_child_id_interactive_id_index" ON "child_items" USING btree ("child_id","interactive_id");--> statement-breakpoint
ALTER TABLE "child_items" ADD CONSTRAINT "child_items_target" CHECK (("child_items"."kind"::text = 'segment' and "child_items"."segment_id" is not null and "child_items"."deck_id" is null and "child_items"."interactive_id" is null)
       or ("child_items"."kind"::text = 'deck' and "child_items"."deck_id" is not null and "child_items"."segment_id" is null and "child_items"."interactive_id" is null)
       or ("child_items"."kind"::text = 'interactive' and "child_items"."interactive_id" is not null and "child_items"."segment_id" is null and "child_items"."deck_id" is null));