import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/__tests__/operations.ts"],
    },
  },
});
