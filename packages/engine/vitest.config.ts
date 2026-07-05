import { defineConfig } from 'vitest/config'

// Coverage reporting for @aop/engine (#51). Not a CI gate yet — thresholds are
// set below the current baseline so the report is informative without being
// a merge blocker. Ratchet these up as combat/reducer coverage improves.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      // index.ts is a re-export barrel; content.ts/types.ts are pure type/interface
      // declarations with no executable statements — all three are noise for coverage %.
      exclude: ['src/index.ts', 'src/content.ts', 'src/types.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 90,
        branches: 75,
      },
    },
  },
})
