import { describe, expect, it } from "vitest";
import { add } from "./operations";

describe("Basic operations", () => {
  it("should add two numbers", () => {
    expect(add(1, 2)).toBe(3);
  });
});
