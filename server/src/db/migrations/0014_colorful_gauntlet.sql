CREATE TABLE "finding_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"finding_id" uuid NOT NULL,
	"language" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"source_hash" text NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"suggestion" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" double precision,
	"translated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finding_translations" ADD CONSTRAINT "finding_translations_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finding_translations_finding_language_uq" ON "finding_translations" USING btree ("finding_id","language");