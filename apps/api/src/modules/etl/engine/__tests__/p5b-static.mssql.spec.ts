/**
 * AD-E07-43 P5b — 靜態事實鎖定 + 決策關卡文件守門（CI 恆跑，不需 MSSQL）。
 *
 * 覆蓋：§三 HANDLERTYPES-001｜§五 PARTITION-004｜§七 ISTESTRUN-001｜§十二 REG-002/REG-006(doc)
 *        §十三 STATIC-001..006｜§一 GATE-005｜§六 ATOMIC-006(doc)｜§八 FIELD-003(doc)｜GATE-001(doc)
 *
 * 全部純 fs / JSON 讀取，無真實連線；故不 gate、CI 每 lane 恆跑。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HERE = __dirname;
const PIPELINE_JSON = path.resolve(HERE, '../../../../database/seeds/data/etl-pipelines.json');
const IMPL_LOG = path.resolve(HERE, '../../../../../../../docs/specs/implementation-log/AD-E07-43-P5b-impl.md');

const PIPELINE_NAMES: Record<string, string> = {
  arreturndf: 'E07-OBARRETURNDF_MIN_CAP-Load',
  calendar: 'E07-OBCALENDAR-Load',
  emphire: 'E07-OBEMPHIRE-Load',
  pooldata: 'E07-OBPOOLDATA-Load',
  pooldata_list: 'E07-OBPOOLDATA_LIST-Load',
};

// ⚠️ pipeline 顯示名已改中文（以 dev CDMP 為主）；一律以 target_load 目標表定位（穩定、脫離顯示名）。
//    PIPELINE_NAMES 保留為 key 集合/文件用途。
const PIPELINE_TARGETS: Record<string, string> = {
  arreturndf: 'ob_arreturndf_min_cap',
  calendar: 'ob_calendar',
  emphire: 'ob_emphire',
  pooldata: 'ob_pool_data',
  pooldata_list: 'ob_pool_data_list',
};

function loadAll(): any[] {
  return JSON.parse(fs.readFileSync(PIPELINE_JSON, 'utf8'));
}
function pipe(key: string): any {
  const target = PIPELINE_TARGETS[key];
  const p = loadAll().find((x) =>
    (x.definition?.nodes ?? []).some(
      (n: any) => n?.data?.nodeType === 'target_load' && n?.data?.targetTable === target,
    ),
  );
  if (!p) throw new Error(`找不到 target_load=${target} 之 pipeline`);
  return p;
}
function fm1(key: string): any {
  return pipe(key).definition.nodes.find((n: any) => n.data.nodeType === 'field_mapping');
}
function tl1(key: string): any {
  return pipe(key).definition.nodes.find((n: any) => n.data.nodeType === 'target_load');
}
function readImplLog(): string {
  return fs.existsSync(IMPL_LOG) ? fs.readFileSync(IMPL_LOG, 'utf8') : '';
}

// ===========================================================================
// §十三 STATIC — 事實鎖定
// ===========================================================================
describe('P5b STATIC — 事實鎖定', () => {
  it('STATIC-001：5 條 pipeline 節點/邊/nodeType 分佈鎖定（16 節點 11 邊）', () => {
    const dist: Record<string, number> = {};
    let nodes = 0;
    let edges = 0;
    for (const key of Object.keys(PIPELINE_NAMES)) {
      const def = pipe(key).definition;
      nodes += def.nodes.length;
      edges += def.edges.length;
      for (const n of def.nodes) dist[n.data.nodeType] = (dist[n.data.nodeType] ?? 0) + 1;
    }
    expect(nodes).toBe(16);
    expect(edges).toBe(11);
    expect(dist).toEqual({ raw_data_extract: 5, field_mapping: 5, conditional: 1, target_load: 5 });
  });

  it('STATIC-002：5 張 raw fixture 表名鎖定', () => {
    const raws = Object.keys(PIPELINE_NAMES).map(
      (k) => pipe(k).definition.nodes.find((n: any) => n.data.nodeType === 'raw_data_extract').data.rawTable,
    );
    expect(new Set(raws)).toEqual(
      new Set(['raw_970da79c', 'raw_dfb3b313', 'raw_e1e951d7', 'raw_6d58393b', 'raw_33dc3771']),
    );
  });

  it('STATIC-003 / ISTESTRUN-001（MUST-FIX）：e2e/eqpg spec 中 isTestRun: true 僅出現於 ISTESTRUN 陷阱脈絡', () => {
    for (const f of ['p5b-e2e.mssql.spec.ts', 'p5b-eqpg.mssql.spec.ts']) {
      const src = fs.readFileSync(path.resolve(HERE, f), 'utf8');
      const matches = src.match(/isTestRun:\s*true/g) ?? [];
      // e2e 僅 ISTESTRUN-002/003 兩處；eqpg 零處
      if (f === 'p5b-e2e.mssql.spec.ts') expect(matches.length).toBe(2);
      else expect(matches.length).toBe(0);
    }
  });

  it('STATIC-004：凍結檔（pipeline-runner / node-dispatcher）未被 ATOMIC 修法異動（P5g handler-only 決策）', () => {
    // ⚠️ P5g 解凍 target-load-handler-mssql.ts（加交易包裝，見 p5g STATIC-001）；本斷言僅保留
    //    pipeline-runner / node-dispatcher 之凍結守門——P5g GATE-001 選 handler-only，兩檔續凍。
    for (const rel of ['../pipeline-runner.ts', '../node-dispatcher.ts']) {
      const src = fs.readFileSync(path.resolve(HERE, rel), 'utf8');
      expect(src).not.toMatch(/P5b|AD-E07-43/);
    }
  });

  it('STATIC-005：5 張目標表 PK 集合鎖定', () => {
    const expectPk: Record<string, string[]> = {
      arreturndf: ['appl_no'],
      calendar: ['calendar_date'],
      emphire: ['emp_id'],
      pooldata: ['orgno', 'appl_no'],
      pooldata_list: ['list_no', 'orgno', 'appl_no'],
    };
    // 目標表名鎖定（PK 集合真實核對於 e2e GATE-004 對真庫）
    const expectTarget: Record<string, string> = {
      arreturndf: 'ob_arreturndf_min_cap',
      calendar: 'ob_calendar',
      emphire: 'ob_emphire',
      pooldata: 'ob_pool_data',
      pooldata_list: 'ob_pool_data_list',
    };
    for (const key of Object.keys(expectPk)) {
      expect(tl1(key).data.targetTable).toBe(expectTarget[key]);
    }
  });

  it('STATIC-006（★發現 5 修正）：pooldata_list field_mapping 僅 score 未映射；其餘 6 個月名單分派欄位皆有映射', () => {
    const targets = new Set<string>(fm1('pooldata_list').data.mappings.map((m: any) => m.targetColumn));
    // 測試設計 ★發現 5 宣稱 7 欄皆不在 field_mapping；經 etl-pipelines.json 逐一核對，實際僅 score 未映射。
    expect(targets.has('score')).toBe(false);
    for (const c of ['assignday', 'card_level', 'tier_level', 'cr_id', 'cr_nm', 'is_cr']) {
      expect(targets.has(c)).toBe(true);
    }
  });
});

// ===========================================================================
// §一 GATE-005 / §三 HANDLERTYPES-001 / §五 PARTITION-004
// ===========================================================================
describe('P5b 設定值鎖定 / handler 類型 / partition 欄位排除', () => {
  it('GATE-005：4 條 fullMode + 1 條 partition_replace 設定鎖定', () => {
    for (const key of ['arreturndf', 'calendar', 'emphire', 'pooldata']) {
      expect(tl1(key).data.fullMode).toBe(true);
      expect(tl1(key).data.loadMode).toBeUndefined();
    }
    const pl = tl1('pooldata_list').data;
    expect(pl.loadMode).toBe('partition_replace');
    expect(pl.partitionColumn).toBe('data_source');
    expect(pl.partitionValue).toBe('etl_load');
    expect(pl.fullMode).toBeUndefined();
  });

  it('HANDLERTYPES-001：5 條合計僅用 4 種 nodeType，不含 lookup/merge/dedup/type_cast', () => {
    const used = new Set<string>();
    for (const key of Object.keys(PIPELINE_NAMES)) {
      for (const n of pipe(key).definition.nodes) used.add(n.data.nodeType);
    }
    expect(used).toEqual(new Set(['raw_data_extract', 'field_mapping', 'conditional', 'target_load']));
    for (const absent of ['lookup', 'merge', 'dedup', 'type_cast', 'derived_field']) {
      expect(used.has(absent)).toBe(false);
    }
  });

  it('PARTITION-004：score / data_source 不在 pooldata_list field_mapping（partitionColumn 另行 stamp）', () => {
    const targets = new Set<string>(fm1('pooldata_list').data.mappings.map((m: any) => m.targetColumn));
    expect(targets.has('score')).toBe(false);
    expect(targets.has('data_source')).toBe(false);
  });
});

// ===========================================================================
// §十二 REG-002 — PG 版 handler 未被 mssql 化
// ===========================================================================
describe('P5b REG — PG 路徑不變', () => {
  it('REG-002：PG 版 target-load-handler.ts 未含 MSSQL 專屬內省（getMssqlTempTableColumns / IDENTITY(INT）', () => {
    const pg = fs.readFileSync(path.resolve(HERE, '../handlers/target-load-handler.ts'), 'utf8');
    expect(pg).not.toMatch(/getMssqlTempTableColumns|IDENTITY\(INT/);
  });
});

// ===========================================================================
// 決策關卡文件守門（impl log 必含對應段落）
// ===========================================================================
describe('P5b 決策關卡 — impl log 文件守門', () => {
  it('GATE-001（doc）：impl log 記錄 raw 欄位清單程式化衍生方法', () => {
    expect(readImplLog()).toMatch(/GATE-001|程式化衍生|deriveRawColumns/);
  });

  it('ATOMIC-006（doc）：impl log 以顯著段落記錄 ATOMIC probe 結論（資料遺失分支 A/B）', () => {
    const log = readImplLog();
    expect(log).toMatch(/ATOMIC/);
    expect(log).toMatch(/分支\s*A|資料遺失|data loss/i);
  });

  it('FIELD-003（doc）：impl log 記錄 ob_emphire resign_date 哨兵→NULL 與既有記憶之張力', () => {
    expect(readImplLog()).toMatch(/resign_date|哨兵|sentinel/i);
  });

  it('REG-006（doc）：impl log 記錄 CDMP_P5B 獨立庫隔離策略', () => {
    expect(readImplLog()).toMatch(/CDMP_P5B/);
  });

  it('★發現 5（doc）：impl log 記錄 field_mapping 6 個月名單分派欄位映射修正', () => {
    expect(readImplLog()).toMatch(/★發現\s*5|發現 5|assignday|score/);
  });
});
