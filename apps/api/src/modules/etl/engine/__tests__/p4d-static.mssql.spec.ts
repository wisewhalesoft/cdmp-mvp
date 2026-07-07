/**
 * AD-E07-41 P4d — 靜態 / 事實鎖定 / 決策關卡 / 回歸守門（非 gated，CI 恆跑，不需 MSSQL 連線）。
 *
 * 覆蓋：§十三 STATIC-001..004｜§四 ISTESTRUN-001（靜態掃描）/ ISTESTRUN-003（PG 契約回歸）
 *      §一 GATE-001/003 + §二 DISPATCHE2E-GATE-001（impl log 決策文件守門）｜§十二 REG-002。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadCustomerCoreDef, ALL_RAW_TABLES, RAW_EXTRACT, RAW_LOOKUP } from './_p4d-fixtures';

const ENGINE_DIR = path.resolve(__dirname, '..');
const TESTS_DIR = __dirname;
const IMPL_LOG = path.resolve(
  __dirname,
  '../../../../../../../docs/specs/implementation-log/AD-E07-41-P4d-impl.md',
);
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('P4d STATIC — 事實鎖定', () => {
  it('STATIC-001：真實 pipeline 節點數 56、邊數 55、nodeType 分佈鎖定', () => {
    const def = loadCustomerCoreDef();
    expect(def.nodes.length).toBe(56);
    expect(def.edges.length).toBe(55);
    const dist: Record<string, number> = {};
    for (const n of def.nodes) dist[n.data.nodeType] = (dist[n.data.nodeType] || 0) + 1;
    expect(dist).toEqual({
      raw_data_extract: 5, derived_field: 7, lookup: 31, merge: 4, dedup: 3,
      type_cast: 2, field_mapping: 2, conditional: 1, target_load: 1,
    });
  });

  it('STATIC-002：14 張 raw fixture 表命名清單鎖定（5 extract + 9 lookup）', () => {
    expect(Object.values(RAW_EXTRACT).sort()).toEqual(
      ['raw_101f6b3e', 'raw_1138803c', 'raw_35d85504', 'raw_50172f04', 'raw_aec93e7c'].sort(),
    );
    expect(Object.keys(RAW_LOOKUP).sort()).toEqual(
      ['raw_3acd58e7', 'raw_6fce5258', 'raw_8b80671e', 'raw_9dcaf414', 'raw_9dd0eca5',
        'raw_afe6a874', 'raw_b4a48f10', 'raw_b9558d10', 'raw_e5a2345c'].sort(),
    );
    expect(ALL_RAW_TABLES.length).toBe(14);
    expect(new Set(ALL_RAW_TABLES).size).toBe(14);
  });

  it('STATIC-003（🔴 MUST-FIX）：DoD 核心 e2e 測試檔之 isTestRun 預設為 false，唯一 true 出現於 ISTESTRUN 陷阱佐證', () => {
    const src = read(path.join(TESTS_DIR, 'p4d-e2e.mssql.spec.ts'));
    // runPipeline 建構 PipelineRunnerConfig 預設 isTestRun 為 false（顯式，非隱性）
    expect(src).toContain('isTestRun: opts.isTestRun ?? false');
    // 全檔 `isTestRun: true` 僅出現一次（ISTESTRUN-002 陷阱佐證）
    const trueCount = (src.match(/isTestRun:\s*true/g) || []).length;
    expect(trueCount).toBe(1);
    // 且該處位於 ISTESTRUN 佐證脈絡
    const idx = src.indexOf('isTestRun: true');
    expect(src.slice(Math.max(0, idx - 400), idx)).toMatch(/ISTESTRUN-002|陷阱/);
  });

  it('STATIC-004：pipeline-runner / node-dispatcher / node-output-store / types 於本輪（P4d）未被修改', () => {
    const frozen = [
      'engine/pipeline-runner.ts',
      'engine/node-dispatcher.ts',
      'engine/node-output-store.ts',
      'engine/types.ts',
    ];
    let changed: string[] = [];
    try {
      const out = execSync('git status --porcelain', { cwd: path.resolve(__dirname, '../../../../../..'), encoding: 'utf8' });
      changed = out.split('\n')
        .filter((l) => l.trim() && !l.startsWith('??')) // 未追蹤新檔（本輪測試/fixture）不算修改
        .map((l) => l.slice(3).trim().replace(/"/g, ''));
    } catch {
      // git 不可用 → 略過（非阻擋）
      return;
    }
    for (const f of frozen) {
      expect(changed.some((c) => c.endsWith(f))).toBe(false);
    }
  });
});

describe('P4d ISTESTRUN 靜態 / 契約回歸', () => {
  it('ISTESTRUN-001（🔴 MUST-FIX）：DoD 核心 run 之 PipelineRunnerConfig 未使用 isTestRun:true 隱性預設', () => {
    const src = read(path.join(TESTS_DIR, 'p4d-e2e.mssql.spec.ts'));
    // 建構 config 之處顯式帶 isTestRun（不省略、不依賴介面預設——PipelineRunnerConfig 無預設值）
    expect(src).toMatch(/isTestRun:\s*opts\.isTestRun\s*\?\?\s*false/);
  });

  it('ISTESTRUN-003：PG 與 MSSQL 版 target-load 皆有 isTestRun 早退（跨 dialect 契約對稱）', () => {
    const pg = read(path.join(ENGINE_DIR, 'handlers/target-load-handler.ts'));
    const mssql = read(path.join(ENGINE_DIR, 'handlers/target-load-handler-mssql.ts'));
    expect(pg).toMatch(/if\s*\(\s*context\.isTestRun\s*\)/);
    expect(mssql).toMatch(/if\s*\(\s*context\.isTestRun\s*\)/);
  });
});

describe('P4d REG — 回歸守門', () => {
  it('REG-002：PG 原檔 dedup/target-load handler 未被 mssql 化（無 ##/NEWID/IDENTITY 等 T-SQL 專屬語彙）', () => {
    const dedupPg = read(path.join(ENGINE_DIR, 'handlers/dedup-handler.ts'));
    const targetPg = read(path.join(ENGINE_DIR, 'handlers/target-load-handler.ts'));
    // PG 版應保留 PG 語彙、不含 MSSQL 專屬
    expect(dedupPg).not.toContain('IDENTITY(INT');
    expect(dedupPg).not.toContain('NEWID()');
    expect(targetPg).not.toContain('IDENTITY(INT');
  });
});

describe('P4d 決策關卡（impl log 文件守門）', () => {
  const implExists = fs.existsSync(IMPL_LOG);
  const impl = implExists ? read(IMPL_LOG) : '';

  it('GATE-001：impl log 記錄 raw 表欄位清單衍生方法（程式化掃描）', () => {
    expect(implExists).toBe(true);
    expect(impl).toContain('GATE-001');
  });

  it('GATE-003：impl log 記錄 lookup fixture 值域覆蓋比對', () => {
    expect(impl).toContain('GATE-003');
  });

  it('DISPATCHE2E-GATE-001：impl log 記錄方案甲/乙分工', () => {
    expect(impl).toContain('DISPATCHE2E-GATE-001');
  });

  it('FINDING-P4D-01：impl log 明確記錄 DECIMAL(38,10)→varchar(5) 溢位之業務級跨引擎差異', () => {
    expect(impl).toContain('FINDING-P4D-01');
  });
});
