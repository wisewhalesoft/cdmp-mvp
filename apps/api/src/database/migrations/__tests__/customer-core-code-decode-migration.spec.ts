/**
 * SLICE 3 — F110 / US-173 `code_decode` pipeline definition 收斂之驗證測試
 * （AD-E07-41-P4-codedecode-test.md 七、MIGRATION 群組；DB-agnostic：純 parse + assert，無 live DB）。
 *
 * 對照 tdd-implementation 依 AD-E07-41 §13.6.1 編輯完成之 `etl-pipelines.json`（GATE-004：
 * 以實際 JSON + F110 §7.2/§14 對應規則為準）。原始 31 個 lookup 之語意快照存於
 * `__fixtures__/customer-core-pre-collapse.json`（收斂前擷取），作為決定性雙向對應（bijection）之
 * ground truth。
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { describe, it, expect } from 'vitest';

import {
  CUSTOMER_CORE_CODE_DECODE_DEFINITION,
  CUSTOMER_CORE_NEW_STEP_COUNT,
  CUSTOMER_CORE_NEW_VERSION,
  CUSTOMER_CORE_PRE_MIGRATION_VERSION,
  CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT,
  CUSTOMER_CORE_PIPELINE_NAME_EXPORT,
} from '../shared/customer-core-code-decode-definition';
import { UpdateCustomerCoreCodeDecode1751884800003 } from '../1751884800003-UpdateCustomerCoreCodeDecode';
import { MssqlUpdateCustomerCoreCodeDecode1751884800003 } from '../mssql/1751884800003-MssqlUpdateCustomerCoreCodeDecode';

// migration WHERE 子句用之 pipeline 名稱維持英文（歷史一次性 data-update，針對既有英文部署）；
// 與 shared 模組 CUSTOMER_CORE_PIPELINE_NAME_EXPORT 對齊。json 定位改以 target_load=customer_core。
const PIPELINE_NAME = 'ETL for Customer Core';
const ETL_JSON_PATH = resolve(__dirname, '..', '..', 'seeds', 'data', 'etl-pipelines.json');

const fixture: any = JSON.parse(
  readFileSync(resolve(__dirname, '__fixtures__', 'customer-core-pre-collapse.json'), 'utf-8'),
);

function loadCustomerCorePipeline(): any {
  const all = JSON.parse(readFileSync(ETL_JSON_PATH, 'utf-8'));
  // ⚠️ pipeline 顯示名已改中文（客戶資料 ETL，以 dev CDMP 為主）；以 target_load 目標表
  //    `customer_core` 定位（穩定、脫離顯示名）。
  const p = all.find((x: any) =>
    (x.definition?.nodes ?? []).some(
      (n: any) => n?.data?.nodeType === 'target_load' && n?.data?.targetTable === 'customer_core',
    ),
  );
  if (!p) throw new Error('pipeline (target_load=customer_core) not found');
  return p;
}

/** 遞迴排序 key 的規範化比較（避免 key 順序差異造成偽陰性）。 */
function canon(v: any): any {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((acc: any, k) => {
        acc[k] = canon(v[k]);
        return acc;
      }, {});
  }
  return v;
}

/** 由一個 code_decode 節點 + 其 mapping 反推回等價 lookup 節點之語意欄位（F110 §7.3）。 */
function reconstructLookup(node: any, mapping: any): any {
  const rec: any = {
    lookupSource: node.data.lookupSource,
    matchColumn: mapping.matchColumn,
    lookupMatchColumn: mapping.lookupMatchColumn,
    outputColumns: mapping.outputColumns,
    noMatchStrategy: 'null',
  };
  if (mapping.filter !== undefined) rec.lookupFilter = mapping.filter;
  if (node.data.lookupRef !== undefined) rec.lookupRef = node.data.lookupRef;
  if (node.data.lookupSourceId !== undefined) rec.lookupSourceId = node.data.lookupSourceId;
  return rec;
}

describe('F110 code_decode migration — customer_core pipeline definition 收斂', () => {
  const pipeline = loadCustomerCorePipeline();
  const nodes: any[] = pipeline.definition.nodes;
  const edges: any[] = pipeline.definition.edges;
  const nodeById: Record<string, any> = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const cdNodes = nodes.filter((n) => n.data.nodeType === 'code_decode');
  const collapseGroups: Array<{ newNodeId: string; dictSource: string; replaced: string[] }> =
    fixture.collapseGroups as any;

  // ── DAG 完整性 ──────────────────────────────────────────────
  describe('valid JSON + valid DAG（無 dangling edge）', () => {
    it('etl-pipelines.json 為合法 JSON 且 definition 具 nodes/edges', () => {
      expect(Array.isArray(nodes)).toBe(true);
      expect(Array.isArray(edges)).toBe(true);
    });

    it('每條 edge 之 source/target 皆指向存在的節點（無 dangling）', () => {
      const idSet = new Set(nodes.map((n) => n.id));
      for (const e of edges) {
        expect(idSet.has(e.source), `dangling source ${e.source}`).toBe(true);
        expect(idSet.has(e.target), `dangling target ${e.target}`).toBe(true);
      }
    });

    it('節點 id 唯一', () => {
      expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-002 ───────────────────
  describe('TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-002：節點/mapping 計數', () => {
    it('code_decode 節點恰 9 個', () => {
      expect(cdNodes.length).toBe(9);
    });

    it('lookup 節點 0 個（31 個收斂範圍內的 lookup 全數移除）', () => {
      expect(nodes.filter((n) => n.data.nodeType === 'lookup').length).toBe(0);
    });

    it('9 個 code_decode 之 mappings 總和恰 31', () => {
      const total = cdNodes.reduce((a, n) => a + n.data.mappings.length, 0);
      expect(total).toBe(31);
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-001 + 決定性雙向 bijection ──
  describe('TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-001：9 節點逐一符合 §7.2 正向對應 + 31 lookup 逐格重建（bijection）', () => {
    it('每個 collapse 群組對應一個 code_decode 節點，mappings 數 = 收斂之 lookup 數', () => {
      for (const g of collapseGroups) {
        const node = nodeById[g.newNodeId];
        expect(node, `missing node ${g.newNodeId}`).toBeDefined();
        expect(node.data.nodeType).toBe('code_decode');
        expect(node.data.lookupSource).toBe(g.dictSource);
        expect(node.data.mappings.length).toBe(g.replaced.length);
      }
    });

    it('正向：每個 mapping 逐格重建其取代之原始 lookup（零重塑）', () => {
      for (const g of collapseGroups) {
        const node = nodeById[g.newNodeId];
        g.replaced.forEach((lookupId, i) => {
          const reconstructed = reconstructLookup(node, node.data.mappings[i]);
          const original = (fixture.originalLookups as any)[lookupId];
          expect(canon(reconstructed), `${g.newNodeId}.mappings[${i}] != ${lookupId}`).toEqual(
            canon(original),
          );
        });
      }
    });

    it('反向 + 完整性：所有 code_decode mapping 恰好對應原始 31 個 lookup（無多、無漏、無重複）', () => {
      const covered = collapseGroups.flatMap((g) => g.replaced);
      const originalIds = Object.keys(fixture.originalLookups as any);
      expect(covered.length).toBe(31);
      expect(new Set(covered).size).toBe(31);
      expect(covered.slice().sort()).toEqual(originalIds.slice().sort());
      // 節點級共用來源：mapping 內不得再帶自己的 lookupSource/lookupRef（下沉為節點級）
      for (const n of cdNodes) {
        for (const m of n.data.mappings) {
          expect(m.lookupSource).toBeUndefined();
          expect(m.lookupRef).toBeUndefined();
        }
      }
    });

    it('每個節點內 outputAlias 唯一（BR-8）', () => {
      for (const n of cdNodes) {
        const aliases = n.data.mappings.flatMap((m: any) =>
          m.outputColumns.map((c: any) => c.outputAlias),
        );
        expect(new Set(aliases).size).toBe(aliases.length);
      }
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-003（🔴 最容易誤判）──
  describe('TS-MSSQL-P4F-MIGRATION-DEFPAYLOAD-003：cd_mlmc{n}/cd_mlind{n} 因中途切換字典表正確拆為兩個節點', () => {
    const pairs = [
      ['cd_mlmc1', 'raw_8b80671e', 'cd_mlind1', 'raw_b9558d10'],
      ['cd_mlmc2', 'raw_9dd0eca5', 'cd_mlind2', 'raw_3acd58e7'],
      ['cd_mlmc3', 'raw_9dcaf414', 'cd_mlind3', 'raw_afe6a874'],
    ];
    it.each(pairs)('%s(3 mapping) 與 %s→%s(1 mapping) 為兩獨立節點且以 edge 相連', (mlmc, mlmcSrc, mlind, mlindSrc) => {
      const a = nodeById[mlmc];
      const b = nodeById[mlind];
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a.id).not.toBe(b.id);
      expect(a.data.lookupSource).toBe(mlmcSrc);
      expect(b.data.lookupSource).toBe(mlindSrc);
      expect(a.data.mappings.length).toBe(3);
      expect(b.data.mappings.length).toBe(1);
      const hasEdge = edges.some((e) => e.source === mlmc && e.target === mlind);
      expect(hasEdge, `expected edge ${mlmc} -> ${mlind}`).toBe(true);
    });
  });

  // ── edge 保留 + 每條 lookup 子鏈正確收斂 ──────────────────
  describe('原始非 lookup edge 全數保留 + 每條 lookup 子鏈正確收斂', () => {
    // 由原始 55 條 edge + collapse 群組獨立推導期望的 33 條新 edge
    const remap: Record<string, string> = {};
    for (const g of collapseGroups) for (const id of g.replaced) remap[id] = g.newNodeId;
    const r = (id: string) => remap[id] ?? id;

    const expectedEdges: any[] = [];
    for (const e of fixture.originalEdges as any[]) {
      const ns = r(e.source);
      const nt = r(e.target);
      if (ns === nt) continue; // 群組內部 edge → 收斂消失
      const o: any = { source: ns, target: nt };
      if (e.targetHandle !== undefined) o.targetHandle = e.targetHandle;
      expectedEdges.push(o);
    }

    const edgeKey = (e: any) => `${e.source}->${e.target}#${e.targetHandle ?? ''}`;

    it('新 edge 數 = 33（55 − 22 收斂 = 33）', () => {
      expect(edges.length).toBe(33);
      expect(expectedEdges.length).toBe(33);
    });

    it('實際 edge 集合 = 由原始 edge 獨立推導之期望集合', () => {
      const actual = edges.map(edgeKey).sort();
      const expected = expectedEdges.map(edgeKey).sort();
      expect(actual).toEqual(expected);
    });

    it('原始「非 lookup → 非 lookup」edge 逐條保留（含 targetHandle）', () => {
      const isLookup = (id: string) => id in remap;
      for (const e of fixture.originalEdges as any[]) {
        if (isLookup(e.source) || isLookup(e.target)) continue;
        const found = edges.some(
          (a) => a.source === e.source && a.target === e.target && (a.targetHandle ?? null) === (e.targetHandle ?? null),
        );
        expect(found, `preserved edge ${e.source}->${e.target} missing`).toBe(true);
      }
    });

    it('無任何 edge 指向已移除的 lookup 節點', () => {
      const lookupIds = new Set(Object.keys(remap));
      for (const e of edges) {
        expect(lookupIds.has(e.source)).toBe(false);
        expect(lookupIds.has(e.target)).toBe(false);
      }
    });
  });

  // ── STEPCOUNT / VERSION ──────────────────────────────────────
  describe('TS-MSSQL-P4F-MIGRATION-STEPCOUNT-001 / VERSION-001', () => {
    it('step_count = 34（56 − 31 + 9），非過時值 53、非收斂前 56', () => {
      expect(pipeline.step_count).toBe(34);
      expect(pipeline.step_count).not.toBe(53);
      expect(pipeline.step_count).not.toBe(56);
      expect(nodes.length).toBe(34); // 實際節點數與宣告值一致
    });

    it('version = 14（13 → 14）', () => {
      expect(pipeline.version).toBe(14);
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-DESCRIPTION-001 ──────────────────
  describe('TS-MSSQL-P4F-MIGRATION-DESCRIPTION-001：description 為乾淨 UTF-8 繁中', () => {
    it('不含 U+FFFD replacement char / mojibake', () => {
      expect(pipeline.description).not.toMatch(/�/);
      // 全部字元皆為合法可列印（無 C0 控制字元、無私用區代理殘骸）
      expect(pipeline.description).not.toMatch(/[ --]/);
    });

    it('語意涵蓋 customer_core 整合原意並補述 F110/US-173 收斂', () => {
      expect(pipeline.description).toContain('customer_core');
      expect(pipeline.description).toContain('code_decode');
      expect(pipeline.description).toMatch(/F110|US-173/);
      // 含繁體中文字元
      expect(pipeline.description).toMatch(/[一-鿿]/);
    });
  });

  // ── 共用模組 = migration 使用之同一 definition ──────────────
  describe('共用模組（single source of truth）', () => {
    it('CUSTOMER_CORE_CODE_DECODE_DEFINITION 與 etl-pipelines.json 之 definition 逐格一致', () => {
      expect(canon(CUSTOMER_CORE_CODE_DECODE_DEFINITION)).toEqual(canon(pipeline.definition));
    });

    it('匯出的 step_count/version 與 JSON 一致，pre-migration 為 13/53', () => {
      expect(CUSTOMER_CORE_NEW_STEP_COUNT).toBe(34);
      expect(CUSTOMER_CORE_NEW_VERSION).toBe(14);
      expect(CUSTOMER_CORE_PRE_MIGRATION_VERSION).toBe(13);
      expect(CUSTOMER_CORE_PRE_MIGRATION_STEP_COUNT).toBe(53);
      expect(CUSTOMER_CORE_PIPELINE_NAME_EXPORT).toBe(PIPELINE_NAME);
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-BYTEIDENTICAL-001（I-CODEDECODE-MIGRATION-01）──
  describe('TS-MSSQL-P4F-MIGRATION-BYTEIDENTICAL-001：PG／MSSQL 兩支 migration 共用同一 definition', () => {
    const pgSrc = readFileSync(resolve(__dirname, '..', '1751884800003-UpdateCustomerCoreCodeDecode.ts'), 'utf-8');
    const mssqlSrc = readFileSync(
      resolve(__dirname, '..', 'mssql', '1751884800003-MssqlUpdateCustomerCoreCodeDecode.ts'),
      'utf-8',
    );

    it('兩支 migration 皆自 shared 模組匯入 CUSTOMER_CORE_CODE_DECODE_DEFINITION', () => {
      expect(pgSrc).toMatch(/from '\.\/shared\/customer-core-code-decode-definition'/);
      expect(mssqlSrc).toMatch(/from '\.\.\/shared\/customer-core-code-decode-definition'/);
      expect(pgSrc).toContain('CUSTOMER_CORE_CODE_DECODE_DEFINITION');
      expect(mssqlSrc).toContain('CUSTOMER_CORE_CODE_DECODE_DEFINITION');
    });

    it('兩支 migration 皆不內嵌字面 definition（無 code_decode nodes 陣列硬編）', () => {
      expect(pgSrc).not.toContain('"nodeType": "code_decode"');
      expect(mssqlSrc).not.toContain('"nodeType": "code_decode"');
      expect(pgSrc).not.toContain("nodeType: 'code_decode'");
      expect(mssqlSrc).not.toContain("nodeType: 'code_decode'");
    });

    it('兩支 migration class 可建構且具 up/down + 正確 name', () => {
      const pg = new UpdateCustomerCoreCodeDecode1751884800003();
      const mssql = new MssqlUpdateCustomerCoreCodeDecode1751884800003();
      expect(typeof pg.up).toBe('function');
      expect(typeof pg.down).toBe('function');
      expect(typeof mssql.up).toBe('function');
      expect(typeof mssql.down).toBe('function');
      expect(pg.name).toBe('UpdateCustomerCoreCodeDecode1751884800003');
      expect(mssql.name).toBe('MssqlUpdateCustomerCoreCodeDecode1751884800003');
    });
  });

  // ── TS-MSSQL-P4F-MIGRATION-GLOBSCOPE-001 ────────────────────
  describe('TS-MSSQL-P4F-MIGRATION-GLOBSCOPE-001：共用模組不落入任一 migration glob', () => {
    // data-source.ts 之 glob：migrations/*.{ts,js}（單層 *）與 migrations/mssql/*.{ts,js}。
    // 單層 * 不跨 '/'，故 migrations/shared/*.ts 兩者皆不匹配。以「直屬目錄」判定等價其語意。
    const sharedFile = resolve(__dirname, '..', 'shared', 'customer-core-code-decode-definition.ts');
    const migrationsDir = resolve(__dirname, '..');
    const mssqlDir = resolve(__dirname, '..', 'mssql');

    it('shared 檔位於 migrations/shared/（非直屬 migrations/ 亦非 migrations/mssql/）', () => {
      expect(dirname(sharedFile)).not.toBe(migrationsDir);
      expect(dirname(sharedFile)).not.toBe(mssqlDir);
      expect(dirname(sharedFile)).toBe(resolve(migrationsDir, 'shared'));
    });

    it('模擬單層 * glob 展開：shared 檔不匹配任一 migration glob', () => {
      // migrations/*.{ts,js} 之 * = [^/\\]*（不跨目錄分隔）
      const rel = 'shared/customer-core-code-decode-definition.ts';
      const singleStar = /^[^/\\]*\.(ts|js)$/;
      expect(singleStar.test(rel)).toBe(false); // 含 '/'，單層 * 無法匹配
    });
  });
});
