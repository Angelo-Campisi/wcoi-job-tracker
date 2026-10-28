// Database tests: run with `npm run test:db`. They need a throwaway Postgres
// server in TEST_DATABASE_URL (see README), so they are kept apart from `npm test`.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
