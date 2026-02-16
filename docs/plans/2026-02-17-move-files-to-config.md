# Move `files` from `comment` to `config` — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the `files` setting from `comment` to a new top-level `config` section so it controls file tables in both Job Summary and PR comments.

**Architecture:** Add `config?: { files?: CommentFilesMode }` to the raw YAML interface and `config: { files: CommentFilesMode }` to the normalized config. Simplify `comment` to a pure boolean toggle. Wire `config.files` into both `formatReport()` call sites in `src/index.ts`.

**Tech Stack:** TypeScript, Vitest, js-yaml, Rollup (for dist build)

---

### Task 1: Update types

**Files:**
- Modify: `src/types/config.ts`

**Step 1: Edit `CodecovConfig` — add `config` key, simplify `comment`**

Replace the entire `src/types/config.ts` with:

```typescript
/**
 * Configuration types for the action
 */

/**
 * Coverage status configuration (project/patch)
 */
export interface CoverageStatusConfig {
  target?: number | "auto";
  threshold?: number | string | null;
  informational?: boolean;
}

/**
 * File display mode for coverage reports (Job Summary + PR comments)
 */
export type CommentFilesMode = "all" | "changed" | "none";

/**
 * Root configuration interface for .github/coverage.yml
 */
export interface CodecovConfig {
  coverage?: {
    status?: {
      project?: CoverageStatusConfig | { default?: CoverageStatusConfig };
      patch?: CoverageStatusConfig | { default?: CoverageStatusConfig };
    };
    ignore?: string[];
  };
  comment?: boolean;
  config?: {
    files?: CommentFilesMode | string;
  };
}

/**
 * Normalized configuration used internally by the action
 */
export interface NormalizedConfig {
  status: {
    project: {
      target: number | "auto";
      threshold: number | null;
      informational: boolean;
    };
    patch: {
      target: number;
      threshold: number | null;
      informational: boolean;
    };
  };
  ignore: string[];
  comment: {
    enabled: boolean;
  };
  config: {
    files: CommentFilesMode;
  };
}
```

**Step 2: Run type-check to see what breaks**

Run: `cd /Users/am/dev/sentry/codecov-action && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors in `config-loader.ts` and `index.ts` (they still reference `comment.files`)

---

### Task 2: Update config loader

**Files:**
- Modify: `src/config/config-loader.ts`

**Step 1: Simplify the config loader**

Replace the entire `src/config/config-loader.ts` with:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as yaml from "js-yaml";
import type {
  CommentFilesMode,
  CodecovConfig,
  CoverageStatusConfig,
  NormalizedConfig,
} from "../types/config.js";

export class ConfigLoader {
  private static readonly FILES_VALUES: Set<CommentFilesMode> = new Set([
    "all",
    "changed",
    "none",
  ]);

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

    return this.normalizeFullConfig(config);
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
   * Normalize comment config to a simple enabled boolean.
   * - `comment: true` -> enabled
   * - `comment: false` -> disabled
   * - `comment: null` -> enabled
   * - Not specified -> disabled (falls back to action input)
   */
  private normalizeComment(comment?: boolean): { enabled: boolean } {
    if (comment === undefined) return { enabled: false };
    if (comment === null) return { enabled: true };
    return { enabled: comment };
  }

  /**
   * Parse the config.files value
   */
  private parseFilesMode(value: unknown): CommentFilesMode {
    if (value === undefined) {
      return "all";
    }

    if (
      typeof value === "string" &&
      ConfigLoader.FILES_VALUES.has(value as CommentFilesMode)
    ) {
      return value as CommentFilesMode;
    }

    core.warning(
      `Invalid config.files value "${String(
        value
      )}". Falling back to "all". Valid values: all, changed, none.`
    );
    return "all";
  }

  /**
   * Normalize configuration with defaults
   */
  private normalizeFullConfig(config: CodecovConfig): NormalizedConfig {
    const coverage = config.coverage || {};
    const status = coverage.status || {};

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
          target: typeof patch.target === "number" ? patch.target : 80,
          threshold: this.parseThreshold(patch.threshold),
          informational: patch.informational ?? false,
        },
      },
      ignore: coverage.ignore || [],
      comment: this.normalizeComment(config.comment),
      config: {
        files: this.parseFilesMode(config.config?.files),
      },
    };
  }
}
```

**Step 2: Run type-check**

Run: `cd /Users/am/dev/sentry/codecov-action && npx tsc --noEmit 2>&1 | head -40`
Expected: Errors only in `index.ts` now (still references `comment.files`)

---

### Task 3: Update index.ts

**Files:**
- Modify: `src/index.ts:41` — change `comment` type in `CoverageConfig`
- Modify: `src/index.ts:136` — add `config` to return value
- Modify: `src/index.ts:344-370` — wire `config.files` into both formatReport calls

**Step 1: Update `CoverageConfig` interface**

In `src/index.ts`, change line 41 from:
```typescript
  comment: NormalizedConfig["comment"];
```
to:
```typescript
  comment: NormalizedConfig["comment"];
  config: NormalizedConfig["config"];
```

**Step 2: Update `getCoverageConfig()` return**

In `src/index.ts`, after line 136 (`comment: yamlConfig.comment,`), add:
```typescript
    config: yamlConfig.config,
```

**Step 3: Update Job Summary `formatReport` call**

In `src/index.ts`, replace lines 344-350 (the Job Summary `formatReport` call):

From:
```typescript
    const summaryReportBody = formatter.formatReport(
      aggregatedTestResults || undefined,
      aggregatedCoverageResults || undefined,
      {
        patchTarget: patchTargetForFormatter,
      }
    );
```

To:
```typescript
    const reportOptions: import("./formatters/report-formatter.js").ReportFormatOptions = {
      filesMode: coverageConfig.config.files,
      changedFiles:
        coverageConfig.config.files === "changed"
          ? patchCoverage?.changedFiles || []
          : undefined,
      patchTarget: patchTargetForFormatter,
    };

    const summaryReportBody = formatter.formatReport(
      aggregatedTestResults || undefined,
      aggregatedCoverageResults || undefined,
      reportOptions
    );
```

**Step 4: Update PR comment `formatReport` call**

In `src/index.ts`, replace the PR comment `formatReport` call (lines 359-370):

From:
```typescript
      const prCommentBody = formatter.formatReport(
        aggregatedTestResults || undefined,
        aggregatedCoverageResults || undefined,
        {
          filesMode: coverageConfig.comment.files,
          changedFiles:
            coverageConfig.comment.files === "changed"
              ? patchCoverage?.changedFiles || []
              : undefined,
          patchTarget: patchTargetForFormatter,
        }
      );
```

To:
```typescript
      const prCommentBody = formatter.formatReport(
        aggregatedTestResults || undefined,
        aggregatedCoverageResults || undefined,
        reportOptions
      );
```

**Step 5: Run type-check**

Run: `cd /Users/am/dev/sentry/codecov-action && npx tsc --noEmit`
Expected: No errors

---

### Task 4: Update config-loader tests

**Files:**
- Modify: `src/__tests__/config-loader.test.ts`

**Step 1: Update the tests**

The `"comment configuration"` describe block needs updating. Replace the entire `describe("comment configuration", ...)` block (lines 212-328) with:

```typescript
  describe("comment configuration", () => {
    it("should parse comment: true", async () => {
      const yaml = `
comment: true
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.comment.enabled).toBe(true);
    });

    it("should parse comment: false", async () => {
      const yaml = `
comment: false
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.comment.enabled).toBe(false);
    });

    it("should handle comment: null without crashing", async () => {
      const yaml = `
comment: null
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.comment.enabled).toBe(true);
    });

    it("should default comment to disabled when not specified", async () => {
      const yaml = `
coverage:
  status:
    project:
      target: 80
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.comment.enabled).toBe(false);
    });
  });

  describe("config section", () => {
    it("should default config.files to all when not specified", async () => {
      vi.spyOn(fs, "existsSync").mockReturnValue(false);

      const config = await loader.loadConfig();

      expect(config.config.files).toBe("all");
    });

    it("should parse config.files changed", async () => {
      const yaml = `
config:
  files: changed
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.config.files).toBe("changed");
    });

    it("should parse config.files none", async () => {
      const yaml = `
config:
  files: none
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.config.files).toBe("none");
    });

    it("should parse config.files all", async () => {
      const yaml = `
config:
  files: all
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);

      const config = await loader.loadConfig();

      expect(config.config.files).toBe("all");
    });

    it("should fallback to all for invalid config.files value", async () => {
      const yaml = `
config:
  files: bad
`;
      vi.spyOn(fs, "existsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(yaml);
      const warningSpy = vi
        .spyOn(core, "warning")
        .mockImplementation(() => undefined);

      const config = await loader.loadConfig();

      expect(config.config.files).toBe("all");
      expect(warningSpy).toHaveBeenCalledWith(
        'Invalid config.files value "bad". Falling back to "all". Valid values: all, changed, none.'
      );
    });
  });
```

Also update the defaults test (line 28) — change `expect(config.comment.files).toBe("all")` to `expect(config.config.files).toBe("all")`.

**Step 2: Run tests**

Run: `cd /Users/am/dev/sentry/codecov-action && pnpm test -- --run src/__tests__/config-loader.test.ts`
Expected: All tests pass

---

### Task 5: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update the YAML example (lines 444-447)**

From:
```yaml
# Enable PR comments from config (alternative to post-pr-comment input)
comment:
  files: changed   # all (default) | changed | none
```

To:
```yaml
# Enable PR comments from config (alternative to post-pr-comment input)
comment: true

# Report display settings
config:
  files: changed   # all (default) | changed | none
```

**Step 2: Update the config table (line 457)**

From:
```
| `comment` | Enable PR comments and configure file table scope. Set to `true`, `false`, `{}`, or `{ files: all\|changed\|none }` (default `all`) |
```

To:
```
| `comment` | Enable PR comments. Set to `true` or `false` |
| `config.files` | Control file table scope in reports (Job Summary + PR comments). Values: `all` (default), `changed`, `none` |
```

**Step 3: Update the Codecov-compatible example (lines 478-480)**

From:
```yaml
comment:
  files: changed
```

To:
```yaml
comment: true

config:
  files: changed
```

**Step 4: Update the "PR Comment File List Mode" section (lines 484-492)**

From:
```markdown
### PR Comment File List Mode

Use `comment.files` to control the "Files with missing lines" section in PR comments:

- `all` (default): show all files with missing/partial lines
- `changed`: show only non-deleted files from the PR diff
- `none`: hide the section entirely

This setting only affects PR comments. Job Summary output remains unchanged.
```

To:
```markdown
### Report File List Mode

Use `config.files` to control the "Files with missing lines" section in both Job Summary and PR comments:

- `all` (default): show all files with missing/partial lines
- `changed`: show only non-deleted files from the PR diff
- `none`: hide the section entirely
```

---

### Task 6: Build and verify

**Step 1: Build dist**

Run: `cd /Users/am/dev/sentry/codecov-action && pnpm run build`
Expected: Builds successfully, `dist/index.js` updated

**Step 2: Run full test suite**

Run: `cd /Users/am/dev/sentry/codecov-action && pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/types/config.ts src/config/config-loader.ts src/index.ts src/__tests__/config-loader.test.ts README.md dist/index.js
git commit -m "refactor: move files setting from comment to config section

Moves the files display mode (all/changed/none) from comment config
to a new top-level config section. Both Job Summary and PR comments
now respect config.files, decoupling report styling from the comment
toggle."
```
