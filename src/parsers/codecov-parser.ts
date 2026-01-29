import type {
  CoverageMetrics,
  CoverageResults,
  FileCoverage,
  LineCoverage,
} from "../types/coverage.js";
import { BaseCoverageParser, type CoverageFormat } from "./base-parser.js";

/**
 * Codecov JSON coverage format types
 * Format: { "coverage": { "filepath": { "lineNum": value, ... }, ... } }
 * Values: number (hit count), string "n/m" (branch coverage), null (skip)
 */
interface CodecovCoverageData {
  coverage: {
    [filePath: string]: {
      [lineNumber: string]: number | string | null;
    };
  };
}

/**
 * Parser for Codecov Custom JSON Coverage Format
 * Used by: cargo-llvm-cov (--codecov flag), custom coverage tools
 *
 * Format structure:
 * {
 *   "coverage": {
 *     "src/main.rs": {
 *       "1": 0,       // line 1 missed (0 hits)
 *       "2": 1,       // line 2 hit once
 *       "3": "1/2",   // line 3 partial branch (1 of 2 branches covered)
 *       "4": null,    // skip line 4 (not executable)
 *       "7": 5        // line 7 hit 5 times
 *     }
 *   }
 * }
 */
export class CodecovParser extends BaseCoverageParser {
  readonly format: CoverageFormat = "codecov";

  /**
   * Check if content is Codecov JSON format
   */
  canParse(content: string, filePath?: string): boolean {
    // Check file extension first
    if (filePath) {
      const fileName = filePath.toLowerCase();
      if (fileName.endsWith("codecov.json")) {
        return true;
      }
      const ext = this.getFileExtension(filePath);
      if (ext !== "json") {
        return false;
      }
    }

    // Check content structure
    try {
      const data = JSON.parse(content);

      // Must have "coverage" key
      if (!data.coverage || typeof data.coverage !== "object") {
        return false;
      }

      // Must NOT have Istanbul markers (to differentiate from Istanbul format)
      if (
        content.includes('"statementMap"') ||
        content.includes('"fnMap"') ||
        content.includes('"branchMap"')
      ) {
        return false;
      }

      // Check that values under coverage are file objects with line number keys
      const files = Object.values(data.coverage);
      if (files.length === 0) {
        return true; // Empty coverage is valid
      }

      // Check first file has numeric string keys (line numbers)
      const firstFile = files[0] as Record<string, unknown>;
      if (typeof firstFile !== "object" || firstFile === null) {
        return false;
      }

      const keys = Object.keys(firstFile);
      if (keys.length === 0) {
        return true; // Empty file coverage is valid
      }

      // At least some keys should be numeric (line numbers)
      const hasNumericKeys = keys.some((key) => /^\d+$/.test(key));
      return hasNumericKeys;
    } catch {
      return false;
    }
  }

  /**
   * Parse Codecov JSON content
   */
  async parseContent(content: string): Promise<CoverageResults> {
    let data: CodecovCoverageData;

    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new Error(
        `Invalid Codecov JSON: ${error instanceof Error ? error.message : "parse error"}`
      );
    }

    if (!data.coverage || typeof data.coverage !== "object") {
      throw new Error("Invalid Codecov JSON: missing 'coverage' key");
    }

    const files: FileCoverage[] = [];
    let totalStatements = 0;
    let coveredStatements = 0;
    let totalConditionals = 0;
    let coveredConditionals = 0;

    for (const [filePath, lineCoverage] of Object.entries(data.coverage)) {
      const fileResult = this.parseFileCoverage(filePath, lineCoverage);
      files.push(fileResult);

      totalStatements += fileResult.statements;
      coveredStatements += fileResult.coveredStatements;
      totalConditionals += fileResult.conditionals;
      coveredConditionals += fileResult.coveredConditionals;
    }

    const metrics: CoverageMetrics = {
      statements: totalStatements,
      coveredStatements,
      conditionals: totalConditionals,
      coveredConditionals,
      methods: 0, // Codecov format doesn't track methods
      coveredMethods: 0,
      elements: totalStatements + totalConditionals,
      coveredElements: coveredStatements + coveredConditionals,
      lineRate: this.calculateRate(coveredStatements, totalStatements),
      branchRate: this.calculateRate(coveredConditionals, totalConditionals),
    };

    return {
      timestamp: Date.now(),
      metrics,
      files,
    };
  }

  /**
   * Parse a single file's coverage data
   */
  private parseFileCoverage(
    filePath: string,
    lineCoverage: { [lineNumber: string]: number | string | null }
  ): FileCoverage {
    const fileName = filePath.split("/").pop() || filePath;

    const lines: LineCoverage[] = [];
    const missingLines: number[] = [];
    const partialLines: number[] = [];

    let totalStatements = 0;
    let coveredStatements = 0;
    let totalBranches = 0;
    let coveredBranches = 0;

    for (const [lineNumStr, value] of Object.entries(lineCoverage)) {
      // Skip null values (not executable)
      if (value === null) {
        continue;
      }

      const lineNumber = parseInt(lineNumStr, 10);
      if (Number.isNaN(lineNumber)) {
        continue;
      }

      if (typeof value === "number") {
        // Integer value: hit count
        totalStatements++;
        const hitCount = value;

        lines.push({
          lineNumber,
          count: hitCount,
          type: "stmt",
        });

        if (hitCount > 0) {
          coveredStatements++;
        } else {
          missingLines.push(lineNumber);
        }
      } else if (typeof value === "string") {
        // String value: branch coverage "n/m" format
        const branchMatch = value.match(/^(\d+)\/(\d+)$/);
        if (branchMatch) {
          const covered = parseInt(branchMatch[1], 10);
          const total = parseInt(branchMatch[2], 10);

          totalBranches += total;
          coveredBranches += covered;

          // For branch lines, count as a statement too
          totalStatements++;

          // Line is "covered" if at least one branch is covered
          const hitCount = covered > 0 ? covered : 0;

          lines.push({
            lineNumber,
            count: hitCount,
            type: "cond",
            trueCount: covered,
            falseCount: total - covered,
          });

          if (covered > 0) {
            coveredStatements++;
            // Partial coverage: some but not all branches covered
            if (covered < total) {
              partialLines.push(lineNumber);
            }
          } else {
            missingLines.push(lineNumber);
          }
        }
      }
    }

    // Sort arrays by line number
    lines.sort((a, b) => a.lineNumber - b.lineNumber);
    missingLines.sort((a, b) => a - b);
    partialLines.sort((a, b) => a - b);

    return {
      name: fileName,
      path: filePath,
      statements: totalStatements,
      coveredStatements,
      conditionals: totalBranches,
      coveredConditionals: coveredBranches,
      methods: 0, // Codecov format doesn't track methods
      coveredMethods: 0,
      lineRate: this.calculateRate(coveredStatements, totalStatements),
      branchRate: this.calculateRate(coveredBranches, totalBranches),
      lines,
      missingLines,
      partialLines,
    };
  }
}
