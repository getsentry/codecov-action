import { useEffect, useState } from "react";
import { parseArtifact } from "../services/artifactParser";
import { githubService } from "../services/githubAPI";
import type { TimeRange, TimeSeriesDataPoint } from "../types";

export function useArtifacts(
  owner: string | undefined,
  repo: string | undefined,
  branch: string,
  timeRange: TimeRange,
) {
  const [data, setData] = useState<TimeSeriesDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo || !branch) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchArtifacts() {
      if (!owner || !repo) return;

      try {
        setLoading(true);
        setError(null);

        // 1. Fetch workflow runs for branch
        const runs = await githubService.getWorkflowRuns(owner, repo, branch);

        // 2. Filter by time range
        const filteredRuns = runs.filter((run) => {
          const runDate = new Date(run.created_at);
          return runDate >= timeRange.start && runDate <= timeRange.end;
        });

        if (cancelled) return;

        // 3. For each run, fetch and parse artifacts
        const dataPoints: TimeSeriesDataPoint[] = [];
        const processedRunIds = new Set<number>();
        let authErrorEncountered = false;

        // Limit to prevent too many API calls - process max 20 runs
        const runsToProcess = filteredRuns.slice(0, 20);

        for (const run of runsToProcess) {
          if (cancelled) break;

          // Skip if we've already processed this run ID
          if (processedRunIds.has(run.id)) {
            continue;
          }
          processedRunIds.add(run.id);

          try {
            const artifacts = await githubService.getRunArtifacts(
              owner,
              repo,
              run.id,
            );

            // Find codecov artifacts
            const testArtifact = artifacts.find(
              (a) => a.name.startsWith("codecov-test-results") && !a.expired,
            );
            const coverageArtifact = artifacts.find(
              (a) =>
                a.name.startsWith("codecov-coverage-results") && !a.expired,
            );

            if (!testArtifact && !coverageArtifact) continue;

            const dataPoint: TimeSeriesDataPoint = {
              date: new Date(run.created_at),
              commitSha: run.head_sha,
              runId: run.id,
              runNumber: run.run_number || 0,
            };

            // Download and parse test artifact
            if (testArtifact) {
              try {
                const zipData = await githubService.downloadArtifact(
                  owner,
                  repo,
                  testArtifact.id,
                );
                const parsed = await parseArtifact(zipData);
                if (parsed.tests) {
                  dataPoint.tests = {
                    total: parsed.tests.totalTests,
                    passed: parsed.tests.passedTests,
                    failed: parsed.tests.failedTests,
                    skipped: parsed.tests.skippedTests,
                    passRate: parsed.tests.passRate,
                    totalTime: parsed.tests.totalTime,
                  };
                }
              } catch (err) {
                if (isAuthError(err)) {
                  authErrorEncountered = true;
                }
                console.error(
                  `Failed to parse test artifact for run ${run.id}:`,
                  err,
                );
              }
            }

            // Download and parse coverage artifact
            if (coverageArtifact) {
              try {
                const zipData = await githubService.downloadArtifact(
                  owner,
                  repo,
                  coverageArtifact.id,
                );
                const parsed = await parseArtifact(zipData);
                if (parsed.coverage) {
                  dataPoint.coverage = parsed.coverage;
                }
              } catch (err) {
                if (isAuthError(err)) {
                  authErrorEncountered = true;
                }
                console.error(
                  `Failed to parse coverage artifact for run ${run.id}:`,
                  err,
                );
              }
            }

            if (dataPoint.tests || dataPoint.coverage) {
              dataPoints.push(dataPoint);
            }
          } catch (err) {
            if (isAuthError(err)) {
              authErrorEncountered = true;
            }
            console.error(`Failed to process run ${run.id}:`, err);
            // Continue with other runs
          }
        }

        if (!cancelled) {
          // If we found artifacts but couldn't download any, surface the auth error
          if (dataPoints.length === 0 && authErrorEncountered) {
            setError(
              "Authentication required to download artifacts. " +
                "GitHub requires a Personal Access Token to access workflow artifacts, even for public repositories. " +
                "Please set up a token using the button in the header.",
            );
            setData([]);
            return;
          }

          // Remove duplicates - keep only the most recent run per commit SHA
          const uniqueDataPoints = new Map<string, TimeSeriesDataPoint>();

          // Sort by date (newest first) to keep the most recent run per commit
          dataPoints.sort((a, b) => b.date.getTime() - a.date.getTime());

          for (const point of dataPoints) {
            if (!uniqueDataPoints.has(point.commitSha)) {
              uniqueDataPoints.set(point.commitSha, point);
            }
          }

          // Convert back to array and sort by date (oldest first for chart display)
          const finalDataPoints = Array.from(uniqueDataPoints.values());
          finalDataPoints.sort((a, b) => a.date.getTime() - b.date.getTime());

          setData(finalDataPoints);
        }
      } catch (err) {
        if (!cancelled) {
          if (isAuthError(err)) {
            setError(
              "Authentication required. GitHub requires a Personal Access Token to access workflow data. " +
                "Please set up a token using the button in the header.",
            );
          } else {
            setError(
              err instanceof Error ? err.message : "Failed to fetch artifacts",
            );
          }
          setData([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchArtifacts();

    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, timeRange]);

  return { data, loading, error };
}

/**
 * Check if an error is an authentication/authorization error from the GitHub API.
 */
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
