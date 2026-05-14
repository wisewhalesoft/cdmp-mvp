/**
 * TC-GUARD-F070-OPEN-H-001：
 *   F070 dev/prod 環境 SYSTEM_INTERNAL_ERROR regression guard。
 *
 * 根因（Iter 6 確認）：
 *   `ob_levelcard_version.created_by` / `updated_by` / `created_by_prog` / `updated_by_prog`
 *   length=20，但 service 寫入 user.id（UUID 36 char），PostgreSQL 強制 length 拋
 *   "value too long for type character varying(20)" → transaction fail → 500。
 *   SQLite 不強制 length 故 e2e 從未抓到。
 *
 * Iter 6 修補：
 *   - migration 1711360000164：ALTER ob_levelcard_version 4 個欄位至 VARCHAR(50)
 *   - entity：length 同步改 50
 *
 * Guard 策略（兩層）：
 *   1. Entity metadata 驗證：read entity column metadata，確認 4 個欄位 length >= 36（UUID）
 *   2. Migration 內容驗證：read migration source 確認 4 條 ALTER 都有
 *
 * 此 guard 純檔案 read + reflect，不依賴 DB connection，可在任何環境跑。
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ObLevelcardVersion } from '@/database/entities/ob-levelcard-version.entity';
import 'reflect-metadata';

describe('TC-GUARD-F070-OPEN-H-001：ob_levelcard_version created_by length 守護', () => {
  it('Entity 4 個 created_by/updated_by 欄位 length 必須 >= 36（容納 UUID）', () => {
    // 用 TypeORM metadata reflection 拿 entity column 設定
    // 因為 column metadata 在 DataSource init 才完整建立，這裡直接讀 entity class 的 reflect data
    const fields = [
      'created_by_prog',
      'created_by',
      'updated_by_prog',
      'updated_by',
    ];
    // 用 Object.getOwnPropertyDescriptors 拿 design metadata 不切實際；
    // 改採 file-level 字串 regex 確認 entity source 已正確
    const entityPath = path.resolve(
      __dirname,
      '../../entities/ob-levelcard-version.entity.ts',
    );
    const source = fs.readFileSync(entityPath, 'utf-8');
    for (const field of fields) {
      // 比對 `@Column({ name: 'created_by', type: 'varchar', length: N, ...})`
      const re = new RegExp(
        `name:\\s*'${field}'[^}]*length:\\s*(\\d+)`,
        'i',
      );
      const match = source.match(re);
      expect(match, `Entity 必須宣告 ${field} 欄位的 length`).toBeTruthy();
      const length = parseInt(match![1], 10);
      expect(
        length,
        `${field} length 必須 >= 36 以容納 user.id UUID（OPEN-H bug 守護）`,
      ).toBeGreaterThanOrEqual(36);
    }
    // 抑制 unused
    void ObLevelcardVersion;
  });

  it('Migration 1711360000164 必須 ALTER 4 個欄位至 VARCHAR(50)', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../1711360000164-ExtendObLevelcardVersionCreatedByVarchar50.ts',
    );
    expect(
      fs.existsSync(migrationPath),
      'OPEN-H migration 1711360000164 必須存在',
    ).toBe(true);
    const source = fs.readFileSync(migrationPath, 'utf-8');

    const fields = [
      'created_by_prog',
      'created_by',
      'updated_by_prog',
      'updated_by',
    ];
    for (const field of fields) {
      // 確認 up() 內含 ALTER ... TYPE VARCHAR(50)
      const re = new RegExp(
        `ALTER TABLE\\s+ob_levelcard_version\\s+ALTER COLUMN\\s+${field}\\s+TYPE\\s+VARCHAR\\(50\\)`,
        'i',
      );
      expect(
        re.test(source),
        `Migration 1711360000164 up() 必須含「ALTER TABLE ob_levelcard_version ALTER COLUMN ${field} TYPE VARCHAR(50)」`,
      ).toBe(true);
    }
  });

  it('Service createCardType 確認寫入 actor.userId 至 ob_levelcard_version.created_by（不可截斷）', () => {
    // file-level regex 驗證 service 直接寫 actor.userId 而非截斷
    const servicePath = path.resolve(
      __dirname,
      '../../../modules/assignment-scoring/services/card-type.service.ts',
    );
    const source = fs.readFileSync(servicePath, 'utf-8');
    // 必須含 `created_by: actor.userId`（service 透傳 UUID）
    expect(
      /created_by:\s*actor\.userId/.test(source),
      'Service 必須直接寫入 actor.userId（UUID），不可截斷或改成 \'system\'',
    ).toBe(true);
    // 不應出現 `created_by: 'system'` 或 actor.userId.slice(0, 20)
    expect(
      /actor\.userId\.slice\(/.test(source),
      'Service 不應截斷 UUID 至 20 字元（這是 anti-pattern；應 ALTER schema）',
    ).toBe(false);
  });
});
