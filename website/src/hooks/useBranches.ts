import { useQuery } from "@tanstack/react-query";
import { githubService } from "../services/githubAPI";
import type { Branch } from "../types";

export function useBranches(
  owner: string | undefined,
  repo: string | undefined,
) {
  const { data, isLoading, error } = useQuery<Branch[], Error>({
    queryKey: ["branches", owner, repo],
    queryFn: () => githubService.getBranches(owner!, repo!),
    enabled: !!owner && !!repo,
  });

  return {
    branches: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
  };
}
