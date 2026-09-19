/* hooks/skills.ts — React Query hooks for the Skills Lab (list, detail, versions,
   stats, .md import preview) and the per-agent skill bindings. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillImportPreviewBody,
  SkillStats,
  SkillSummary,
  SkillUpdate,
  SkillVersion,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills(),
    queryFn: () => api.get<SkillSummary[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Input for creating a skill (`source`/`enabled` default server-side). */
export type CreateSkillInput = Pick<SkillCreate, "name" | "type" | "body"> &
  Partial<Pick<SkillCreate, "description" | "source" | "enabled">>;

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.setQueryData(queryKeys.skill(data.id), data);
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdate }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.skillVersions(data.id) });
      qc.setQueryData(queryKeys.skill(data.id), data);
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.removeQueries({ queryKey: queryKeys.skill(id) });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillStats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Parse an uploaded .md (text only) into an editable preview. Persists nothing. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (body: SkillImportPreviewBody) =>
      api.post<SkillImportPreview>("/skills/import/preview", body),
  });
}

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** One entry of the per-agent binding set; array order = prompt order. */
export interface AgentSkillLinkInput {
  skill_id: string;
  order?: number;
  enabled?: boolean;
}

export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (links: AgentSkillLinkInput[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { links }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.agentSkills(agentId), data);
      qc.invalidateQueries({ queryKey: queryKeys.skills() });
      qc.invalidateQueries({ queryKey: queryKeys.agent(agentId) });
    },
  });
}
