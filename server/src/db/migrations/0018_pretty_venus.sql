ALTER TABLE "ci_installations" ADD COLUMN "agent_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "mode" text DEFAULT 'pr' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "manifest_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "post_as" text DEFAULT 'github_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "triggers" text[] DEFAULT '{opened,synchronize}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "skill_slugs" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "removal_pr_url" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "last_run_status" text;--> statement-breakpoint
ALTER TABLE "ci_installations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_name" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_slug" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "pr_title" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "verdict" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "critical" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "warning" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "suggestion" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "blockers" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" bigint;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
CREATE INDEX "ci_installations_repo_idx" ON "ci_installations" USING btree ("repo");--> statement-breakpoint
CREATE UNIQUE INDEX "ci_runs_run_slug_uq" ON "ci_runs" USING btree ("github_run_id","agent_slug");--> statement-breakpoint
CREATE INDEX "ci_runs_ws_ran_idx" ON "ci_runs" USING btree ("workspace_id","ran_at" desc);--> statement-breakpoint
CREATE INDEX "ci_runs_installation_idx" ON "ci_runs" USING btree ("ci_installation_id");