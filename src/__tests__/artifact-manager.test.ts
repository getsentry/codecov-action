import { beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import { getOctokit } from "@actions/github";
import { ArtifactManager } from "../utils/artifact-manager.js";

vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@actions/artifact", () => ({
  DefaultArtifactClient: class {
    uploadArtifact = vi.fn();
  },
}));

vi.mock("@actions/github", () => ({
  getOctokit: vi.fn(),
}));

type WorkflowRun = {
  id: number;
  run_number: number;
};

describe("ArtifactManager base SHA lookup", () => {
  const listWorkflowRunsForRepo = vi.fn();
  const listWorkflowRunArtifacts = vi.fn();
  const downloadArtifact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_REPOSITORY = "owner/repo";

    vi.mocked(getOctokit).mockReturnValue({
      rest: {
        actions: {
          listWorkflowRunsForRepo,
          listWorkflowRunArtifacts,
          downloadArtifact,
        },
      },
    } as never);
  });

  it("falls back to base branch for test results when base SHA has no successful runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } })
      .mockResolvedValueOnce({
        data: { workflow_runs: [{ id: 101, run_number: 7 } as WorkflowRun] },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults("main", "abc123");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "abc123",
      status: "success",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "success",
      per_page: 10,
    });
    expect(listWorkflowRunArtifacts).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      run_id: 101,
    });
  });

  it("uses SHA workflow runs for test results without branch fallback when SHA run exists", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: { workflow_runs: [{ id: 201, run_number: 8 } as WorkflowRun] },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults("main", "def456");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      head_sha: "def456",
      status: "success",
      per_page: 10,
    });
    expect(listWorkflowRunArtifacts).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      run_id: 201,
    });
  });

  it("uses branch lookup only for test results when base SHA is not provided", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: { workflow_runs: [{ id: 301, run_number: 9 } as WorkflowRun] },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults("develop");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "develop",
      status: "success",
      per_page: 10,
    });
  });

  it("falls back to base branch for coverage when base SHA has no successful runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } })
      .mockResolvedValueOnce({
        data: { workflow_runs: [{ id: 401, run_number: 10 } as WorkflowRun] },
      });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      ["unit"],
      "ghi789",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(1, {
      owner: "owner",
      repo: "repo",
      head_sha: "ghi789",
      status: "success",
      per_page: 10,
    });
    expect(listWorkflowRunsForRepo).toHaveBeenNthCalledWith(2, {
      owner: "owner",
      repo: "repo",
      branch: "main",
      status: "success",
      per_page: 10,
    });
  });

  it("uses SHA workflow runs for coverage without branch fallback when SHA run exists", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: { workflow_runs: [{ id: 501, run_number: 11 } as WorkflowRun] },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults(
      "main",
      ["unit"],
      "jkl012",
    );

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      head_sha: "jkl012",
      status: "success",
      per_page: 10,
    });
  });

  it("uses branch lookup only for coverage when base SHA is not provided", async () => {
    listWorkflowRunsForRepo.mockResolvedValueOnce({
      data: { workflow_runs: [{ id: 601, run_number: 12 } as WorkflowRun] },
    });
    listWorkflowRunArtifacts.mockResolvedValue({ data: { artifacts: [] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseCoverageResults("release");

    expect(result).toBeNull();
    expect(listWorkflowRunsForRepo).toHaveBeenCalledTimes(1);
    expect(listWorkflowRunsForRepo).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      branch: "release",
      status: "success",
      per_page: 10,
    });
  });

  it("logs SHA fallback info when SHA has no successful runs", async () => {
    listWorkflowRunsForRepo
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } })
      .mockResolvedValueOnce({ data: { workflow_runs: [] as WorkflowRun[] } });

    const manager = new ArtifactManager("token");
    const result = await manager.downloadBaseResults("main", "zzz999");

    expect(result).toBeNull();
    expect(vi.mocked(core.info)).toHaveBeenCalledWith(
      "ℹ️ No successful workflow runs found for SHA 'zzz999'. Falling back to branch 'main'",
    );
  });
});
