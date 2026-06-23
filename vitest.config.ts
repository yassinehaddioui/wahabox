import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: [
      'lib/__tests__/**/*.test.{ts,tsx}',
      'app/api/**/*.test.{ts,tsx}',
      'components/**/*.test.{ts,tsx}',
      'app/**/*.test.{ts,tsx}',
      'test/helpers/**/*.test.{ts,tsx}',
    ],
    globals: true,
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**', 'app/api/**', 'components/**'],
      exclude: [
        '**/components/ui/{badge,button,card,dialog,dropdown-menu,input,label,select,separator,sheet,sidebar,skeleton,sonner,switch,table,textarea,tooltip}.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 65,
        statements: 75,
      },
    },
  },
})
