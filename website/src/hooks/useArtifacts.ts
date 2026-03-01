import { useQuery } from "@tanstack/react-query";
import { parseArtifact } from "../services/artifactParser";
import { githubService } from "../services/githubAPI";
import type { TimeSeriesDataPoint } from "../types";

/**
 * Fetches and parses codecov artifacts for a given repo/branch/time range.
 * Uses TanStack Query for caching -- switching between branches or time
 * ranges that were already fetched will return instantly from cache.
 */
export function useArtifacts(
  owner: string | undefined,
  repo: string | undefined,
  branch: string | null,
  days: number,
) {
  const { data, isLoading, isFetching, error } = useQuery<
    TimeSeriesDataPoint[],
    Error
  >({
    queryKey: ["artifacts", owner, repo, branch, days],
    queryFn: () => fetchArtifacts(owner!, repo!, branch!, days),
    enabled: !!owner && !!repo && !!branch,
    placeholderData: (prev) => prev, // keep previous data while refetching
  });

  return {
    data: data ?? [],
    loading: isLoading, // true only on first load (no data yet)
    fetching: isFetching, // true on any fetch (including background refetch)
    error: error?.message ?? null,
  };
}

async function fetchArtifacts(
  owner: string,
  repo: string,
  branch: string,
  days: number,
): Promise<TimeSeriesDataPoint[]> {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. Fetch workflow runs for branch
  const runs = await githubService.getWorkflowRuns(owner, repo, branch);

  // 2. Filter by time range
  const filteredRuns = runs.filter((run) => {
    const runDate = new Date(run.created_at);
    return runDate >= start && runDate <= now;
  });

  // 3. For each run, fetch and parse artifacts
  const dataPoints: TimeSeriesDataPoint[] = [];
  const processedRunIds = new Set<number>();
  let authErrorEncountered = false;

  // Limit to prevent too many API calls
  const runsToProcess = filteredRuns.slice(0, 20);

  // Process runs in parallel batches of 5 for speed
  const BATCH_SIZE = 5;
  for (let i = 0; i < runsToProcess.length; i += BATCH_SIZE) {
    const batch = runsToProcess.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((run) => processRun(owner, repo, run, processedRunIds)),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value?.authError) {
          authErrorEncountered = true;
        }
        if (result.value?.dataPoint) {
          dataPoints.push(result.value.dataPoint);
        }
      }
    }
  }

  // If we found artifacts but couldn't download any, surface the auth error
  if (dataPoints.length === 0 && authErrorEncountered) {
    throw new Error(
      "Authentication required to download artifacts. " +
        "GitHub requires a Personal Access Token to access workflow artifacts, even for public repositories. " +
        "Please set up a token using the button in the header.",
    );
  }

  // Remove duplicates - keep only the most recent run per commit SHA
  const uniqueDataPoints = new Map<string, TimeSeriesDataPoint>();
  dataPoints.sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const point of dataPoints) {
    if (!uniqueDataPoints.has(point.commitSha)) {
      uniqueDataPoints.set(point.commitSha, point);
    }
  }

  // Sort oldest-first for chart display
  return Array.from(uniqueDataPoints.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
}

interface ProcessRunResult {
  dataPoint?: TimeSeriesDataPoint;
  authError?: boolean;
}

async function processRun(
  owner: string,
  repo: string,
  run: { id: number; created_at: string; head_sha: string; run_number: number },
  processedRunIds: Set<number>,
): Promise<ProcessRunResult> {
  if (processedRunIds.has(run.id)) return {};
  processedRunIds.add(run.id);

  let authError = false;

  const artifacts = await githubService.getRunArtifacts(owner, repo, run.id);

  const testArtifact = artifacts.find(
    (a) => a.name.startsWith("codecov-test-results") && !a.expired,
  );
  const coverageArtifact = artifacts.find(
    (a) => a.name.startsWith("codecov-coverage-results") && !a.expired,
  );

  if (!testArtifact && !coverageArtifact) return {};

  const dataPoint: TimeSeriesDataPoint = {
    date: new Date(run.created_at),
    commitSha: run.head_sha,
    runId: run.id,
    runNumber: run.run_number || 0,
  };

  // Download test and coverage artifacts in parallel
  const [testResult, coverageResult] = await Promise.allSettled([
    testArtifact
      ? githubService
          .downloadArtifact(owner, repo, testArtifact.id)
          .then(parseArtifact)
      : Promise.resolve(null),
    coverageArtifact
      ? githubService
          .downloadArtifact(owner, repo, coverageArtifact.id)
          .then(parseArtifact)
      : Promise.resolve(null),
  ]);

  if (testResult.status === "fulfilled" && testResult.value?.tests) {
    const t = testResult.value.tests;
    dataPoint.tests = {
      total: t.totalTests,
      passed: t.passedTests,
      failed: t.failedTests,
      skipped: t.skippedTests,
      passRate: t.passRate,
      totalTime: t.totalTime,
    };
  } else if (testResult.status === "rejected") {
    if (isAuthError(testResult.reason)) authError = true;
  }

  if (coverageResult.status === "fulfilled" && coverageResult.value?.coverage) {
    dataPoint.coverage = coverageResult.value.coverage;
  } else if (coverageResult.status === "rejected") {
    if (isAuthError(coverageResult.reason)) authError = true;
  }

  if (dataPoint.tests || dataPoint.coverage) {
    return { dataPoint, authError };
  }

  return { authError };
}

function isAuthError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("authentication") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden")
    );
  }
  return false;
}
