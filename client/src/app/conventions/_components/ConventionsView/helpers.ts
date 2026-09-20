import type { Convention } from "@/lib/hooks/conventions";

export const acceptedOf = (list: Convention[]): Convention[] => list.filter((c) => c.accepted);

/** Repo name without the owner ("acme/shop" → "shop"). */
export const shortRepoName = (fullName: string): string => fullName.split("/").pop() ?? fullName;
