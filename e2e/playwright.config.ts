import { defineConfig, devices } from '@playwright/test';

/**
 * CDMP 驗收/fidelity ring — Playwright 設定。
 * 由 test-generator（ring-setup）建立，見 README.md 之「本 ring 的角色與範圍」。
 *
 * baseURL 指向前端 dev server（vite，預設 :5173；docker cdmp-web 對外預設 :5174，
 * 依部署方式覆寫 E2E_BASE_URL）。前端本身透過 vite proxy 將 /api/* 轉發至後端，
 * 故對 /api/** 的請求（含 global-setup 之登入、以及各測試之 page.route 攔截目標）
 * 皆走同一 origin，不需另外設定 CORS。
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // 16GB 筆電：限制平行 workers（詳 ~/.claude/CLAUDE.md 資源限制）
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'], storageState: 'storage/auth-admin.json' },
    },
    {
      name: 'user',
      use: { ...devices['Desktop Chrome'], storageState: 'storage/auth-user.json' },
    },
  ],
});
