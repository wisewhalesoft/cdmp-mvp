import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    // 16GB 筆電：限制 worker 數防記憶體耗盡（詳 ~/.claude/CLAUDE.md 資源限制）
    poolOptions: { threads: { maxThreads: 4 }, forks: { maxForks: 4 } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
});
