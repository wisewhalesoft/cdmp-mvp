import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * TC-DEPRECATED grep regression（P2 / 2026-05-17）
 *
 * 確認以下舊 token 已從 apps/api/src/ runtime code 完全移除：
 *   - SalesManagerGuard（被 DirectorOrSectionChiefGuard 取代）
 *   - RequireSalesManager 裝飾器
 *   - e07_role 欄位（舊 business role 欄位）
 *
 * 允許出現：
 *   - .spec.ts / __tests__ 中的歷史描述
 *   - 註解 / 文件字串中的歷史說明（包含「取代 v1.x SalesManagerGuard」等）
 *   - migration 檔（記載歷史變更）
 *   - is_sales_manager 欄位（accounts 模組獨立旗標，未在 E07 範圍移除）
 *
 * 規則：在 *.ts production runtime 檔（排除 __tests__ / migrations）中，
 *   不可有「未註解的 SalesManagerGuard / RequireSalesManager / e07_role 識別字」。
 */
describe('Legacy grep regression (TC-DEPRECATED)', () => {
  const SRC_ROOT = path.resolve(__dirname, '../../../');

  async function walk(dir: string, acc: string[] = []): Promise<string[]> {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name === '__tests__' || item.name === 'migrations' || item.name === 'seeds') continue;
        await walk(full, acc);
      } else if (item.isFile() && item.name.endsWith('.ts') && !item.name.endsWith('.spec.ts')) {
        acc.push(full);
      }
    }
    return acc;
  }

  /**
   * 嚴格匹配：identifier 出現在非註解、非字串字面值位置。
   * 簡化策略：抓所有 token，再用單行去注解的 heuristic（避免 false positive）。
   */
  function findOccurrences(content: string, token: string): string[] {
    const lines = content.split('\n');
    const found: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // 去除行內 // 注解
      const codePart = line.split('//')[0];
      // 抓 identifier 邊界（不要匹配子字串例如「is_sales_manager_flag」）
      const re = new RegExp(`(^|[^A-Za-z0-9_])${token}([^A-Za-z0-9_]|$)`);
      if (re.test(codePart)) {
        found.push(`${i + 1}: ${line.trim()}`);
      }
    }
    return found;
  }

  it('SalesManagerGuard 在 runtime code 中 0 殘留', async () => {
    const files = await walk(SRC_ROOT);
    const offenders: Record<string, string[]> = {};
    for (const f of files) {
      const content = await fs.readFile(f, 'utf-8');
      const hits = findOccurrences(content, 'SalesManagerGuard');
      if (hits.length > 0) offenders[path.relative(SRC_ROOT, f)] = hits;
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual({});
  });

  it('RequireSalesManager 在 runtime code 中 0 殘留', async () => {
    const files = await walk(SRC_ROOT);
    const offenders: Record<string, string[]> = {};
    for (const f of files) {
      const content = await fs.readFile(f, 'utf-8');
      const hits = findOccurrences(content, 'RequireSalesManager');
      if (hits.length > 0) offenders[path.relative(SRC_ROOT, f)] = hits;
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual({});
  });

  it('e07_role 在 runtime code 中 0 殘留（migration / seed / spec 不算）', async () => {
    const files = await walk(SRC_ROOT);
    const offenders: Record<string, string[]> = {};
    for (const f of files) {
      const content = await fs.readFile(f, 'utf-8');
      const hits = findOccurrences(content, 'e07_role');
      if (hits.length > 0) offenders[path.relative(SRC_ROOT, f)] = hits;
    }
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual({});
  });
});
