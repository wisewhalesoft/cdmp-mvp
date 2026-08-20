/**
 * resolveListGroup() — F120 / US-184 GROUP-RESOLVE 純函式 unit tests
 *
 * 對應 spec：
 *   - F120 spec §5.2 GROUP-RESOLVE（權威演算法定義，6 步驟）
 *   - F120 spec §10.2 邊界案例矩陣
 *   - AC-LIST-06 / AC-LIST-06a（互斥且完備）/ AC-LIST-06b（決定性）
 *   - BR-1（唯一權威來源＝condition_payload，禁讀 prod_kind 衍生欄位，I-F120-04）
 *   - BR-2（互斥且完備，I-F120-01）
 *   - BR-3（operator 單一 fallback 落點，禁止本檔自寫 `?? 'in'`）
 *   - AD-E07-51 §4.2 / §8：`resolveListGroup()` 為純函式，匯入既有
 *     `resolveCategoricalOperator`（`stage1-query-composer.ts`），不新建第三個 fallback 落點
 *     （I-LISTOVW-OPERATOR-SINGLE-SOURCE-01 / I-LISTOVW-PURE-GROUP-RESOLVE-01）
 *   - §9 測試邊界建議：TC-F120-A（重複值去重仍為單一代碼）/ TC-F120-B（operator 缺漏 vs 顯式
 *     'in' 判定相同）/ TC-F120-E（grep 反向斷言：不讀 .prod_kind、不自寫 operator fallback）
 *
 * ⚠️ Blindness：本檔僅依 spec §5.2 之虛擬碼撰寫，未讀取任何 F120 production 程式碼。
 * `../stage0-list-group-resolve` 尚不存在（AD-E07-51 §4.2 規劃之新檔），本檔預期為 RED。
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line import/no-unresolved
import { resolveListGroup } from '../stage0-list-group-resolve';
import type {
  ObListDefinitionConditionPayload,
  ObListDefinitionConditionItem,
} from '@/database/entities/ob-list-definition.entity';

function payload(
  conditions: ObListDefinitionConditionItem[],
): ObListDefinitionConditionPayload {
  return { logic: 'AND', conditions };
}

function prodKindIn(
  values: string[],
  operator?: 'in',
): ObListDefinitionConditionItem {
  return {
    columnName: 'prod_kind',
    fieldType: 'categorical',
    values,
    ...(operator ? { operator } : {}),
  };
}

function prodKindText(
  operator: 'contains' | 'not_contains' | 'equals',
  keyword: string,
): ObListDefinitionConditionItem {
  return { columnName: 'prod_kind', fieldType: 'categorical', operator, keyword };
}

describe('resolveListGroup（F120 §5.2 GROUP-RESOLVE，純函式）', () => {
  // =====================================================================
  // 步驟 1：payload 本身為空
  // =====================================================================
  describe('步驟 1：payload 為空 → UNCLASSIFIED', () => {
    it('payload === null → unclassified', () => {
      expect(resolveListGroup(null)).toEqual({ groupType: 'unclassified' });
    });
    it('payload === undefined → unclassified', () => {
      expect(resolveListGroup(undefined)).toEqual({ groupType: 'unclassified' });
    });
    it('payload.conditions 非陣列 → unclassified', () => {
      const bad = { logic: 'AND', conditions: null } as unknown as ObListDefinitionConditionPayload;
      expect(resolveListGroup(bad)).toEqual({ groupType: 'unclassified' });
    });
    it('payload.conditions 長度為 0 → unclassified', () => {
      expect(resolveListGroup(payload([]))).toEqual({ groupType: 'unclassified' });
    });
  });

  // =====================================================================
  // 步驟 2：找不到 columnName === 'prod_kind' 之項目
  // =====================================================================
  describe('步驟 2a：無 prod_kind 條件項 → UNCLASSIFIED（TC-184-05 之「未設定」分支）', () => {
    it('僅含其他欄位條件（無 prod_kind）→ unclassified', () => {
      const p = payload([
        { columnName: 'case_status', fieldType: 'categorical', values: ['01'] },
      ]);
      expect(resolveListGroup(p)).toEqual({ groupType: 'unclassified' });
    });
  });

  // =====================================================================
  // 步驟 2b：多筆 prod_kind 條件（防禦）→ last-wins
  // =====================================================================
  describe('步驟 2b：多筆 prod_kind 條件（防禦性，鏡射 deriveBackwardCompatColumns）', () => {
    it('兩筆 prod_kind 條件 → 取最後一筆判定（第一筆單一代碼、最後一筆多值 → multi）', () => {
      const p = payload([
        prodKindIn(['01']),
        prodKindIn(['01', '02']),
      ]);
      expect(resolveListGroup(p)).toEqual({ groupType: 'multi' });
    });
    it('兩筆 prod_kind 條件（反向：第一筆多值、最後一筆單一代碼）→ 取最後一筆 → code', () => {
      const p = payload([
        prodKindIn(['01', '02']),
        prodKindIn(['03']),
      ]);
      expect(resolveListGroup(p)).toEqual({ groupType: 'code', optionValue: '03' });
    });
  });

  // =====================================================================
  // 步驟 3：防禦 — fieldType !== 'categorical'
  // =====================================================================
  describe('步驟 3：prod_kind 條件之 fieldType 非 categorical（防禦）→ unclassified', () => {
    it('fieldType 誤植為 numeric → unclassified，不 crash', () => {
      const p = payload([
        { columnName: 'prod_kind', fieldType: 'numeric', min: 1, max: 2 } as unknown as ObListDefinitionConditionItem,
      ]);
      expect(resolveListGroup(p)).toEqual({ groupType: 'unclassified' });
    });
  });

  // =====================================================================
  // 步驟 4/5：operator 解析 + 文字運算子 → UNCLASSIFIED
  // =====================================================================
  describe('步驟 4/5：文字運算子（TC-184-05）→ UNCLASSIFIED', () => {
    it("operator='contains' → unclassified", () => {
      expect(resolveListGroup(payload([prodKindText('contains', '02')]))).toEqual({
        groupType: 'unclassified',
      });
    });
    it("operator='not_contains' → unclassified", () => {
      expect(resolveListGroup(payload([prodKindText('not_contains', '03')]))).toEqual({
        groupType: 'unclassified',
      });
    });
    it("operator='equals' → unclassified", () => {
      expect(resolveListGroup(payload([prodKindText('equals', '01')]))).toEqual({
        groupType: 'unclassified',
      });
    });
  });

  // =====================================================================
  // TC-F120-B：operator 缺漏 ≡ 'in'（單一 fallback，AC-LIST-06b）
  // =====================================================================
  describe("TC-F120-B：operator 缺漏視為 'in'，判定結果與顯式 operator:'in' 相同（AC-LIST-06b）", () => {
    it("operator 缺漏 + values=['01'] → code '01'（與顯式 'in' 相同結果）", () => {
      const implicit = resolveListGroup(payload([prodKindIn(['01'])]));
      const explicit = resolveListGroup(payload([prodKindIn(['01'], 'in')]));
      expect(implicit).toEqual({ groupType: 'code', optionValue: '01' });
      expect(explicit).toEqual({ groupType: 'code', optionValue: '01' });
      expect(implicit).toEqual(explicit);
    });
  });

  // =====================================================================
  // 步驟 6a：values 非陣列
  // =====================================================================
  describe('步驟 6a：values 非陣列（防禦）→ unclassified', () => {
    it('values 為 undefined（in 運算子但缺 values）→ unclassified，不 crash', () => {
      const p = payload([
        { columnName: 'prod_kind', fieldType: 'categorical', operator: 'in' },
      ]);
      expect(resolveListGroup(p)).toEqual({ groupType: 'unclassified' });
    });
  });

  // =====================================================================
  // 步驟 6c：空可選值清單
  // =====================================================================
  describe('步驟 6c：values=[]（§10.2「產品類別條件存在但未選任何值」）→ unclassified', () => {
    it('values=[] → unclassified，不視為多值、不 crash', () => {
      expect(resolveListGroup(payload([prodKindIn([])]))).toEqual({
        groupType: 'unclassified',
      });
    });
  });

  // =====================================================================
  // 步驟 6d：單一代碼（含 TC-F120-A 重複值去重）
  // =====================================================================
  describe('步驟 6d：單一代碼 → code（TC-184-03；TC-F120-A 重複值去重）', () => {
    it("values=['01'] → { groupType:'code', optionValue:'01' }", () => {
      expect(resolveListGroup(payload([prodKindIn(['01'])]))).toEqual({
        groupType: 'code',
        optionValue: '01',
      });
    });
    it("TC-F120-A：values=['01','01']（重複值）去重後仍為單一代碼 → code '01'（非 multi）", () => {
      expect(resolveListGroup(payload([prodKindIn(['01', '01'])]))).toEqual({
        groupType: 'code',
        optionValue: '01',
      });
    });
    it("values=['01','01','01']（三重複）→ 仍為 code '01'", () => {
      expect(resolveListGroup(payload([prodKindIn(['01', '01', '01'])]))).toEqual({
        groupType: 'code',
        optionValue: '01',
      });
    });
    it("不做大小寫／全半形折疊：values=['01','1']（不同字串，非重複）→ 視為 2 個相異代碼 → multi（BR-3 精神）", () => {
      // '01' 與 '1' 為不同字串，去重不應合併二者；驗證演算法採「精確字串相等」去重，
      // 而非數值正規化，否則會誤將原本不同的代碼判為重複。
      expect(resolveListGroup(payload([prodKindIn(['01', '1'])]))).toEqual({
        groupType: 'multi',
      });
    });
    it('保持首次出現順序去重（結果仍恰為單一代碼，行為不受順序影響）', () => {
      const a = resolveListGroup(payload([prodKindIn(['02', '02'])]));
      const b = resolveListGroup(payload([prodKindIn(['02'])]));
      expect(a).toEqual(b);
      expect(a).toEqual({ groupType: 'code', optionValue: '02' });
    });
  });

  // =====================================================================
  // 步驟 6e：多值 → MULTI（TC-184-04）
  // =====================================================================
  describe('步驟 6e：兩個以上代碼 → multi（TC-184-04；不得同時計入個別分組）', () => {
    it("values=['01','02'] → { groupType:'multi' }", () => {
      expect(resolveListGroup(payload([prodKindIn(['01', '02'])]))).toEqual({
        groupType: 'multi',
      });
    });
    it("values=['01','02','03'] → multi", () => {
      expect(resolveListGroup(payload([prodKindIn(['01', '02', '03'])]))).toEqual({
        groupType: 'multi',
      });
    });
  });

  // =====================================================================
  // 未登錄代碼（孤兒代碼）— 分組判定與白名單狀態無關（僅影響標籤/排序，見 §5.4）
  // =====================================================================
  describe('未登錄代碼（TC-F120-C 之判定面）：孤兒代碼仍回傳 code，判定不查白名單', () => {
    it("values=['09']（未登錄代碼）→ 仍回傳 { groupType:'code', optionValue:'09' }（不因白名單狀態而 unclassified）", () => {
      expect(resolveListGroup(payload([prodKindIn(['09'])]))).toEqual({
        groupType: 'code',
        optionValue: '09',
      });
    });
  });

  // =====================================================================
  // 決定性（AC-LIST-06b）：同一 payload 任何時候呼叫結果相同
  // =====================================================================
  describe('AC-LIST-06b 決定性：同一 payload 多次呼叫結果相同（結構相等）', () => {
    it('同一 payload 連續呼叫 5 次，結果逐次相等', () => {
      const p = payload([prodKindIn(['01', '02'])]);
      const results = Array.from({ length: 5 }, () => resolveListGroup(p));
      results.forEach((r) => expect(r).toEqual(results[0]));
    });
  });

  // =====================================================================
  // I-F120-01 互斥且完備之基礎：全函式，任何輸入皆回傳恰好一個 groupKey
  // =====================================================================
  describe('I-F120-01 之依建構成立基礎：全函式，回傳值恰為三型之一', () => {
    const cases: Array<[string, ObListDefinitionConditionPayload | null | undefined]> = [
      ['null', null],
      ['undefined', undefined],
      ['空 conditions', payload([])],
      ['單一代碼', payload([prodKindIn(['01'])])],
      ['多值', payload([prodKindIn(['01', '02'])])],
      ['文字運算子', payload([prodKindText('contains', 'x')])],
      ['無 prod_kind 條件', payload([{ columnName: 'case_status', fieldType: 'categorical', values: ['01'] }])],
    ];
    it.each(cases)('%s → 回傳值必為 { groupType: code|multi|unclassified } 之一', (_label, p) => {
      const r = resolveListGroup(p);
      expect(['code', 'multi', 'unclassified']).toContain(r.groupType);
      if (r.groupType === 'code') {
        expect(typeof r.optionValue).toBe('string');
      }
    });
  });

  // =====================================================================
  // TC-F120-E / I-F120-04 / I-LISTOVW-OPERATOR-SINGLE-SOURCE-01：grep 反向斷言
  // =====================================================================
  describe('TC-F120-E：grep 反向斷言（原始碼層級不變式，AD-E07-51 §8/§9）', () => {
    const sourcePath = path.resolve(__dirname, '../stage0-list-group-resolve.ts');
    let source: string;

    it('原始碼檔案存在（前置條件；不存在時視為未實作，屬預期 RED）', () => {
      expect(fs.existsSync(sourcePath)).toBe(true);
      source = fs.readFileSync(sourcePath, 'utf-8');
    });

    it("I-F120-04 / BR-1：不得出現 `.prod_kind` 之 entity 欄位存取（僅允許 columnName === 'prod_kind' 字串比對）", () => {
      source = fs.readFileSync(sourcePath, 'utf-8');
      // 允許：`columnName === 'prod_kind'`、`c.columnName === 'prod_kind'`（字串比對）
      // 禁止：`l.prod_kind` / `list.prod_kind` / `.prod_kind` 之屬性存取（entity 衍生欄位讀取）
      expect(source).not.toMatch(/\.prod_kind\b/);
    });

    it("I-LISTOVW-OPERATOR-SINGLE-SOURCE-01：不得自行撰寫 `operator ?? 'in'` 或等義之第二個 fallback 落點", () => {
      source = fs.readFileSync(sourcePath, 'utf-8');
      expect(source).not.toMatch(/\?\?\s*['"]in['"]/);
      expect(source).not.toMatch(/\|\|\s*['"]in['"]/);
    });

    it('I-LISTOVW-OPERATOR-SINGLE-SOURCE-01：須匯入既有 resolveCategoricalOperator（stage1-query-composer 單一落點）', () => {
      source = fs.readFileSync(sourcePath, 'utf-8');
      expect(source).toMatch(/resolveCategoricalOperator/);
      expect(source).toMatch(/stage1-query-composer/);
    });

    it('I-LISTOVW-PURE-GROUP-RESOLVE-01：純函式特徵 — 不得匯入任何 Repository / DataSource / TypeORM 裝饰器', () => {
      source = fs.readFileSync(sourcePath, 'utf-8');
      expect(source).not.toMatch(/@InjectRepository/);
      expect(source).not.toMatch(/from ['"]typeorm['"]/);
    });
  });
});
