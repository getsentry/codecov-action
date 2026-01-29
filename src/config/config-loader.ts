import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as yaml from "js-yaml";
import type {
  CodecovConfig,
  CoverageStatusConfig,
  NormalizedConfig,
} from "../types/config.js";

export class ConfigLoader {
  /**
   * Load and parse configuration from .github/coverage.yml or .github/codecov.yml
   */
  async loadConfig(): Promise<NormalizedConfig> {
    const configPath = this.findConfigPath();
    let config: CodecovConfig = {};

    if (configPath) {
      core.info(`📝 Loading configuration from ${configPath}`);
      try {
        const fileContent = fs.readFileSync(configPath, "utf8");
        const parsed = yaml.load(fileContent) as CodecovConfig;
        if (parsed) {
          config = parsed;
        }
      } catch (error) {
        core.warning(
          `Failed to load configuration file: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    } else {
      core.debug("No configuration file found");
    }

    return this.normalizeConfig(config);
  }

  /**
   * Find the configuration file path
   */
  private findConfigPath(): string | null {
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const candidates = [
      ".github/coverage.yml",
      ".github/coverage.yaml",
      ".github/codecov.yml",
      ".github/codecov.yaml",
      "coverage.yml",
      "codecov.yml",
    ];

    for (const candidate of candidates) {
      const fullPath = path.join(workspace, candidate);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Extract config from either direct or nested "default" form (Codecov-style)
   * Supports both:
   *   project:
   *     target: 80
   * and:
   *   project:
   *     default:
   *       target: 80
   */
  private extractStatusConfig(raw: unknown): Partial<CoverageStatusConfig> {
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;
    if ("default" in obj && typeof obj.default === "object" && obj.default !== null) {
      return obj.default as Partial<CoverageStatusConfig>;
    }
    return obj as Partial<CoverageStatusConfig>;
  }

  /**
   * Parse threshold values like "10%" or 10
   */
  private parseThreshold(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const match = value.match(/^(\d+(?:\.\d+)?)%?$/);
      return match ? parseFloat(match[1]) : null;
    }
    return null;
  }

  /**
   * Normalize comment config: boolean or object -> { enabled: boolean }
   * - `comment: true` -> enabled
   * - `comment: false` -> disabled
   * - `comment: {}` -> enabled (object form for future properties)
   * - Not specified -> disabled (falls back to action input)
   */
  private normalizeComment(comment?: boolean | object): { enabled: boolean } {
    if (comment === undefined) return { enabled: false };
    if (typeof comment === "boolean") return { enabled: comment };
    // Object form (empty or future props): treat as enabled
    return { enabled: true };
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeConfig(config: CodecovConfig): NormalizedConfig {
    const coverage = config.coverage || {};
    const status = coverage.status || {};

    // Support both direct and nested "default" key (Codecov-style)
    const projectRaw = status.project || {};
    const project = this.extractStatusConfig(projectRaw);
    const patchRaw = status.patch || {};
    const patch = this.extractStatusConfig(patchRaw);

    return {
      status: {
        project: {
          target: project.target ?? "auto",
          threshold: this.parseThreshold(project.threshold),
          informational: project.informational ?? false,
        },
        patch: {
          target: typeof patch.target === "number" ? patch.target : 80, // Default 80% for patch
          threshold: this.parseThreshold(patch.threshold),
          informational: patch.informational ?? false,
        },
      },
      ignore: coverage.ignore || [],
      comment: this.normalizeComment(config.comment),
    };
  }
}
