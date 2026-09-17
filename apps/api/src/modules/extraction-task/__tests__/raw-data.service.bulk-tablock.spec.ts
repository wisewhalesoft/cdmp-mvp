/**
 * openBulkWriter 之 TABLOCK（最小化記錄）契約測試（CI 恆常執行，免真實連線）。
 *
 * 背景：正式環境 CDMP_log 為 20GB 且 max_size == size（無成長空間）。未持整表鎖的
 * bulk load 在 SIMPLE recovery 下仍是完整記錄，819 萬列寬表（欄位多為 NVARCHAR(MAX)）
 * 的擷取會墊高 log 水位數 GB。
 *
 * 🔴 這個修正的失敗模式是**靜默的**：tedious 對未知的 bulk 選項不報錯、直接忽略，
 * 所以選項名打錯（`tableLock` vs 正確的 `lockTable`）或套件升級改名後，程式看起來
 * 有加 TABLOCK、實際上仍完整記錄，且沒有任何錯誤訊息、沒有任何測試會紅。
 *
 * 故以兩支測試把「呼叫端 → 相依端」整條鏈釘住：
 *   BULKOPT-001 呼叫端確實把 { lockTable: true } 傳進 bulk()
 *   BULKOPT-002 tedious 確實把該鍵轉成 WITH (TABLOCK)
 *
 * 手法為靜態原始碼斷言（沿用本模組 STATIC-003 之慣例）：`openBulkWriter` 以
 * `require('mssql')` 於執行期載入，`vi.mock` 攔不到 CJS require，注入用的 seam 又
 * 不值得為測試而加進正式碼。實際可用性由真庫的 BATCH-001/002（raw-data.service.mssql.spec.ts，
 * 對真實 SQL Server 逐批執行 bulk）覆蓋。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.resolve(__dirname, '../raw-data.service.ts'), 'utf8');

/** `openBulkWriter` 方法本體（終點為其後第一個 private helper 宣告，同 STATIC-003）。 */
function openBulkWriterBody(): string {
  const start = SRC.indexOf('async openBulkWriter(');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('private buildMssqlConnectionConfig(', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('openBulkWriter — TABLOCK 最小化記錄', () => {
  it('BULKOPT-001：bulk 選項常數為 { lockTable: true } 且確實傳入每次 bulk 呼叫', () => {
    // 常數宣告存在且值正確
    expect(SRC.replace(/\s+/g, ' ')).toContain(
      'private static readonly BULK_OPTIONS = { lockTable: true } as const;',
    );

    const body = openBulkWriterBody();
    // 唯一的 bulk() 呼叫帶入該常數（不得有裸 bulk(table) 漏網）
    const bulkCalls = body.match(/\.bulk\([^)]*\)/g) ?? [];
    expect(bulkCalls.length).toBe(1);
    expect(bulkCalls[0]).toBe('.bulk(table, BULK_OPTIONS)');
  });

  it('BULKOPT-001b：tableLock 不得被當成鍵或屬性使用（tedious 的鍵是 lockTable，誤植會靜默失效）', () => {
    // 只禁實際用法；註解裡為了說明而提到這個錯誤名稱是刻意的，不該被誤判。
    expect(SRC).not.toMatch(/tableLock\s*[:=]/);
    expect(SRC).not.toMatch(/\.tableLock/);
  });

  it('BULKOPT-002（相依契約）：tedious 確實把 bulkOptions.lockTable 轉成 WITH (TABLOCK)', () => {
    // 釘住相依端。tedious 升級若把選項改名，本測試會紅——否則 TABLOCK 會無聲消失，
    // 沒有執行期錯誤，只有 log 用量悄悄回到完整記錄。
    const tedious = fs.readFileSync(require.resolve('tedious/lib/bulk-load.js'), 'utf8');
    const normalized = tedious.replace(/\s+/g, ' ');
    expect(normalized).toMatch(
      /if \(this\.bulkOptions\.lockTable\) \{ addOptions\.push\('TABLOCK'\)/,
    );
    // TABLOCK 必須是 addOptions 之一，且 addOptions 會被組成 ` WITH (...)` 附加於 insert bulk
    expect(normalized).toMatch(/return ` WITH \(\$\{addOptions\.join\(','\)\}\)`/);
  });
});
