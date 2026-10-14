CREATE TABLE "context_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"breadcrumb" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_offset" integer NOT NULL,
	"end_offset" integer NOT NULL,
	"tokens" integer NOT NULL,
	"text" text NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "context_chunks_file_ordinal_uq" UNIQUE("file_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "context_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"path" text NOT NULL,
	"type" text NOT NULL,
	"size" bigint NOT NULL,
	"tokens" integer NOT NULL,
	"content_hash" text,
	"too_large" boolean DEFAULT false NOT NULL,
	"unreadable" boolean DEFAULT false NOT NULL,
	"empty" boolean DEFAULT false NOT NULL,
	CONSTRAINT "context_files_repo_path_uq" UNIQUE("repo_id","path")
);
--> statement-breakpoint
CREATE TABLE "context_index_state" (
	"repo_id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"indexed_at" timestamp with time zone,
	"indexed_sha" text,
	"glob" text,
	"files" integer DEFAULT 0 NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_file_id_context_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."context_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_chunks" ADD CONSTRAINT "context_chunks_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_files" ADD CONSTRAINT "context_files_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_index_state" ADD CONSTRAINT "context_index_state_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_chunks_repo_idx" ON "context_chunks" USING btree ("repo_id");