import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    // 16GB 筆電：e2e 較重，worker 上限 2（詳 ~/.claude/CLAUDE.md 資源限制）
    poolOptions: { threads: { maxThreads: 2 }, forks: { maxForks: 2 } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
});
