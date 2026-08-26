import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    css: true,
    // 16GB 筆電：限制 worker 數防記憶體耗盡（詳 ~/.claude/CLAUDE.md 資源限制）
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
