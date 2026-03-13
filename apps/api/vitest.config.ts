import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
});
