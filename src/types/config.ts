/**
 * Configuration types for the action
 */

/**
 * Coverage status configuration (project/patch)
 */
export interface CoverageStatusConfig {
  target?: number | "auto"; // Target coverage percentage (or "auto" to use base branch)
  threshold?: number | string | null; // Allowed drop in coverage percentage (supports "10%" or 10)
  informational?: boolean; // When true, status check reports but never fails the build
}

/**
 * Comment configuration.
 * Supports boolean or empty object (for future extensibility).
 * - `comment: true` - Enable PR comments
 * - `comment: false` - Disable PR comments
 * - `comment: {}` - Enable PR comments (object form for future properties)
 * - `comment: { files: "all" | "changed" | "none" }` - Control file table scope in PR comments
 */
export type CommentFilesMode = "all" | "changed" | "none";

export interface CommentConfigObject {
  files?: CommentFilesMode | string;
  [key: string]: unknown;
}

export type CommentConfigInput = boolean | CommentConfigObject;

/**
 * Root configuration interface for .github/coverage.yml
 * Supports both direct config and Codecov-style nested "default" key
 */
export interface CodecovConfig {
  coverage?: {
    status?: {
      // Support both direct config and nested "default" key (Codecov-style)
      project?: CoverageStatusConfig | { default?: CoverageStatusConfig };
      patch?: CoverageStatusConfig | { default?: CoverageStatusConfig };
    };
    ignore?: string[]; // Glob patterns to ignore
  };
  comment?: CommentConfigInput;
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
    files: CommentFilesMode;
    // Future: layout, requireChanges, requireBase, requireHead
  };
}
