/**
 * F050 v2.1 重構（AD-E07-18 §18.7 Step 8 / GAP-LIST §I2）：
 *   F068 廢除模組相關 error code 已從 error-codes.ts 移除，且 src/ 下無殘留引用。
 *
 * 對應 test spec：
 *   - TS-F068-DEP-004：error-handling 規格不再含 F068 廢棄錯誤碼（ASSIGNMENT_CODE_*）
 *
 * 註：本專案的 F068 error code 命名為 CODE_TYPE_INVALID / CODE_IN_USE /
 * CODE_NOT_FOUND（非 spec 寫的 ASSIGNMENT_CODE_*）；以下測試以實際命名為準。
 *
 * 涵蓋 cases：
 *   - ERROR_CODES object 不含 CODE_TYPE_INVALID / CODE_IN_USE / CODE_NOT_FOUND 三個 key
 *   - ERROR_MESSAGES object 同上
 *   - src/ 下無檔案（除 error-codes.ts 自身、assignment-code/ 內檔
 *     於 W11 同步刪除）引用三個 code
 *   - C5 拍板：採 fs 靜態掃描而非 CI 外部腳本
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ERROR_CODES, ERROR_MESSAGES } from '../error-codes';

describe('TS-F068-DEP-004：F068 廢除 error code regression guard', () => {
  const F068_DEPRECATED_CODES = ['CODE_TYPE_INVALID', 'CODE_IN_USE', 'CODE_NOT_FOUND'] as const;

  describe('ERROR_CODES / ERROR_MESSAGES object', () => {
    for (const code of F068_DEPRECATED_CODES) {
      it(`ERROR_CODES 不含 ${code} key`, () => {
        expect((ERROR_CODES as Record<string, string>)[code]).toBeUndefined();
      });

      it(`ERROR_MESSAGES 不含 ${code} key`, () => {
        expect((ERROR_MESSAGES as Record<string, string>)[code]).toBeUndefined();
      });
    }
  });

  describe('src/ 全目錄無殘留引用（fs 靜態掃描）', () => {
    /**
     * 遞迴掃描 src/ 下 .ts 檔，排除：
     *   - error-codes.ts 自身（可能於 deprecation 註解保留命名）
     *   - assignment-code/ 模組（W11 同步刪除；本 W9 RED 階段允許殘留）
     *   - __tests__/ 下本 spec 自身
     */
    const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');

    function collectTsFiles(dir: string, acc: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist') continue;
          collectTsFiles(full, acc);
        } else if (e.isFile() && e.name.endsWith('.ts')) {
          acc.push(full);
        }
      }
      return acc;
    }

    function shouldExclude(file: string): boolean {
      const normalized = file.replace(/\\/g, '/');
      if (normalized.endsWith('/common/errors/error-codes.ts')) return true;
      if (normalized.includes('/modules/assignment-code/')) return true;
      if (normalized.endsWith('/error-codes-no-f068.regression.spec.ts')) return true;
      return false;
    }

    for (const code of F068_DEPRECATED_CODES) {
      it(`src/ 下無檔案（排除 error-codes.ts / assignment-code/ / 本 spec 自身）引用 ${code}`, () => {
        const files = collectTsFiles(SRC_ROOT);
        const hits: string[] = [];
        for (const file of files) {
          if (shouldExclude(file)) continue;
          const content = fs.readFileSync(file, 'utf8');
          if (content.includes(code)) {
            hits.push(path.relative(SRC_ROOT, file));
          }
        }
        expect(hits).toEqual([]);
      });
    }
  });
});
