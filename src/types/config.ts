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
  enabled?: boolean;
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
      enabled: boolean;
    };
    patch: {
      target: number;
      threshold: number | null;
      informational: boolean;
      enabled: boolean;
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
