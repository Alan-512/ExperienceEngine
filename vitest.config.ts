import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 4,
    include: ["tests/**/*.test.ts"],
    exclude: ["**/.worktrees/**", "**/dist/**", "**/node_modules/**"]
  }
});
