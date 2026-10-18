ALTER TABLE "agent_runs" ADD COLUMN "multi_agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "multi_agent_runs" ADD COLUMN "requested_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "multi_agent_runs" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_multi_agent_run_id_multi_agent_runs_id_fk" FOREIGN KEY ("multi_agent_run_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_multi_agent_run_id_idx" ON "agent_runs" USING btree ("multi_agent_run_id");--> statement-breakpoint
CREATE INDEX "multi_agent_runs_pr_ran_at_idx" ON "multi_agent_runs" USING btree ("pr_id","ran_at");