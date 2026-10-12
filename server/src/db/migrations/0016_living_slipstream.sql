CREATE TABLE "agent_repo_context" (
	"agent_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_repo_context_agent_id_repo_id_pk" PRIMARY KEY("agent_id","repo_id")
);
--> statement-breakpoint
CREATE TABLE "skill_repo_context" (
	"skill_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_repo_context_skill_id_repo_id_pk" PRIMARY KEY("skill_id","repo_id")
);
--> statement-breakpoint
ALTER TABLE "agent_repo_context" ADD CONSTRAINT "agent_repo_context_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_repo_context" ADD CONSTRAINT "agent_repo_context_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_repo_context" ADD CONSTRAINT "skill_repo_context_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_repo_context" ADD CONSTRAINT "skill_repo_context_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_repo_context_repo_idx" ON "agent_repo_context" USING btree ("repo_id");--> statement-breakpoint
CREATE INDEX "skill_repo_context_repo_idx" ON "skill_repo_context" USING btree ("repo_id");--> statement-breakpoint
ALTER TABLE "skills" DROP COLUMN "context_paths";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "context_paths";