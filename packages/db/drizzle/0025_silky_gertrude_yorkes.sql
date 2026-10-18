CREATE TABLE "habit_marks" (
	"habit_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"date" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "habit_marks_habit_id_date_pk" PRIMARY KEY("habit_id","date")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"preset" text,
	"title" text NOT NULL,
	"slot" text NOT NULL,
	"remind_at" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"reward_id" uuid,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"bonus_minutes" integer,
	"granted_by" uuid,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"bonus_minutes" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rewards_price" CHECK ("rewards"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "habit_marks" ADD CONSTRAINT "habit_marks_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_marks" ADD CONSTRAINT "habit_marks_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_grants" ADD CONSTRAINT "reward_grants_granted_by_parent_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."parent_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_marks_child_id_date_index" ON "habit_marks" USING btree ("child_id","date");--> statement-breakpoint
CREATE INDEX "habits_child_id_index" ON "habits" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "reward_grants_child_id_at_index" ON "reward_grants" USING btree ("child_id","at");--> statement-breakpoint
CREATE INDEX "rewards_child_id_index" ON "rewards" USING btree ("child_id");