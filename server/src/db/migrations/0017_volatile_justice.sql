CREATE TABLE "eval_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"strategy" text NOT NULL,
	"system_prompt" text NOT NULL,
	"skill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cases_executed" integer DEFAULT 0 NOT NULL,
	"cases_errored" integer DEFAULT 0 NOT NULL,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cost_usd" double precision,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_pr_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "eval_agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text DEFAULT 'running' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error_reason" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "expected_count" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "got_count" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "kept_count" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "dropped_count" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "must_find_total" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "must_find_matched" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "positive_findings" integer;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "negative_findings" integer;--> statement-breakpoint
ALTER TABLE "eval_agent_runs" ADD CONSTRAINT "eval_agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_agent_runs" ADD CONSTRAINT "eval_agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_agent_runs_agent_started_idx" ON "eval_agent_runs" USING btree ("agent_id","started_at");--> statement-breakpoint
CREATE INDEX "eval_agent_runs_ws_started_idx" ON "eval_agent_runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_agent_runs_active_uq" ON "eval_agent_runs" USING btree ("agent_id") WHERE "eval_agent_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_pr_id_pull_requests_id_fk" FOREIGN KEY ("source_pr_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_eval_agent_run_id_eval_agent_runs_id_fk" FOREIGN KEY ("eval_agent_run_id") REFERENCES "public"."eval_agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("workspace_id","owner_kind","owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_owner_finding_uq" ON "eval_cases" USING btree ("owner_kind","owner_id","source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_cases_source_finding_idx" ON "eval_cases" USING btree ("source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_cases_source_pr_idx" ON "eval_cases" USING btree ("source_pr_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_ran_idx" ON "eval_runs" USING btree ("case_id","ran_at");--> statement-breakpoint
CREATE INDEX "eval_runs_agent_run_idx" ON "eval_runs" USING btree ("eval_agent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_runs_case_running_uq" ON "eval_runs" USING btree ("case_id") WHERE "eval_runs"."status" = 'running' AND "eval_runs"."eval_agent_run_id" IS NULL;