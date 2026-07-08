/**
 * P5g — 靜態事實鎖定 + 影響面盤點 + 決策關卡文件守門（CI 恆跑，不需 DB）。
 *
 * 覆蓋：
 *   §八 IMPACT-001（6 條 target_load）/ IMPACT-002 / IMPACT-004（範圍界定）
 *   §十 STATIC-001（兩 handler 皆含交易 API）/ STATIC-002（pipeline-runner/node-dispatcher handler-only 未改）
 *       / STATIC-003（兩引擎交易站點對稱）/ STATIC-004（其餘 8×2 handler 未擴大修改）
 *   §一 GATE-002（不得 READ UNCOMMITTED）
 *   §十一 REG-003（dispatcher 分流不變）
 *   決策關卡文件守門：GATE-001/003/004、UPSERTATOMIC-003、SCOPE-005、IMPACT-003（impl log 必含對應段落）
 *
 * 全部純 fs/JSON 讀取；不 gate、CI 每 lane 恆跑。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HERE = __dirname;
const HANDLERS = path.resolve(HERE, '../handlers');
const PIPELINE_JSON = path.resolve(HERE, '../../../../database/seeds/data/etl-pipelines.json');
const IMPL_LOG = path.resolve(HERE, '../../../../../../../docs/specs/implementation-log/AD-E07-43-P5g-impl.md');

function read(rel: string): string {
  return fs.readFileSync(path.resolve(HANDLERS, rel), 'utf8');
}
function readImplLog(): string {
  return fs.existsSync(IMPL_LOG) ? fs.readFileSync(IMPL_LOG, 'utf8') : '';
}
function count(src: string, re: RegExp): number {
  return (src.match(re) ?? []).length;
}

const PG_HANDLER = 'target-load-handler.ts';
const MSSQL_HANDLER = 'target-load-handler-mssql.ts';
/** 8 個非 target_load handler（PG + MSSQL 各一組）。 */
const OTHER_HANDLERS_PG = [
  'extract-handler.ts', 'field-mapping-handler.ts', 'conditional-handler.ts', 'derived-field-handler.ts',
  'type-cast-handler.ts', 'merge-handler.ts', 'dedup-handler.ts', 'lookup-handler.ts',
];
const OTHER_HANDLERS_MSSQL = OTHER_HANDLERS_PG.map((f) => f.replace('.ts', '-mssql.ts'));

// ===========================================================================
// §八 IMPACT
// ===========================================================================
describe('P5g IMPACT — 影響面盤點', () => {
  it('IMPACT-001（MUST-FIX）：etl-pipelines.json 恰 6 個 target_load 節點（5 P5b + customer_core）', () => {
    const arr = JSON.parse(fs.readFileSync(PIPELINE_JSON, 'utf8'));
    const targets: string[] = [];
    for (const p of arr) {
      for (const n of p.definition?.nodes ?? []) {
        if (n.data?.nodeType === 'target_load') targets.push(n.data.targetTable);
      }
    }
    expect(targets.length).toBe(6);
    expect(new Set(targets)).toEqual(
      new Set(['ob_arreturndf_min_cap', 'ob_calendar', 'ob_emphire', 'ob_pool_data', 'ob_pool_data_list', 'customer_core']),
    );
  });

  it('IMPACT-002：核心異動點＝兩 target-load handler；pipeline-runner 依 GATE-001（handler-only）不改', () => {
    expect(read(PG_HANDLER)).toMatch(/startTransaction/);
    expect(read(MSSQL_HANDLER)).toMatch(/startTransaction/);
    const runner = fs.readFileSync(path.resolve(HERE, '../pipeline-runner.ts'), 'utf8');
    expect(runner).not.toMatch(/startTransaction|commitTransaction|rollbackTransaction/);
  });

  it('IMPACT-004：node-dispatcher.ts 不涉交易生命週期（僅 handler 註冊/查找）', () => {
    const disp = fs.readFileSync(path.resolve(HERE, '../node-dispatcher.ts'), 'utf8');
    expect(disp).not.toMatch(/startTransaction|commitTransaction|rollbackTransaction/);
  });
});

// ===========================================================================
// §十 STATIC — 事實鎖定
// ===========================================================================
describe('P5g STATIC — 交易 API 落地與範圍界定', () => {
  it('STATIC-001（MUST-FIX）：兩 target-load handler 皆含 start/commit/rollbackTransaction（解凍落地）', () => {
    for (const f of [PG_HANDLER, MSSQL_HANDLER]) {
      const src = read(f);
      expect(src).toMatch(/startTransaction/);
      expect(src).toMatch(/commitTransaction/);
      expect(src).toMatch(/rollbackTransaction/);
    }
  });

  it('STATIC-002：pipeline-runner / node-dispatcher 保持無交易 API（GATE-001 handler-only 決策落地）', () => {
    for (const rel of ['../pipeline-runner.ts', '../node-dispatcher.ts']) {
      const src = fs.readFileSync(path.resolve(HERE, rel), 'utf8');
      expect(src).not.toMatch(/startTransaction|commitTransaction|rollbackTransaction/);
    }
  });

  it('STATIC-003（兩引擎對稱）：PG/MSSQL handler 交易站點數量對稱（各 3：partition + fullMode + upsert）', () => {
    const pg = read(PG_HANDLER);
    const ms = read(MSSQL_HANDLER);
    const pgStart = count(pg, /startTransaction/g);
    const msStart = count(ms, /startTransaction/g);
    expect(pgStart).toBe(3);
    expect(msStart).toBe(3);
    expect(pgStart).toBe(msStart); // 對稱
    expect(count(pg, /commitTransaction/g)).toBe(3);
    expect(count(ms, /commitTransaction/g)).toBe(3);
    expect(count(pg, /rollbackTransaction/g)).toBe(3);
    expect(count(ms, /rollbackTransaction/g)).toBe(3);
  });

  it('STATIC-004：其餘 8×2 handler（非 target_load）未被本輪加入交易 API（範圍未擴大）', () => {
    for (const f of [...OTHER_HANDLERS_PG, ...OTHER_HANDLERS_MSSQL]) {
      const src = read(f);
      expect(src).not.toMatch(/startTransaction|commitTransaction|rollbackTransaction/);
    }
  });
});

// ===========================================================================
// §一 GATE-002 — isolation level 不得 READ UNCOMMITTED
// ===========================================================================
describe('P5g GATE — isolation level 守門', () => {
  it('GATE-002（MUST-FIX）：兩 handler 皆未將交易指定為 READ UNCOMMITTED（會使中間態對外可見、違反 §7.2）', () => {
    for (const f of [PG_HANDLER, MSSQL_HANDLER]) {
      const src = read(f).toUpperCase();
      expect(src).not.toMatch(/READ\s+UNCOMMITTED/);
      // 亦不得以 typeorm isolation 參數指定 READ UNCOMMITTED
      expect(src).not.toMatch(/"READ UNCOMMITTED"|'READ UNCOMMITTED'/);
    }
  });
});

// ===========================================================================
// §十一 REG-003 — dispatcher 分流不變
// ===========================================================================
describe('P5g REG — 回歸', () => {
  it('REG-003：PG 版 target-load-handler.ts 未被 MSSQL 化（無 getMssqlTempTableColumns / IDENTITY(INT）', () => {
    expect(read(PG_HANDLER)).not.toMatch(/getMssqlTempTableColumns|IDENTITY\(INT/);
  });
});

// ===========================================================================
// 決策關卡文件守門（impl log 必含對應段落）
// ===========================================================================
describe('P5g 決策關卡 — impl log 文件守門', () => {
  it('GATE-001（doc）：impl log 記錄交易管理位置選擇（handler-only）與理由', () => {
    expect(readImplLog()).toMatch(/GATE-001|handler-only|handler 內/i);
  });

  it('GATE-003/004（doc）：impl log 記錄 harness 沿用 + 暫存表建立時機（交易外）決策', () => {
    const log = readImplLog();
    expect(log).toMatch(/GATE-004|交易外|暫存表.*交易/);
  });

  it('SCOPE-005（doc，7.8M 規模決策）：impl log 記錄單條 INSERT vs 分批之決策與理由', () => {
    const log = readImplLog();
    expect(log).toMatch(/SCOPE-005|7\.8M|分批|單條 INSERT/);
  });

  it('UPSERTATOMIC-003（doc，範圍缺口）：impl log 記錄 UPSERT 路徑不變式文字缺口 + 主動納入理由', () => {
    const log = readImplLog();
    expect(log).toMatch(/UPSERT/);
    expect(log).toMatch(/★發現\s*1|不變式.*文字|文字未涵蓋|範圍擴張/);
  });

  it('IMPACT-003（doc，防誤判回歸）：impl log 記錄 P5b ATOMIC 斷言由分支 A 翻轉為分支 B 之更新方式', () => {
    const log = readImplLog();
    expect(log).toMatch(/IMPACT-003|分支 A|分支 B|翻轉/);
  });

  it('ISO/CLEANUPTXN（doc）：impl log 記錄 MSSQL TRUNCATE 交易回滾實證 + catch rollback + Read Committed 結果', () => {
    const log = readImplLog();
    expect(log).toMatch(/TRUNCATE.*回滾|回滾.*TRUNCATE/);
    expect(log).toMatch(/rollback|回滾/i);
  });
});
