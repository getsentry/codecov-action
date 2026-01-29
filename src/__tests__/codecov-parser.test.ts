import { describe, expect, it } from "vitest";
import { CodecovParser } from "../parsers/codecov-parser.js";

describe("CodecovParser", () => {
  const sampleCodecovJSON = JSON.stringify({
    coverage: {
      "src/main.rs": {
        "1": 5, // line 1 hit 5 times
        "2": 1, // line 2 hit once
        "3": 0, // line 3 missed
        "5": null, // line 5 skipped (not executable)
        "6": 10, // line 6 hit 10 times
      },
      "src/lib.rs": {
        "1": 3,
        "2": 3,
        "3": 0,
      },
    },
  });

  const branchCoverageJSON = JSON.stringify({
    coverage: {
      "src/branch.rs": {
        "1": 5, // regular line
        "2": "2/3", // partial branch coverage (2 of 3 branches covered)
        "3": "0/2", // no branches covered (0 of 2)
        "4": "2/2", // all branches covered
      },
    },
  });

  it("should parse Codecov JSON correctly", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(sampleCodecovJSON);

    expect(result.files).toHaveLength(2);
  });

  it("should calculate correct coverage metrics", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(sampleCodecovJSON);

    // src/main.rs: 4 statements (1,2,3,6 - line 5 is null/skipped), 3 covered (1,2,6)
    // src/lib.rs: 3 statements, 2 covered (1,2)
    // Total: 7 statements, 5 covered
    expect(result.metrics.statements).toBe(7);
    expect(result.metrics.coveredStatements).toBe(5);

    // No branches in this sample
    expect(result.metrics.conditionals).toBe(0);
    expect(result.metrics.coveredConditionals).toBe(0);

    // Codecov format doesn't track methods
    expect(result.metrics.methods).toBe(0);
    expect(result.metrics.coveredMethods).toBe(0);
  });

  it("should parse file coverage correctly", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(sampleCodecovJSON);

    const mainFile = result.files.find((f) => f.path === "src/main.rs");
    expect(mainFile).toBeDefined();
    expect(mainFile!.name).toBe("main.rs");
    expect(mainFile!.statements).toBe(4); // Lines 1,2,3,6 (5 is null)
    expect(mainFile!.coveredStatements).toBe(3); // Lines 1,2,6
    expect(mainFile!.lineRate).toBe(75);

    const libFile = result.files.find((f) => f.path === "src/lib.rs");
    expect(libFile).toBeDefined();
    expect(libFile!.statements).toBe(3);
    expect(libFile!.coveredStatements).toBe(2);
    expect(libFile!.lineRate).toBe(66.67);
  });

  it("should parse line coverage correctly", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(sampleCodecovJSON);

    const mainFile = result.files.find((f) => f.path === "src/main.rs");

    // Line 1 should be covered with 5 hits
    const line1 = mainFile!.lines.find((l) => l.lineNumber === 1);
    expect(line1?.count).toBe(5);
    expect(line1?.type).toBe("stmt");

    // Line 3 should be missed (0 hits)
    const line3 = mainFile!.lines.find((l) => l.lineNumber === 3);
    expect(line3?.count).toBe(0);

    // Line 5 should not exist (null = skipped)
    const line5 = mainFile!.lines.find((l) => l.lineNumber === 5);
    expect(line5).toBeUndefined();

    // Line 6 should be covered with 10 hits
    const line6 = mainFile!.lines.find((l) => l.lineNumber === 6);
    expect(line6?.count).toBe(10);
  });

  it("should track missing lines", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(sampleCodecovJSON);

    const mainFile = result.files.find((f) => f.path === "src/main.rs");
    expect(mainFile!.missingLines).toEqual([3]); // Only line 3 is missed

    const libFile = result.files.find((f) => f.path === "src/lib.rs");
    expect(libFile!.missingLines).toEqual([3]);
  });

  it("should parse branch coverage strings correctly", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(branchCoverageJSON);

    const branchFile = result.files.find((f) => f.path === "src/branch.rs");
    expect(branchFile).toBeDefined();

    // Total branches: 3 + 2 + 2 = 7
    expect(branchFile!.conditionals).toBe(7);
    // Covered branches: 2 + 0 + 2 = 4
    expect(branchFile!.coveredConditionals).toBe(4);

    // Total statements: 4 (all lines count as statements)
    expect(branchFile!.statements).toBe(4);
    // Covered statements: 3 (lines 1, 2, 4 are covered; line 3 has 0 branches covered)
    expect(branchFile!.coveredStatements).toBe(3);
  });

  it("should detect partial coverage in branch lines", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(branchCoverageJSON);

    const branchFile = result.files.find((f) => f.path === "src/branch.rs");

    // Line 2 has partial coverage (2/3)
    expect(branchFile!.partialLines).toContain(2);

    // Line 3 is not partial, it's missing (0/2)
    expect(branchFile!.partialLines).not.toContain(3);

    // Line 4 is fully covered (2/2), not partial
    expect(branchFile!.partialLines).not.toContain(4);
  });

  it("should mark branch lines as conditionals", async () => {
    const parser = new CodecovParser();
    const result = await parser.parseContent(branchCoverageJSON);

    const branchFile = result.files.find((f) => f.path === "src/branch.rs");

    const line2 = branchFile!.lines.find((l) => l.lineNumber === 2);
    expect(line2?.type).toBe("cond");
    expect(line2?.trueCount).toBe(2);
    expect(line2?.falseCount).toBe(1);

    const line1 = branchFile!.lines.find((l) => l.lineNumber === 1);
    expect(line1?.type).toBe("stmt");
  });

  it("should detect Codecov format correctly", () => {
    const parser = new CodecovParser();

    expect(parser.canParse(sampleCodecovJSON)).toBe(true);
    expect(parser.canParse(sampleCodecovJSON, "codecov.json")).toBe(true);
    expect(parser.canParse(sampleCodecovJSON, "coverage/codecov.json")).toBe(
      true
    );

    // Should not match non-Codecov JSON
    expect(parser.canParse('{"foo": "bar"}', "data.json")).toBe(false);

    // Should not match Istanbul format
    const istanbulJSON = JSON.stringify({
      "/path/file.ts": {
        path: "/path/file.ts",
        statementMap: {},
        fnMap: {},
        branchMap: {},
        s: {},
        f: {},
        b: {},
      },
    });
    expect(parser.canParse(istanbulJSON, "coverage.json")).toBe(false);
  });

  it("should reject non-JSON files by extension", () => {
    const parser = new CodecovParser();

    expect(parser.canParse("<coverage></coverage>", "coverage.xml")).toBe(
      false
    );
    expect(parser.canParse("SF:/path\nDA:1,5\nend_of_record", "lcov.info")).toBe(
      false
    );
  });

  it("should handle empty coverage", async () => {
    const emptyJSON = JSON.stringify({
      coverage: {},
    });

    const parser = new CodecovParser();
    const result = await parser.parseContent(emptyJSON);

    expect(result.files).toHaveLength(0);
    expect(result.metrics.statements).toBe(0);
    expect(result.metrics.coveredStatements).toBe(0);
    expect(result.metrics.lineRate).toBe(0);
  });

  it("should handle file with no covered lines", async () => {
    const noCoverageJSON = JSON.stringify({
      coverage: {
        "src/uncovered.rs": {
          "1": 0,
          "2": 0,
          "3": 0,
        },
      },
    });

    const parser = new CodecovParser();
    const result = await parser.parseContent(noCoverageJSON);

    expect(result.metrics.statements).toBe(3);
    expect(result.metrics.coveredStatements).toBe(0);
    expect(result.metrics.lineRate).toBe(0);
    expect(result.files[0].missingLines).toEqual([1, 2, 3]);
  });

  it("should handle file with all lines covered", async () => {
    const fullCoverageJSON = JSON.stringify({
      coverage: {
        "src/covered.rs": {
          "1": 5,
          "2": 3,
          "3": 1,
        },
      },
    });

    const parser = new CodecovParser();
    const result = await parser.parseContent(fullCoverageJSON);

    expect(result.metrics.statements).toBe(3);
    expect(result.metrics.coveredStatements).toBe(3);
    expect(result.metrics.lineRate).toBe(100);
    expect(result.files[0].missingLines).toEqual([]);
  });

  it("should throw on invalid JSON", async () => {
    const parser = new CodecovParser();

    await expect(parser.parseContent("not json")).rejects.toThrow(
      "Invalid Codecov JSON"
    );
  });

  it("should throw when coverage key is missing", async () => {
    const parser = new CodecovParser();

    await expect(parser.parseContent('{"files": {}}')).rejects.toThrow(
      "Invalid Codecov JSON: missing 'coverage' key"
    );
  });

  it("should have correct format property", () => {
    const parser = new CodecovParser();
    expect(parser.format).toBe("codecov");
  });

  it("should handle mixed integer and branch values in same file", async () => {
    const mixedJSON = JSON.stringify({
      coverage: {
        "src/mixed.rs": {
          "1": 5, // integer
          "2": "1/2", // branch
          "3": 0, // missed integer
          "4": "0/3", // missed branch
          "5": null, // skipped
          "6": "3/3", // fully covered branch
        },
      },
    });

    const parser = new CodecovParser();
    const result = await parser.parseContent(mixedJSON);

    const file = result.files[0];

    // 5 executable lines (line 5 is null)
    expect(file.statements).toBe(5);

    // Covered: lines 1, 2 (has coverage), 6 (all branches)
    expect(file.coveredStatements).toBe(3);

    // Total branches: 2 + 3 + 3 = 8
    expect(file.conditionals).toBe(8);

    // Covered branches: 1 + 0 + 3 = 4
    expect(file.coveredConditionals).toBe(4);

    // Missing lines: 3, 4 (0 hits)
    expect(file.missingLines).toEqual([3, 4]);

    // Partial lines: only line 2 (1/2)
    expect(file.partialLines).toEqual([2]);
  });

  it("should detect codecov.json by filename regardless of content structure", () => {
    const parser = new CodecovParser();

    // Even with minimal valid JSON, codecov.json filename should be detected
    expect(parser.canParse('{"coverage": {}}', "codecov.json")).toBe(true);
    expect(parser.canParse('{"coverage": {}}', "/path/to/codecov.json")).toBe(
      true
    );
  });
});
