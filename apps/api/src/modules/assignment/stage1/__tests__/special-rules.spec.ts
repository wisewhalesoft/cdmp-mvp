/**
 * special-rules.ts — F095 deriveAppliedSpecialRules + F091/F095 共用 trigger pure utility 單元測試
 *
 * 對應測試設計：
 *   - F095-test DR-001~007（推導正確性）/ CON-001（共用 utility 靜態驗證）/ CON-003（v1.0 誤判防回退）
 *   - F095 AC-1~AC-5 / AD-E07-26 §26.5（推導偽碼）/ F091 v2.0 §5.3 規則對照表
 *
 * mock 契約（memory feedback_mock_real_system_contract / F091 BR-8）：
 *   list_nm mock 含真實繁體中文（期中 / 機車 / 年以上 / 小資），bug fix 防回退含「中結」「年資」確認不誤判。
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import * as path from 'path';

import {
  deriveAppliedSpecialRules,
  matchesSpecialRule,
  type AppliedSpecialRule,
} from '../special-rules';

// ===========================================================================
// 一、deriveAppliedSpecialRules 推導正確性（DR-001~007）
// ===========================================================================

describe('F095 一、deriveAppliedSpecialRules（讀時推導）', () => {
  it('DR-001：一般名單 — 僅含 R-FRAUD-WHITEBOARD（無條件規則）', () => {
    const rules = deriveAppliedSpecialRules('一般催收名單');
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleId).toBe('R-FRAUD-WHITEBOARD');
    expect(rules[0].isSystemMandatory).toBe(true);
    expect(rules[0].ruleName).toBe('詐騙白牌排除');
    expect(rules[0].exclusionDescription).toMatch(/白牌/);
    expect(rules[0].exclusionDescription.length).toBeGreaterThan(0);
  });

  it('DR-002：含「期中機車」名單 — 含三條規則（fraud + motorcycle + xiaozi）', () => {
    const rules = deriveAppliedSpecialRules('機車期中催收名單');
    expect(rules.map((r) => r.ruleId)).toEqual([
      'R-FRAUD-WHITEBOARD',
      'R-PERIOD-MOTORCYCLE',
      'R-PERIOD-XIAOZI',
    ]);
    expect(rules.find((r) => r.ruleId === 'R-PERIOD-MOTORCYCLE')!.isSystemMandatory).toBe(false);
    expect(rules.find((r) => r.ruleId === 'R-PERIOD-XIAOZI')!.isSystemMandatory).toBe(false);
  });

  it('DR-003：含「期中」不含「機車」— 含兩條（fraud + xiaozi，不含 motorcycle）', () => {
    const rules = deriveAppliedSpecialRules('期中個人信貸名單');
    expect(rules.map((r) => r.ruleId)).toEqual(['R-FRAUD-WHITEBOARD', 'R-PERIOD-XIAOZI']);
    expect(rules.some((r) => r.ruleId === 'R-PERIOD-MOTORCYCLE')).toBe(false);
    expect(rules.find((r) => r.ruleId === 'R-PERIOD-XIAOZI')!.exclusionDescription).toMatch(/小資/);
  });

  it('DR-004：含「年以上」名單 — 含兩條（fraud + year-above）', () => {
    const rules = deriveAppliedSpecialRules('5年以上車主催收名單');
    expect(rules.map((r) => r.ruleId)).toEqual(['R-FRAUD-WHITEBOARD', 'R-YEAR-ABOVE']);
    const yearRule = rules.find((r) => r.ruleId === 'R-YEAR-ABOVE')!;
    expect(yearRule.isSystemMandatory).toBe(false);
    expect(yearRule.exclusionDescription).toMatch(/15年|出廠年份/);
  });

  it('DR-005：全觸發名單 — 含四條（fraud + motorcycle + xiaozi + year-above，依序）', () => {
    const rules = deriveAppliedSpecialRules('機車期中小資5年以上催收名單');
    expect(rules.map((r) => r.ruleId)).toEqual([
      'R-FRAUD-WHITEBOARD',
      'R-PERIOD-MOTORCYCLE',
      'R-PERIOD-XIAOZI',
      'R-YEAR-ABOVE',
    ]);
  });

  it('DR-006：含 v1.0 誤判字「中結強案年資」— 僅 R-FRAUD-WHITEBOARD（Regression）', () => {
    const rules = deriveAppliedSpecialRules('中結強案年資催收名單');
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleId).toBe('R-FRAUD-WHITEBOARD');
    expect(rules.some((r) => r.ruleId === 'R-PERIOD-MOTORCYCLE')).toBe(false);
    expect(rules.some((r) => r.ruleId === 'R-PERIOD-XIAOZI')).toBe(false);
    expect(rules.some((r) => r.ruleId === 'R-YEAR-ABOVE')).toBe(false);
  });

  it('DR-007：每筆規則欄位完整（ruleId / ruleName / isSystemMandatory / exclusionDescription）', () => {
    const rules = deriveAppliedSpecialRules('機車期中小資5年以上');
    const validIds: AppliedSpecialRule['ruleId'][] = [
      'R-FRAUD-WHITEBOARD',
      'R-PERIOD-MOTORCYCLE',
      'R-PERIOD-XIAOZI',
      'R-YEAR-ABOVE',
    ];
    for (const r of rules) {
      expect(validIds).toContain(r.ruleId);
      expect(typeof r.ruleName).toBe('string');
      expect(r.ruleName.length).toBeGreaterThan(0);
      expect(typeof r.isSystemMandatory).toBe('boolean');
      expect(typeof r.exclusionDescription).toBe('string');
      expect(r.exclusionDescription.length).toBeGreaterThan(0);
    }
    // R-FRAUD-WHITEBOARD 為 true，其餘為 false
    expect(rules.find((r) => r.ruleId === 'R-FRAUD-WHITEBOARD')!.isSystemMandatory).toBe(true);
    expect(
      rules.filter((r) => r.ruleId !== 'R-FRAUD-WHITEBOARD').every((r) => r.isSystemMandatory === false),
    ).toBe(true);
  });

  it('DR-008：list_nm 為 null / 空字串 → 僅 R-FRAUD-WHITEBOARD（AC-5 空集合防護）', () => {
    expect(deriveAppliedSpecialRules(null).map((r) => r.ruleId)).toEqual(['R-FRAUD-WHITEBOARD']);
    expect(deriveAppliedSpecialRules('').map((r) => r.ruleId)).toEqual(['R-FRAUD-WHITEBOARD']);
    expect(deriveAppliedSpecialRules(undefined).map((r) => r.ruleId)).toEqual(['R-FRAUD-WHITEBOARD']);
  });
});

// ===========================================================================
// 二、matchesSpecialRule trigger 判斷（SP 對照）
// ===========================================================================

describe('F095/F091 二、matchesSpecialRule trigger 判斷（SP 修正版）', () => {
  it('R-FRAUD-WHITEBOARD：無條件恆 true', () => {
    expect(matchesSpecialRule('任意名單', 'R-FRAUD-WHITEBOARD')).toBe(true);
    expect(matchesSpecialRule(null, 'R-FRAUD-WHITEBOARD')).toBe(true);
  });

  it('R-PERIOD-MOTORCYCLE：需同時含「期中」+「機車」', () => {
    expect(matchesSpecialRule('機車期中名單', 'R-PERIOD-MOTORCYCLE')).toBe(true);
    expect(matchesSpecialRule('期中名單', 'R-PERIOD-MOTORCYCLE')).toBe(false); // 缺機車
    expect(matchesSpecialRule('機車名單', 'R-PERIOD-MOTORCYCLE')).toBe(false); // 缺期中
  });

  it('R-PERIOD-XIAOZI：含「期中」即觸發', () => {
    expect(matchesSpecialRule('期中名單', 'R-PERIOD-XIAOZI')).toBe(true);
    expect(matchesSpecialRule('機車期中名單', 'R-PERIOD-XIAOZI')).toBe(true);
    expect(matchesSpecialRule('一般名單', 'R-PERIOD-XIAOZI')).toBe(false);
  });

  it('R-YEAR-ABOVE：含「年以上」即觸發', () => {
    expect(matchesSpecialRule('5年以上名單', 'R-YEAR-ABOVE')).toBe(true);
    expect(matchesSpecialRule('年資名單', 'R-YEAR-ABOVE')).toBe(false); // v1.0 誤判字不觸發
  });
});

// ===========================================================================
// 三、共用 pure utility 靜態驗證（CON-001：單一定義，防 drift）
// ===========================================================================

describe('F095 三、共用 trigger pure utility（CON-001）', () => {
  const CHAIN_SRC = readFileSync(
    path.resolve(__dirname, '../stage1-filter-chain.ts'),
    'utf8',
  );

  it('CON-001a：stage1-filter-chain.ts import 共用 matchesSpecialRule（非自行實作 trigger）', () => {
    expect(CHAIN_SRC).toMatch(/import\s*\{[^}]*matchesSpecialRule[^}]*\}\s*from\s*['"]\.\/special-rules['"]/);
    // chain 內以 matchesSpecialRule 判斷 trigger（而非自行 list_nm.includes('期中') 重複）
    expect(CHAIN_SRC).toMatch(/matchesSpecialRule\(\s*list(Nm|\.list_nm)?/);
  });

  it('CON-001b：trigger 觸發字「期中」/「機車」/「年以上」只定義於 special-rules.ts（chain 不重複定義）', () => {
    // chain 不應出現直接的 list_nm.includes('期中') 等 trigger 判斷（應委派 matchesSpecialRule）
    expect(CHAIN_SRC).not.toMatch(/list_nm.*includes\(\s*['"]期中['"]\s*\)/);
    expect(CHAIN_SRC).not.toMatch(/listNm\.includes\(\s*['"]期中['"]\s*\)/);
    expect(CHAIN_SRC).not.toMatch(/listNm\.includes\(\s*['"]年以上['"]\s*\)/);
  });
});
