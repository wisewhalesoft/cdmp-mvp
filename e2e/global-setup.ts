import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

/**
 * 建立兩份角色 storageState（admin / user），供 tests/ 內各 spec 依 Playwright
 * project（見 playwright.config.ts）切換。
 *
 * 為何用「真實瀏覽器 UI 登入」而非直接呼叫登入 API 取回 token 塞入 storageState：
 * 前端登入成功後將 token 寫入的儲存位置（localStorage key 等）屬於前端實作細節，
 * test-generator 依 blind-to-impl 原則不讀取前端原始碼決定該 key 名稱；改為驅動
 * 真實瀏覽器完整跑一次登入流程（依 prototypes/01-login.html 之欄位 label／
 * error-handling.md 之 API 契約），無論前端內部如何儲存 token，Playwright 的
 * `context.storageState()` 皆會忠實截取當下瀏覽器狀態（含 localStorage），
 * 同時此舉也順帶對登入頁本身跑一次真實整合驗證。
 *
 * 帳號來源：apps/api/src/database/seeds/seed.ts（dev bootstrap 種子，非機敏真實員工資料）。
 *   admin@cdmp.test — role=admin（依 F079 BR-7「admin OR business_role=director」，
 *                     admin 帳號涵蓋本 ring 內所有「部長可寫」情境，見 risks-and-gaps.md R-F117-01）
 *   user@cdmp.test  — role=user, business_role=null（完全無 E07 權限，供角色阻擋類斷言使用）
 *
 * 已知缺口：dev seed 未提供 business_role='director' / 'section_chief' 之測試帳號，
 * 故本 ring 不含這兩種角色之真實登入 storageState。詳見 risks-and-gaps.md R-F117-01
 * （已有替代覆蓋：admin 涵蓋 director 情境；section_chief 唯讀畫面由前端 Component
 * 測試覆蓋、403 攔截由後端 Integration 測試覆蓋，皆不依賴此檔）。
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const LOGIN_PATH = process.env.E2E_LOGIN_PATH ?? '/login';

interface Persona {
  storageFile: string;
  email: string;
  password: string;
}

const PERSONAS: Persona[] = [
  {
    storageFile: 'storage/auth-admin.json',
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@cdmp.test',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'P@ssw0rd123',
  },
  {
    storageFile: 'storage/auth-user.json',
    email: process.env.E2E_USER_EMAIL ?? 'user@cdmp.test',
    password: process.env.E2E_USER_PASSWORD ?? 'P@ssw0rd123',
  },
];

export default async function globalSetup(): Promise<void> {
  mkdirSync('storage', { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const persona of PERSONAS) {
      const context = await browser.newContext({ baseURL: BASE_URL });
      const page = await context.newPage();
      await page.goto(LOGIN_PATH);

      // 欄位 label 依 prototypes/01-login.html：「Email / 員工編號」+「密碼」+「登入」鈕
      await page.getByLabel(/Email\s*\/\s*員工編號/).fill(persona.email);
      await page.getByLabel('密碼', { exact: true }).fill(persona.password);
      await page.getByRole('button', { name: '登入' }).click();

      // 成功登入後應離開登入頁（F002 BR-Redirect：依角色導向不同首頁，故不斷言特定路徑，
      // 只斷言「已離開登入頁」）
      await page.waitForURL((url) => !url.pathname.includes(LOGIN_PATH), { timeout: 15000 });

      await context.storageState({ path: persona.storageFile });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
