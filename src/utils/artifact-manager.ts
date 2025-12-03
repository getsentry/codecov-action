import * as core from "@actions/core";
import * as artifact from "@actions/artifact";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AggregatedTestResults } from "../types/test-results.js";

/**
 * Manages artifact upload and download for test results comparison
 */
export class ArtifactManager {
  private artifactClient = artifact.create();

  /**
   * Sanitize branch name to be used in artifact name
   */
  private sanitizeBranchName(branchName: string): string {
    // Replace special characters with hyphens
    return branchName.replace(/[^a-zA-Z0-9-_]/g, "-");
  }

  /**
   * Generate artifact name for a branch
   */
  private getArtifactName(branchName: string): string {
    const sanitized = this.sanitizeBranchName(branchName);
    return `codecov-results-${sanitized}`;
  }

  /**
   * Upload test results as an artifact
   */
  async uploadResults(
    results: AggregatedTestResults,
    branchName: string
  ): Promise<void> {
    try {
      const artifactName = this.getArtifactName(branchName);
      core.info(`📤 Uploading test results as artifact: ${artifactName}`);

      // Create a temporary directory for the artifact
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codecov-"));
      const resultsFile = path.join(tmpDir, "test-results.json");

      // Write results to file (without the comparison field to avoid circular data)
      const resultsToSave = { ...results };
      delete resultsToSave.comparison;
      fs.writeFileSync(resultsFile, JSON.stringify(resultsToSave, null, 2));

      // Upload the artifact
      const uploadResult = await this.artifactClient.uploadArtifact(
        artifactName,
        [resultsFile],
        tmpDir,
        {
          continueOnError: false,
        }
      );

      core.info(
        `✅ Artifact uploaded successfully. ID: ${uploadResult.artifactName}`
      );

      // Clean up temporary file
      fs.unlinkSync(resultsFile);
      fs.rmdirSync(tmpDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      core.warning(`Failed to upload artifact: ${message}`);
      // Don't throw - artifact upload failure shouldn't fail the action
    }
  }

  /**
   * Download test results from a base branch artifact
   */
  async downloadBaseResults(
    baseBranch: string
  ): Promise<AggregatedTestResults | null> {
    try {
      const artifactName = this.getArtifactName(baseBranch);
      core.info(`📥 Attempting to download base results: ${artifactName}`);

      // Create a temporary directory for download
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codecov-base-"));

      // Download the artifact
      const downloadResult = await this.artifactClient.downloadArtifact(
        artifactName,
        tmpDir
      );

      core.info(`Downloaded artifact to: ${downloadResult.downloadPath}`);

      // Read the results file
      const resultsFile = path.join(downloadResult.downloadPath, "test-results.json");
      
      if (!fs.existsSync(resultsFile)) {
        core.warning("Downloaded artifact does not contain test-results.json");
        return null;
      }

      const resultsContent = fs.readFileSync(resultsFile, "utf-8");
      const results = JSON.parse(resultsContent) as AggregatedTestResults;

      core.info("✅ Base results downloaded successfully");

      // Clean up temporary files
      fs.unlinkSync(resultsFile);
      fs.rmdirSync(downloadResult.downloadPath, { recursive: true });

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      
      // Check if it's a "not found" error
      if (message.includes("not found") || message.includes("Unable to find")) {
        core.info(
          `ℹ️ No base results found for branch '${baseBranch}'. This may be the first run.`
        );
      } else {
        core.warning(`Failed to download base artifact: ${message}`);
      }
      
      return null;
    }
  }

  /**
   * Get the current branch name from the GitHub context
   */
  static getCurrentBranch(): string {
    // Try to get from GITHUB_REF
    const ref = process.env.GITHUB_REF || "";
    
    if (ref.startsWith("refs/heads/")) {
      return ref.replace("refs/heads/", "");
    }
    
    if (ref.startsWith("refs/pull/")) {
      // For PRs, use the head ref
      return process.env.GITHUB_HEAD_REF || "unknown";
    }
    
    return "unknown";
  }
}

